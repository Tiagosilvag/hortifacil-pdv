import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.order import OrderStatus
from app.models.user import User
from app.schemas.order import OrderCancelRequest, OrderCreate, OrderInvoiceUpdate, OrderListOut, OrderOut
from app.services import order_service

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderOut, status_code=201)
async def create_order(
    data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await order_service.create_order(db, data, current_user)


@router.get("", response_model=list[OrderListOut])
async def list_orders(
    customer_id: uuid.UUID | None = None,
    status: OrderStatus | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    df = datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc) if date_from else None
    dt = datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=timezone.utc) if date_to else None
    return await order_service.list_orders(
        db,
        customer_id=customer_id,
        status=status,
        date_from=df,
        date_to=dt,
        limit=limit,
        offset=offset,
    )


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    order = await order_service.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return order


@router.post("/{order_id}/deliver", response_model=OrderOut)
async def deliver_order(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = await order_service.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return await order_service.deliver_order(db, order, current_user)


@router.post("/{order_id}/cancel", response_model=OrderOut)
async def cancel_order(
    order_id: uuid.UUID,
    body: OrderCancelRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = await order_service.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return await order_service.cancel_order(db, order, current_user, body.reason)


@router.patch("/{order_id}/invoice", response_model=OrderOut)
async def update_invoice(
    order_id: uuid.UUID,
    body: OrderInvoiceUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    order = await order_service.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return await order_service.update_invoice(db, order, body)
