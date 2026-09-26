"""Emissão da NFC-e de um pedido: decide se emite, monta a nota, chama o provedor e grava o resultado e a auditoria.

A decisão e a aplicação do resultado são funções puras (fáceis de testar); só `emit_order` e os cadastros falam com o banco.
"""
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings as app_settings
from app.core.database import AsyncSessionLocal
from app.models.fiscal import FiscalDefault, FiscalEvent, FiscalSettings
from app.models.order import Order
from app.models.product import Product
from app.schemas.fiscal import FiscalDefaultIn, FiscalSettingsIn
from app.services.fiscal.payload import build_nfce_payload
from app.services.fiscal.provider import EmitResult, FiscalProvider, get_provider
from app.services.fiscal.rules import FISCAL_FIELDS, merge_fiscal, missing_fields
from app.services.fiscal_golive import go_live_problems

log = logging.getLogger(__name__)

MAX_LISTED_PRODUCTS = 3


def settings_query():
    """Consulta única da linha de configuração; a ordem fixa garante que todos leiam a mesma linha."""
    return select(FiscalSettings).order_by(FiscalSettings.id).limit(1)


class EmissionDisabled(Exception):
    """A emissão fiscal está desligada ou sem dados da empresa: nada a fazer."""


@dataclass
class Skip:
    """Este pedido não emite agora. `status` é o que fica gravado no pedido (not_required ou pending)."""

    status: str
    reason: str


@dataclass
class Emission:
    payload: dict[str, Any]
    snapshots: dict[Any, dict[str, Any]]  # product_id -> dados fiscais usados (copiados para o item)


def _has_installment(order: Any) -> bool:
    payment_type = getattr(order.payment_type, "value", order.payment_type)
    if payment_type == "installment":
        return True
    return any(split.get("type") == "installment" for split in (order.payment_splits or []))


def _describe_pending(problems: list[tuple[Any, str, list[str]]]) -> str:
    parts = [f"{code} {name} ({', '.join(missing)})" for code, name, missing in problems[:MAX_LISTED_PRODUCTS]]
    text = "Produtos sem dados fiscais: " + "; ".join(parts)
    extra = len(problems) - MAX_LISTED_PRODUCTS
    return text + (f"; e mais {extra}" if extra > 0 else "")


def plan_emission(
    order: Any,
    fiscal_settings: Any,
    products_by_id: dict[Any, Any],
    defaults_by_category: dict[str, Any],
) -> Emission | Skip:
    if order.fiscal_status in ("authorized", "cancelled"):
        return Skip(order.fiscal_status, "NFC-e já autorizada" if order.fiscal_status == "authorized" else "NFC-e cancelada")
    status = getattr(order.status, "value", order.status)
    if status == "cancelled":
        return Skip("not_required", "Pedido cancelado")
    if _has_installment(order):
        return Skip("not_required", "Venda com fiado: a NFC-e não é emitida")
    if Decimal(order.total) <= 0:
        return Skip("not_required", "Pedido de valor zero: a NFC-e não é emitida")

    resolved: dict[Any, dict[str, Any]] = {}
    problems: list[tuple[Any, str, list[str]]] = []
    for item in order.items:
        product = products_by_id.get(item.product_id)
        if product is None:
            problems.append((item.product_code, item.product_name, ["produto removido"]))
            continue
        merged = merge_fiscal(product, defaults_by_category.get(product.category or ""))
        missing = missing_fields(merged)
        if missing:
            problems.append((item.product_code, item.product_name, missing))
        resolved[item.product_id] = merged
    if problems:
        return Skip("pending", _describe_pending(problems))

    try:
        payload = build_nfce_payload(order, fiscal_settings, resolved)
    except (ValueError, KeyError) as exc:
        return Skip("pending", f"Não foi possível montar a nota: {exc}")
    return Emission(payload=payload, snapshots=resolved)


def apply_skip(order: Any, skip: Skip) -> None:
    if order.fiscal_status in ("authorized", "cancelled"):
        return  # uma nota autorizada ou cancelada nunca volta atrás por um "não emite agora"
    order.fiscal_status = skip.status
    order.fiscal_error = skip.reason


def apply_result(order: Any, result: EmitResult, now: datetime | None = None) -> None:
    order.fiscal_status = result.status
    if result.status == "authorized":
        order.fiscal_protocol = result.protocol
        order.fiscal_qr_url = result.qr_url
        order.fiscal_xml_url = result.xml_url
        order.fiscal_emitted_at = now or datetime.now(timezone.utc)
        order.fiscal_error = None
        order.invoice_number = result.number
        order.invoice_series = result.series
        order.invoice_key = result.key
    else:
        order.fiscal_error = f"{result.code} - {result.message}" if result.code else result.message


async def run_emission(order: Any, emission: Emission, provider: FiscalProvider) -> EmitResult:
    """Chama o provedor e aplica o resultado no pedido. Nunca levanta: falha do provedor deixa a nota pendente."""
    order.fiscal_attempts = (order.fiscal_attempts or 0) + 1
    order.fiscal_reference = emission.payload["reference"]  # fixa: o cancelamento e a consulta usam a mesma
    for item in order.items:
        for field in FISCAL_FIELDS:
            setattr(item, field, emission.snapshots[item.product_id][field])
    try:
        result = await provider.emit_nfce(emission.payload)
    except Exception as exc:  # ProviderUnavailable e qualquer coisa que o adaptador deixe escapar
        log.warning("Emissão da NFC-e do pedido %s falhou: %s", order.order_number, exc)
        result = EmitResult(status="pending", message=f"Provedor indisponível: {exc}", raw={"exception": type(exc).__name__})
    apply_result(order, result)
    return result


async def emit_order(db: AsyncSession, order_id: uuid.UUID, provider: FiscalProvider, user_name: str) -> Order | None:
    order = (
        await db.execute(
            select(Order)
            .options(selectinload(Order.items), selectinload(Order.customer))
            .where(Order.id == order_id)
            .with_for_update(of=Order)  # dois cliques em "Tentar de novo" não emitem duas vezes
        )
    ).scalar_one_or_none()
    if order is None:
        return None
    fiscal_settings = (await db.execute(settings_query())).scalar_one_or_none()
    if fiscal_settings is None or not fiscal_settings.enabled:
        raise EmissionDisabled("Emissão fiscal desligada")
    products = (
        await db.execute(select(Product).where(Product.id.in_([item.product_id for item in order.items])))
    ).scalars().all()
    defaults = (await db.execute(select(FiscalDefault))).scalars().all()

    plan = plan_emission(order, fiscal_settings, {p.id: p for p in products}, {d.category: d for d in defaults})
    if isinstance(plan, Skip):
        apply_skip(order, plan)
    else:
        result = await run_emission(order, plan, provider)
        db.add(FiscalEvent(
            order_id=order.id, kind="emit", status=result.status, code=result.code, message=result.message,
            raw=result.raw, created_by_name=user_name,
        ))
    await db.commit()
    return order


async def emit_in_background(order_id: uuid.UUID, user_name: str) -> None:
    """Roda depois que a resposta do pedido já foi enviada. Nunca levanta: o pedido já está salvo."""
    try:
        provider = get_provider(app_settings.FISCAL_PROVIDER, app_settings.ENVIRONMENT)
        if provider is None:
            return
        async with AsyncSessionLocal() as db:
            await emit_order(db, order_id, provider, user_name)
    except EmissionDisabled:
        return
    except Exception:
        log.exception("Falha ao emitir a NFC-e do pedido %s", order_id)


async def retry_emission(db: AsyncSession, order_id: uuid.UUID, user_name: str) -> Order:
    try:
        provider = get_provider(app_settings.FISCAL_PROVIDER, app_settings.ENVIRONMENT)
    except (RuntimeError, ValueError):
        provider = None
    if provider is None:
        raise HTTPException(status_code=409, detail="Emissão fiscal não configurada neste servidor")
    try:
        order = await emit_order(db, order_id, provider, user_name)
    except EmissionDisabled:
        raise HTTPException(status_code=409, detail="Emissão fiscal desligada. Ligue em Configurações > Fiscal") from None
    if order is None:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return order


def pending_products(products: list[Any], defaults_by_category: dict[str, Any]) -> list[dict[str, Any]]:
    """Produtos ativos a que ainda falta dado fiscal (já considerando o padrão da categoria)."""
    pending = []
    for product in products:
        missing = missing_fields(merge_fiscal(product, defaults_by_category.get(product.category or "")))
        if missing:
            pending.append({"id": product.id, "code": product.code, "name": product.name,
                            "category": product.category, "missing": missing})
    return pending


async def list_pending_products(db: AsyncSession) -> list[dict[str, Any]]:
    products = (
        await db.execute(select(Product).where(Product.is_active == True).order_by(Product.code))  # noqa: E712
    ).scalars().all()
    defaults = (await db.execute(select(FiscalDefault))).scalars().all()
    return pending_products(list(products), {d.category: d for d in defaults})


async def get_settings(db: AsyncSession) -> FiscalSettings:
    row = (await db.execute(settings_query())).scalar_one_or_none()
    if row is None:
        row = FiscalSettings(enabled=False, environment="homologacao", regime="normal", series=1)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def save_settings(db: AsyncSession, data: FiscalSettingsIn, user_name: str) -> FiscalSettings:
    row = await get_settings(db)
    if data.environment == "producao" and row.environment != "producao":
        problems = await go_live_problems(db, data)
        if problems:
            raise HTTPException(status_code=422, detail="Para ir para produção: " + "; ".join(problems) + ".")
        row.production_confirmed_by = user_name
        row.production_confirmed_at = datetime.now(timezone.utc)
    elif data.environment != "producao":
        row.production_confirmed_by = None
        row.production_confirmed_at = None
    for field, value in data.model_dump(exclude={"production_confirmation"}).items():
        setattr(row, field, value)
    row.updated_by_name = user_name
    await db.commit()
    await db.refresh(row)
    return row


async def list_defaults(db: AsyncSession) -> list[FiscalDefault]:
    return list((await db.execute(select(FiscalDefault).order_by(FiscalDefault.category))).scalars().all())


async def upsert_default(db: AsyncSession, data: FiscalDefaultIn) -> FiscalDefault:
    row = (
        await db.execute(select(FiscalDefault).where(FiscalDefault.category == data.category))
    ).scalar_one_or_none()
    if row is None:
        row = FiscalDefault(category=data.category)
        db.add(row)
    for field in FISCAL_FIELDS:
        setattr(row, field, getattr(data, field))
    await db.commit()
    await db.refresh(row)
    return row


async def delete_default(db: AsyncSession, default_id: uuid.UUID) -> None:
    row = (await db.execute(select(FiscalDefault).where(FiscalDefault.id == default_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Padrão fiscal não encontrado")
    await db.delete(row)
    await db.commit()
