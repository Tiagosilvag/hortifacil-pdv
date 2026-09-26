"""Conferências para mudar a emissão fiscal de homologação para produção. Produção emite notas de verdade, com valor fiscal."""
import re
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order
from app.services import fiscal_secrets
from app.services.fiscal.registry import REAL_MODES, mode_available


async def go_live_problems(db: AsyncSession, data: Any) -> list[str]:
    """O que ainda impede a ida para produção (lista vazia = pode ir). `data` é o FiscalSettingsIn que está sendo salvo."""
    problems: list[str] = []

    if data.mode not in REAL_MODES:
        problems.append("escolha um modo de emissão real (SEFAZ direto): o desligado e o de teste não emitem nota de verdade")
    elif not mode_available(data.mode):
        problems.append("o modo escolhido ainda não está disponível neste sistema (em desenvolvimento)")
    elif data.mode == "sefaz_direto":
        status = await fiscal_secrets.secrets_status(db)
        certificate = status["certificate"]
        if not certificate["configured"]:
            problems.append("cadastre o certificado digital A1")
        else:
            if certificate["days_left"] < 0:
                problems.append("o certificado digital venceu")
            company_cnpj = re.sub(r"\D", "", data.cnpj or "")
            if certificate["cnpj"] and company_cnpj and certificate["cnpj"] != company_cnpj:
                problems.append("o CNPJ do certificado é diferente do CNPJ da empresa")
        if not status["csc_prod"]["configured"]:
            problems.append("cadastre o CSC de produção")

    if not data.enabled:
        problems.append("ligue a emissão e preencha todos os dados da empresa")

    hml_authorized = (
        await db.execute(
            select(func.count()).select_from(Order).where(
                Order.fiscal_status.in_(("authorized", "cancelled")), Order.fiscal_reference.like("hml-%")
            )
        )
    ).scalar_one()
    if not hml_authorized:  # autorizada e depois cancelada (para testar o cancelamento) também vale
        problems.append("faça ao menos uma venda de teste autorizada em homologação")

    if not data.production_confirmation:
        problems.append("confirme que o contador validou o cupom emitido em homologação")
    return problems
