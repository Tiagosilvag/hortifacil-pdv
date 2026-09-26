"""Segredos fiscais cadastrados pela tela: certificado A1 (com a senha) e CSC de homologação e de produção.

Tudo é cifrado pelo cofre (`fiscal/vault.py`) antes de ir para o banco. O que sai daqui para a tela é só `secrets_status`, que
devolve dados públicos (titular do certificado, vencimento, ID do CSC) e **nunca** o conteúdo de um segredo.
"""
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fiscal import FiscalSecret
from app.services.fiscal import certificate as cert
from app.services.fiscal import vault

KIND_CERTIFICATE = "certificate"
KIND_CERTIFICATE_PASSWORD = "certificate_password"
CSC_KINDS = {"homologacao": "csc_hml", "producao": "csc_prod"}
MAX_PFX_BYTES = 1_000_000
CSC_TOKEN_MIN = 10


def _vault_or_409() -> None:
    try:
        vault.encrypt("teste", b"")  # só para saber se a chave mestra existe e é válida
    except vault.VaultUnavailable as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


async def _row(db: AsyncSession, kind: str) -> FiscalSecret | None:
    return (await db.execute(select(FiscalSecret).where(FiscalSecret.kind == kind))).scalar_one_or_none()


async def _upsert(db: AsyncSession, kind: str, plaintext: bytes, meta: dict[str, Any] | None, user_name: str) -> None:
    row = await _row(db, kind)
    if row is None:
        row = FiscalSecret(kind=kind)
        db.add(row)
    row.ciphertext = vault.encrypt(kind, plaintext)
    row.meta = meta
    row.updated_by_name = user_name


async def _commit_or_409(db: AsyncSession) -> None:
    """Dois envios ao mesmo tempo do primeiro segredo disputam a linha única do tipo: quem perde recebe um aviso, não um erro 500."""
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Outro envio dos mesmos dados aconteceu ao mesmo tempo. Confira a tela e envie de novo.") from None


async def save_certificate(db: AsyncSession, pfx: bytes, password: str, company_cnpj: str | None, user_name: str) -> cert.CertInfo:
    if not pfx or len(pfx) > MAX_PFX_BYTES:
        raise HTTPException(status_code=422, detail="Envie o arquivo do certificado (.pfx, até 1 MB).")
    _vault_or_409()
    try:
        info = cert.inspect_pfx(pfx, password)
    except cert.CertificateError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    problems = cert.problems_for_company(info, company_cnpj)
    if problems:
        raise HTTPException(status_code=422, detail="Certificado recusado: " + "; ".join(problems) + ".")
    meta = {
        "subject": info.subject, "cnpj": info.cnpj, "not_before": info.not_before.isoformat(),
        "not_after": info.not_after.isoformat(), "fingerprint": info.fingerprint,
    }
    await _upsert(db, KIND_CERTIFICATE, pfx, meta, user_name)
    await _upsert(db, KIND_CERTIFICATE_PASSWORD, password.encode("utf-8"), None, user_name)
    await _commit_or_409(db)
    return info


async def save_csc(db: AsyncSession, environment: str, csc_id: str, token: str, user_name: str) -> None:
    kind = CSC_KINDS.get(environment)
    if kind is None:
        raise HTTPException(status_code=422, detail="Ambiente inválido: use homologacao ou producao.")
    csc_id, token = (csc_id or "").strip(), (token or "").strip()
    if not csc_id.isdigit() or len(csc_id) > 6:
        raise HTTPException(status_code=422, detail="O ID do CSC deve ter só números (até 6 dígitos).")
    if len(token) < CSC_TOKEN_MIN:
        raise HTTPException(status_code=422, detail="O CSC (código) parece curto demais: confira o valor gerado na SEFAZ.")
    _vault_or_409()
    await _upsert(db, kind, json.dumps({"id": csc_id, "token": token}).encode("utf-8"), {"id": csc_id}, user_name)
    await _commit_or_409(db)


async def delete_certificate(db: AsyncSession) -> None:
    for kind in (KIND_CERTIFICATE, KIND_CERTIFICATE_PASSWORD):
        row = await _row(db, kind)
        if row is not None:
            await db.delete(row)
    await db.commit()


async def delete_csc(db: AsyncSession, environment: str) -> None:
    kind = CSC_KINDS.get(environment)
    if kind is None:
        raise HTTPException(status_code=422, detail="Ambiente inválido: use homologacao ou producao.")
    row = await _row(db, kind)
    if row is not None:
        await db.delete(row)
    await db.commit()


def _certificate_status(row: FiscalSecret | None, now: datetime) -> dict[str, Any]:
    if row is None or not row.meta:
        return {"configured": False}
    not_after = datetime.fromisoformat(row.meta["not_after"])
    info = cert.CertInfo(
        subject=row.meta["subject"], cnpj=row.meta.get("cnpj"), not_before=datetime.fromisoformat(row.meta["not_before"]),
        not_after=not_after, fingerprint=row.meta["fingerprint"],
    )
    return {
        "configured": True, "subject": info.subject, "cnpj": info.cnpj, "not_after": info.not_after,
        "days_left": cert.days_left(info, now), "level": cert.expiry_level(info, now),
    }


async def secrets_status(db: AsyncSession, now: datetime | None = None) -> dict[str, Any]:
    """O que a tela pode saber dos segredos: o que está cadastrado e os dados públicos. Nunca o conteúdo."""
    now = now or datetime.now(timezone.utc)
    rows = {row.kind: row for row in (await db.execute(select(FiscalSecret))).scalars().all()}
    return {
        "vault_available": vault.vault_available(),
        "certificate": _certificate_status(rows.get(KIND_CERTIFICATE), now),
        "csc_hml": {"configured": "csc_hml" in rows, "id": (rows["csc_hml"].meta or {}).get("id") if "csc_hml" in rows else None},
        "csc_prod": {"configured": "csc_prod" in rows, "id": (rows["csc_prod"].meta or {}).get("id") if "csc_prod" in rows else None},
    }


async def load_certificate(db: AsyncSession) -> tuple[bytes, str] | None:
    """Para o adaptador do modo direto (E1/E2): o .pfx e a senha decifrados, só em memória. None se não estiver cadastrado."""
    pfx_row, password_row = await _row(db, KIND_CERTIFICATE), await _row(db, KIND_CERTIFICATE_PASSWORD)
    if pfx_row is None or password_row is None:
        return None
    return vault.decrypt(KIND_CERTIFICATE, pfx_row.ciphertext), vault.decrypt(KIND_CERTIFICATE_PASSWORD, password_row.ciphertext).decode("utf-8")


async def load_csc(db: AsyncSession, environment: str) -> tuple[str, str] | None:
    """O CSC (ID e código) do ambiente, decifrado só em memória. None se não estiver cadastrado."""
    kind = CSC_KINDS.get(environment)
    row = await _row(db, kind) if kind else None
    if row is None:
        return None
    data = json.loads(vault.decrypt(kind, row.ciphertext))
    return data["id"], data["token"]
