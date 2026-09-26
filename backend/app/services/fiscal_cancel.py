"""Cancelamento da NFC-e junto com o pedido e "Consultar situação" no provedor.

Fica separado de `fiscal_service` (emissão) para o `order_service` poder chamar o cancelamento sem ciclo de importação.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings as app_settings
from app.models.fiscal import FiscalEvent
from app.models.order import Order
from app.services import fiscal_service
from app.services.fiscal.provider import FiscalProvider, ProviderUnavailable, get_provider

log = logging.getLogger(__name__)

# A SEFAZ exige de 15 a 255 caracteres no motivo do cancelamento de uma NFC-e.
CANCEL_REASON_MIN = 15
CANCEL_REASON_MAX = 255


def configured_provider() -> FiscalProvider | None:
    """O provedor configurado no servidor, ou None (desligado, ou um valor que não pode ser usado neste ambiente)."""
    try:
        return get_provider(app_settings.FISCAL_PROVIDER, app_settings.ENVIRONMENT)
    except (RuntimeError, ValueError):
        return None


def validate_cancel_reason(reason: str | None) -> str:
    text = (reason or "").strip()
    if len(text) < CANCEL_REASON_MIN:
        raise HTTPException(
            status_code=422,
            detail=f"Para cancelar um pedido com NFC-e, informe o motivo com pelo menos {CANCEL_REASON_MIN} caracteres.",
        )
    if len(text) > CANCEL_REASON_MAX:
        raise HTTPException(status_code=422, detail=f"O motivo do cancelamento aceita no máximo {CANCEL_REASON_MAX} caracteres.")
    return text


def cancel_deadline_problem(order: Any, window_minutes: int, now: datetime) -> str | None:
    """Texto do impedimento quando o prazo para cancelar a NFC-e já passou; None se ainda dá."""
    emitted = order.fiscal_emitted_at
    if emitted is None:
        return "Este pedido não tem a hora de emissão da NFC-e: não dá para conferir o prazo de cancelamento."
    elapsed = (now - emitted).total_seconds() / 60
    if elapsed > window_minutes:
        return (
            f"O prazo para cancelar a NFC-e passou (emitida há {int(elapsed)} min; limite de {window_minutes} min). "
            "O pedido não foi cancelado. Fora do prazo, o cancelamento segue outro procedimento: procure o contador."
        )
    return None


async def cancel_nfce(
    db: AsyncSession, order: Any, provider: FiscalProvider, fiscal_settings: Any, reason: str | None, user_name: str,
    now: datetime | None = None,
) -> None:
    """Cancela a NFC-e de um pedido com nota autorizada. Só volta sem erro se a nota ficou cancelada; qualquer falha levanta
    HTTPException e deixa o pedido intacto (cancelar a venda e deixar a nota válida seria inconsistente)."""
    text = validate_cancel_reason(reason)
    if order.fiscal_status != "authorized":
        return
    if not order.fiscal_reference:
        raise HTTPException(status_code=409, detail="Este pedido não tem a referência da NFC-e no provedor: não dá para cancelar a nota.")
    now = now or datetime.now(timezone.utc)
    problem = cancel_deadline_problem(order, fiscal_settings.cancel_window_minutes, now)
    if problem:
        raise HTTPException(status_code=409, detail=problem)

    try:
        result = await provider.cancel_nfce(order.fiscal_reference, text)
    except Exception as exc:  # ProviderUnavailable e o que mais o adaptador deixar escapar
        log.warning("Cancelamento da NFC-e do pedido %s falhou: %s", order.order_number, exc)
        db.add(FiscalEvent(order_id=order.id, kind="cancel", status="pending", message=f"Provedor indisponível: {exc}",
                           raw={"exception": type(exc).__name__}, created_by_name=user_name))
        await db.commit()
        raise HTTPException(
            status_code=502,
            detail="Não foi possível falar com o provedor fiscal. O pedido e a NFC-e não foram cancelados. Tente de novo.",
        ) from None

    if not result.cancelled:
        db.add(FiscalEvent(order_id=order.id, kind="cancel", status="rejected", code=result.code, message=result.message,
                           raw=result.raw, created_by_name=user_name))
        await db.commit()
        raise HTTPException(status_code=409, detail=f"A SEFAZ não aceitou o cancelamento da NFC-e: {result.message or result.code}. O pedido não foi cancelado.")

    order.fiscal_status = "cancelled"
    order.fiscal_cancelled_at = now
    order.fiscal_cancel_reason = text
    order.fiscal_error = None
    db.add(FiscalEvent(order_id=order.id, kind="cancel", status="cancelled", code=result.code, message=result.message,
                       raw=result.raw, created_by_name=user_name))
    # Confirma já: se o cancelamento do pedido falhar depois, a nota continua registrada como cancelada e repetir é seguro.
    await db.commit()


async def cancel_for_order_service(db: AsyncSession, order: Any, user_name: str, reason: str | None) -> None:
    """Chamado por `order_service.cancel_order` quando o pedido tem NFC-e autorizada."""
    text = validate_cancel_reason(reason)  # antes de qualquer consulta: motivo ruim nunca chega ao provedor
    # Outra sessão pode ter mudado a nota depois de o pedido ser lido: recarrega só as colunas fiscais.
    await db.refresh(order, attribute_names=["fiscal_status", "fiscal_emitted_at", "fiscal_reference"])
    fiscal_settings = (await db.execute(fiscal_service.settings_query())).scalar_one_or_none()
    provider = configured_provider()
    if provider is None or fiscal_settings is None:
        raise HTTPException(status_code=409, detail="Emissão fiscal não configurada neste servidor: não dá para cancelar a NFC-e deste pedido.")
    await cancel_nfce(db, order, provider, fiscal_settings, text, user_name)


async def refresh_order(db: AsyncSession, order_id: uuid.UUID, provider: FiscalProvider, user_name: str) -> Order | None:
    """"Consultar situação": pergunta ao provedor o que houve com a nota (útil depois de um tempo esgotado, em que a SEFAZ
    pode ter autorizado sem a resposta chegar). Aplica o que ele responder."""
    order = (
        await db.execute(
            select(Order).options(selectinload(Order.items), selectinload(Order.customer))
            .where(Order.id == order_id).with_for_update(of=Order)
        )
    ).scalar_one_or_none()
    if order is None:
        return None
    if not order.fiscal_reference:
        raise HTTPException(status_code=409, detail="Este pedido ainda não foi enviado ao provedor fiscal: use \"Tentar de novo\".")
    try:
        result = await provider.get_nfce(order.fiscal_reference)
    except ProviderUnavailable as exc:
        raise HTTPException(status_code=502, detail=f"Não foi possível consultar o provedor fiscal: {exc}") from None
    if order.fiscal_status != "authorized":
        fiscal_service.apply_result(order, result)
    db.add(FiscalEvent(order_id=order.id, kind="refresh", status=result.status, code=result.code, message=result.message,
                       raw=result.raw, created_by_name=user_name))
    await db.commit()
    return order
