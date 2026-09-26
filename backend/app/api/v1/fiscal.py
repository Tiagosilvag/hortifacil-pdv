import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.core.config import settings as app_settings
from app.core.database import get_db
from app.models.user import User
from app.schemas.fiscal import (
    FiscalDefaultIn, FiscalDefaultOut, FiscalIssuerOut, FiscalSettingsIn, FiscalSettingsOut, FiscalStatusOut,
    PendingProductOut,
)
from app.schemas.order import OrderOut
from app.services import fiscal_cancel, fiscal_retry, fiscal_service
from app.services.fiscal.provider import get_provider

router = APIRouter(prefix="/fiscal", tags=["fiscal"])


@router.get("/status", response_model=FiscalStatusOut)
async def fiscal_status(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Para o PDV: a emissão está ligada, há provedor configurado e em que ambiente."""
    row = (await db.execute(fiscal_service.settings_query())).scalar_one_or_none()
    try:
        configured = get_provider(app_settings.FISCAL_PROVIDER, app_settings.ENVIRONMENT) is not None
    except (RuntimeError, ValueError):
        configured = False
    return FiscalStatusOut(
        enabled=bool(row and row.enabled) and configured,
        provider_configured=configured,
        environment=row.environment if row else "homologacao",
        issuer=FiscalIssuerOut.model_validate(row) if row and row.cnpj else None,
    )


@router.get("/settings", response_model=FiscalSettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    return await fiscal_service.get_settings(db)


@router.put("/settings", response_model=FiscalSettingsOut)
async def put_settings(
    data: FiscalSettingsIn, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)
):
    return await fiscal_service.save_settings(db, data, admin.name)


@router.get("/defaults", response_model=list[FiscalDefaultOut])
async def list_defaults(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    return await fiscal_service.list_defaults(db)


@router.put("/defaults", response_model=FiscalDefaultOut)
async def put_default(data: FiscalDefaultIn, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    return await fiscal_service.upsert_default(db, data)


@router.delete("/defaults/{default_id}", status_code=204)
async def delete_default(default_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    await fiscal_service.delete_default(db, default_id)


@router.get("/pending-products", response_model=list[PendingProductOut])
async def pending_products(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return await fiscal_service.list_pending_products(db)


@router.post("/orders/{order_id}/emit", response_model=OrderOut)
async def emit_order(
    order_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """"Tentar de novo": emite (ou reemite) a NFC-e do pedido agora, sem esperar."""
    return await fiscal_service.retry_emission(db, order_id, current_user.name)


@router.post("/orders/{order_id}/refresh", response_model=OrderOut)
async def refresh_order(
    order_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """"Consultar situação": pergunta ao provedor o que houve com a nota (útil depois de um tempo esgotado)."""
    provider = fiscal_cancel.configured_provider()
    if provider is None:
        raise HTTPException(status_code=409, detail="Emissão fiscal não configurada neste servidor")
    order = await fiscal_cancel.refresh_order(db, order_id, provider, current_user.name)
    if order is None:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return order


@router.post("/retry-pending")
async def retry_pending(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    """Reenvia agora as NFC-e pendentes por falha do provedor (o servidor também faz isso sozinho, de tempos em tempos)."""
    provider = fiscal_cancel.configured_provider()
    if provider is None:
        raise HTTPException(status_code=409, detail="Emissão fiscal não configurada neste servidor")
    try:
        return {"attempted": await fiscal_retry.retry_pending(db, provider)}
    except fiscal_service.EmissionDisabled:
        raise HTTPException(status_code=409, detail="Emissão fiscal desligada. Ligue em Configurações > Fiscal") from None
