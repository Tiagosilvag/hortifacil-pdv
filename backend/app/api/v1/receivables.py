import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.receivable import ReceivableStatus
from app.models.user import User
from app.schemas.receivable import PaymentCreate, ReceivableOut
from app.services import receivable_service

router = APIRouter(prefix="/receivables", tags=["receivables"])


@router.get("", response_model=list[ReceivableOut])
async def list_receivables(
    customer_id: uuid.UUID | None = None,
    status: ReceivableStatus | None = None,
    open_only: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await receivable_service.list_receivables(
        db, customer_id=customer_id, status=status, open_only=open_only
    )


@router.post("/{receivable_id}/pay", response_model=ReceivableOut)
async def register_payment(
    receivable_id: uuid.UUID,
    data: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await receivable_service.register_payment(
        db, receivable_id, data.amount, current_user, data.notes
    )
