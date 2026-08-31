import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.customer import Customer
from app.models.order import Order, OrderItem, OrderStatus, PaymentType
from app.models.product import Product
from app.models.receivable import Receivable, ReceivableStatus
from app.models.user import User
from app.schemas.order import OrderCreate
from app.services import customer_service


async def create_order(
    db: AsyncSession, data: OrderCreate, current_user: User
) -> Order:
    customer: Customer | None = None

    if data.customer_id:
        result = await db.execute(
            select(Customer).where(Customer.id == data.customer_id)
        )
        customer = result.scalar_one_or_none()
        if not customer:
            raise HTTPException(status_code=404, detail="Cliente não encontrado")
        if customer.is_blocked and data.payment_type == PaymentType.installment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cliente bloqueado. Saldo em aberto: R$ {customer.balance_due:.2f} / Limite: R$ {customer.credit_limit:.2f}",
            )

    items_data: list[tuple[Product, Decimal]] = []
    total = Decimal("0.00")

    for item_in in data.items:
        result = await db.execute(
            select(Product).where(Product.id == item_in.product_id, Product.is_active == True)
        )
        product = result.scalar_one_or_none()
        if not product:
            raise HTTPException(
                status_code=404,
                detail=f"Produto {item_in.product_id} não encontrado ou inativo",
            )
        subtotal = (product.price * item_in.qty).quantize(Decimal("0.01"))
        total += subtotal
        items_data.append((product, item_in.qty, subtotal))

    total = (total - data.discount).quantize(Decimal("0.01"))
    if total < 0:
        total = Decimal("0.00")

    order = Order(
        customer_id=data.customer_id,
        total=total,
        discount=data.discount,
        payment_type=data.payment_type,
        notes=data.notes,
        created_by_id=current_user.id,
        created_by_name=current_user.name,
    )
    db.add(order)
    await db.flush()  # gera o order_number

    for product, qty, subtotal in items_data:
        item = OrderItem(
            order_id=order.id,
            product_id=product.id,
            product_name=product.name,
            unit_type=product.unit_type.value,
            qty=qty,
            unit_price=product.price,
            subtotal=subtotal,
        )
        db.add(item)

    if data.payment_type == PaymentType.installment and customer:
        receivable = Receivable(
            customer_id=customer.id,
            order_id=order.id,
            amount=total,
            status=ReceivableStatus.open,
        )
        db.add(receivable)
        customer.balance_due = customer.balance_due + total
        customer_service._refresh_block_status(customer)

    await db.commit()
    await db.refresh(order)

    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order.id)
    )
    return result.scalar_one()


async def get_order(db: AsyncSession, order_id: uuid.UUID) -> Order | None:
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_id)
    )
    return result.scalar_one_or_none()


async def list_orders(
    db: AsyncSession,
    *,
    customer_id: uuid.UUID | None = None,
    status: OrderStatus | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Order]:
    q = select(Order).options(selectinload(Order.items))
    if customer_id:
        q = q.where(Order.customer_id == customer_id)
    if status:
        q = q.where(Order.status == status)
    q = q.order_by(Order.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(q)
    return list(result.scalars().all())


async def cancel_order(
    db: AsyncSession, order: Order, current_user: User, reason: str | None = None
) -> Order:
    if order.status == OrderStatus.cancelled:
        raise HTTPException(status_code=400, detail="Pedido já foi cancelado")

    order.status = OrderStatus.cancelled
    if reason:
        order.notes = f"[CANCELADO por {current_user.name}] {reason}"

    if order.payment_type == PaymentType.installment and order.customer_id:
        result = await db.execute(
            select(Customer).where(Customer.id == order.customer_id)
        )
        customer = result.scalar_one_or_none()
        if customer:
            customer.balance_due = max(
                Decimal("0.00"), customer.balance_due - order.total
            )
            customer_service._refresh_block_status(customer)

        result2 = await db.execute(
            select(Receivable).where(
                Receivable.order_id == order.id,
                Receivable.status != ReceivableStatus.paid,
            )
        )
        for rec in result2.scalars().all():
            rec.status = ReceivableStatus.paid
            rec.paid_at = datetime.now(timezone.utc)
            rec.paid_by_name = f"Sistema (cancelamento #{order.order_number})"

    await db.commit()
    await db.refresh(order)
    return order
