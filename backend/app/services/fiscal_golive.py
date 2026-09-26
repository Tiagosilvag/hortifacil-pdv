"""Conferências para mudar a emissão fiscal de homologação para produção. Produção emite notas de verdade, com valor fiscal."""
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as app_settings
from app.models.order import Order
from app.services.fiscal.provider import get_provider

# Provedores que não emitem nota de verdade: nenhum deles serve para produção.
NOT_REAL_PROVIDERS = ("", "none", "fake")


async def go_live_problems(db: AsyncSession, data: Any) -> list[str]:
    """O que ainda impede a ida para produção (lista vazia = pode ir). `data` é o FiscalSettingsIn que está sendo salvo."""
    problems: list[str] = []

    provider_name = (app_settings.FISCAL_PROVIDER or "").strip().lower()
    try:
        real = provider_name not in NOT_REAL_PROVIDERS and get_provider(provider_name, app_settings.ENVIRONMENT) is not None
    except (RuntimeError, ValueError):
        real = False
    if not real:
        problems.append("o servidor ainda não tem um provedor fiscal real configurado (FISCAL_PROVIDER)")

    if not data.enabled:
        problems.append("ligue a emissão e preencha todos os dados da empresa")

    hml_authorized = (
        await db.execute(
            select(func.count()).select_from(Order).where(
                Order.fiscal_status == "authorized", Order.fiscal_reference.like("hml-%")
            )
        )
    ).scalar_one()
    if not hml_authorized:
        problems.append("faça ao menos uma venda de teste autorizada em homologação")

    if not data.production_confirmation:
        problems.append("confirme que o contador validou o cupom emitido em homologação")
    return problems
