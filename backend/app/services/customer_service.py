import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.user import User
from app.schemas.customer import CustomerCreate, CustomerUpdate


async def create_customer(
    db: AsyncSession, data: CustomerCreate, created_by: User
) -> Customer:
    customer = Customer(
        **data.model_dump(),
        created_by_id=created_by.id,
    )
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    return customer


async def get_customer(db: AsyncSession, customer_id: uuid.UUID) -> Customer | None:
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    return result.scalar_one_or_none()


async def list_customers(
    db: AsyncSession,
    *,
    active_only: bool = True,
    search: str | None = None,
    blocked_only: bool = False,
) -> list[Customer]:
    q = select(Customer)
    if active_only:
        q = q.where(Customer.is_active == True)
    if blocked_only:
        q = q.where(Customer.is_blocked == True)
    if search:
        q = q.where(Customer.name.ilike(f"%{search}%"))
    q = q.order_by(Customer.name)
    result = await db.execute(q)
    return list(result.scalars().all())


async def update_customer(
    db: AsyncSession, customer: Customer, data: CustomerUpdate
) -> Customer:
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(customer, field, value)
    _refresh_block_status(customer)
    await db.commit()
    await db.refresh(customer)
    return customer


async def add_to_balance(
    db: AsyncSession, customer: Customer, amount: Decimal
) -> Customer:
    customer.balance_due = customer.balance_due + amount
    _refresh_block_status(customer)
    await db.commit()
    await db.refresh(customer)
    return customer


async def subtract_from_balance(
    db: AsyncSession, customer: Customer, amount: Decimal
) -> Customer:
    customer.balance_due = max(Decimal("0.00"), customer.balance_due - amount)
    _refresh_block_status(customer)
    await db.commit()
    await db.refresh(customer)
    return customer


def _refresh_block_status(customer: Customer) -> None:
    if customer.credit_limit > 0:
        customer.is_blocked = customer.balance_due >= customer.credit_limit
    else:
        customer.is_blocked = False
