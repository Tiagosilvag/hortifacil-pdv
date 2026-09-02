import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.customer import Customer
from app.models.order import Order
from app.models.receivable import Receivable, ReceivableStatus
from app.models.user import User
from app.services import customer_service


def _receivable_query():
    return select(Receivable).options(
        selectinload(Receivable.customer),
        selectinload(Receivable.order),
    )


async def list_receivables(
    db: AsyncSession,
    *,
    customer_id: uuid.UUID | None = None,
    status: ReceivableStatus | None = None,
    open_only: bool = False,
) -> list[Receivable]:
    q = _receivable_query()
    if customer_id:
        q = q.where(Receivable.customer_id == customer_id)
    if status:
        q = q.where(Receivable.status == status)
    elif open_only:
        q = q.where(Receivable.status.in_([ReceivableStatus.open, ReceivableStatus.partial]))
    q = q.order_by(Receivable.created_at.desc())
    result = await db.execute(q)
    return list(result.scalars().all())


async def register_payment(
    db: AsyncSession,
    receivable_id: uuid.UUID,
    amount: Decimal,
    current_user: User,
    notes: str | None = None,
) -> Receivable:
    result = await db.execute(
        _receivable_query().where(Receivable.id == receivable_id)
    )
    receivable = result.scalar_one_or_none()
    if not receivable:
        raise HTTPException(status_code=404, detail="Conta a receber não encontrada")
    if receivable.status == ReceivableStatus.paid:
        raise HTTPException(status_code=400, detail="Esta conta já foi paga")

    remaining = receivable.amount - receivable.amount_paid
    if amount > remaining:
        raise HTTPException(
            status_code=400,
            detail=f"Valor informado (R$ {amount:.2f}) é maior que o saldo em aberto (R$ {remaining:.2f})",
        )

    receivable.amount_paid = receivable.amount_paid + amount
    receivable.paid_by_id = current_user.id
    receivable.paid_by_name = current_user.name
    receivable.paid_at = datetime.now(timezone.utc)
    if notes:
        receivable.notes = notes

    if receivable.amount_paid >= receivable.amount:
        receivable.status = ReceivableStatus.paid
    else:
        receivable.status = ReceivableStatus.partial

    customer_result = await db.execute(
        select(Customer).where(Customer.id == receivable.customer_id)
    )
    customer = customer_result.scalar_one_or_none()
    if customer:
        customer.balance_due = max(Decimal("0.00"), customer.balance_due - amount)
        customer_service._refresh_block_status(customer)

    await db.commit()

    result2 = await db.execute(
        _receivable_query().where(Receivable.id == receivable_id)
    )
    return result2.scalar_one()
