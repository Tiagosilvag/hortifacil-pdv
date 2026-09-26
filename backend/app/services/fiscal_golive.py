"""Conferências para mudar a emissão fiscal de homologação para produção. Produção emite notas de verdade, com valor fiscal."""
import re
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order
from app.services import fiscal_secrets
from app.services.fiscal import certificate, vault
from app.services.fiscal.registry import REAL_MODES, mode_available


async def _direct_mode_problems(db: AsyncSession, data: Any) -> list[str]:
    """Modo direto: não basta o cadastro existir (a tela só vê os dados públicos); o cofre precisa abrir e o certificado precisa servir."""
    if not vault.vault_available():
        return ["a chave mestra dos segredos (FISCAL_SECRET_KEY) não está configurada no servidor: sem ela o certificado e o CSC não abrem"]
    problems: list[str] = []
    try:
        loaded = await fiscal_secrets.load_certificate(db)
    except vault.VaultUnavailable:
        problems.append("o certificado digital guardado não abre (a chave mestra mudou?): cadastre-o de novo")
    else:
        if loaded is None:
            problems.append("cadastre o certificado digital A1")
        else:
            try:
                info = certificate.inspect_pfx(*loaded)
            except certificate.CertificateError as exc:
                problems.append(f"o certificado digital guardado não serve: {exc}")
            else:
                company_cnpj = re.sub(r"\D", "", data.cnpj or "")
                if info.cnpj is None:
                    problems.append("o certificado digital não traz o CNPJ da empresa: use um e-CNPJ A1")
                problems += certificate.problems_for_company(info, company_cnpj if info.cnpj is not None else None)
    try:
        csc = await fiscal_secrets.load_csc(db, "producao")
    except vault.VaultUnavailable:
        problems.append("o CSC de produção guardado não abre (a chave mestra mudou?): cadastre-o de novo")
    else:
        if csc is None:
            problems.append("cadastre o CSC de produção")
    return problems


async def go_live_problems(db: AsyncSession, data: Any) -> list[str]:
    """O que ainda impede a ida para produção (lista vazia = pode ir). `data` é o FiscalSettingsIn que está sendo salvo."""
    problems: list[str] = []

    if data.mode not in REAL_MODES:
        problems.append("escolha um modo de emissão real (SEFAZ direto): o desligado e o de teste não emitem nota de verdade")
    elif not mode_available(data.mode):
        problems.append("o modo escolhido ainda não está disponível neste sistema (em desenvolvimento)")
    elif data.mode == "sefaz_direto":
        problems += await _direct_mode_problems(db, data)

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
