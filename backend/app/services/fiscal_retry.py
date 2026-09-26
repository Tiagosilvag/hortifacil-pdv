"""Reenvio automático das NFC-e pendentes por falha do provedor (a "contingência" possível sem certificado nem SEFAZ próprios).

A contingência offline da NFC-e (emitir sem conexão e transmitir depois) depende do provedor escolhido e não está aqui.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as app_settings
from app.core.database import AsyncSessionLocal
from app.models.order import Order
from app.services import fiscal_service
from app.services.fiscal.provider import FiscalProvider
from app.services.fiscal_cancel import configured_provider

log = logging.getLogger(__name__)

RETRY_MAX_AGE_HOURS = 24
RETRY_BATCH = 20
RETRY_USER = "Sistema (reenvio automático)"


def reference_prefix(environment: str) -> str:
    """Prefixo da referência das notas de um ambiente (o mesmo que o payload usa: hml- ou prod-)."""
    return "prod-" if environment == "producao" else "hml-"


async def pending_order_ids(
    db: AsyncSession, now: datetime, environment: str = "homologacao", max_age_hours: int = RETRY_MAX_AGE_HOURS, limit: int = RETRY_BATCH,
) -> list[uuid.UUID]:
    """Pedidos cuja NFC-e ficou pendente DEPOIS de uma chamada ao provedor (fora do ar, tempo esgotado), dos últimos dias,
    **do ambiente atual**: um pendente de homologação nunca é reenviado sozinho como nota de produção.
    Pendente por dado fiscal faltando (nenhuma chamada feita) fica de fora: esse depende de alguém corrigir o cadastro."""
    rows = await db.execute(
        select(Order.id)
        .where(
            Order.fiscal_status == "pending",
            Order.fiscal_attempts > 0,
            Order.fiscal_reference.like(reference_prefix(environment) + "%"),
            Order.created_at >= now - timedelta(hours=max_age_hours),
        )
        .order_by(Order.created_at)
        .limit(limit)
    )
    return list(rows.scalars().all())


async def retry_pending(db: AsyncSession, provider: FiscalProvider, now: datetime | None = None) -> int:
    """Reenvia as notas pendentes. A emissão é idempotente pela referência, então repetir nunca duplica a nota.
    Levanta EmissionDisabled se a emissão está desligada (para a rota responder isso em vez de "0 pendentes")."""
    fiscal_settings = (await db.execute(fiscal_service.settings_query())).scalar_one_or_none()
    if fiscal_settings is None or not fiscal_settings.enabled:
        raise fiscal_service.EmissionDisabled("Emissão fiscal desligada")
    ids = await pending_order_ids(db, now or datetime.now(timezone.utc), fiscal_settings.environment)
    done = 0
    for order_id in ids:
        try:
            await fiscal_service.emit_order(db, order_id, provider, RETRY_USER)
            done += 1
        except fiscal_service.EmissionDisabled:
            break
        except Exception:
            log.exception("Reenvio da NFC-e do pedido %s falhou", order_id)
            await db.rollback()
    return done


async def run_retry_loop(interval_seconds: int) -> None:
    """Reenvia as notas pendentes a cada `interval_seconds`. Nunca levanta: um erro num ciclo não mata os seguintes."""
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            provider = configured_provider()
            if provider is None:
                continue
            async with AsyncSessionLocal() as db:
                await retry_pending(db, provider)
        except asyncio.CancelledError:
            raise
        except fiscal_service.EmissionDisabled:
            continue  # emissão desligada nas configurações: nada a reenviar neste ciclo
        except Exception:
            log.exception("Ciclo de reenvio de NFC-e falhou")


def start_retry_loop() -> "asyncio.Task[None] | None":
    """Inicia o reenvio automático se houver provedor e intervalo configurados; devolve a tarefa (para cancelar ao desligar)."""
    interval = app_settings.FISCAL_RETRY_INTERVAL_SECONDS
    if interval <= 0 or configured_provider() is None:
        return None
    return asyncio.create_task(run_retry_loop(interval))
