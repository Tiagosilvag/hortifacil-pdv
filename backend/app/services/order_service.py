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
from app.models.user import User, UserRole
from app.schemas.order import OrderCreate, OrderInvoiceUpdate
from app.services import customer_service


async def create_order(
    db: AsyncSession, data: OrderCreate, current_user: User
) -> Order:
    customer: Customer | None = None

    # Resolve effective payment_type and splits
    splits: list[PaymentSplit] = data.payments or []
    if splits:
        effective_payment_type = PaymentType.mixed if len(splits) > 1 else PaymentType(splits[0].type)
    else:
        effective_payment_type = data.payment_type  # type: ignore[assignment]
        splits = []

    has_installment = any(s.type == "installment" for s in splits) or (
        not splits and effective_payment_type == PaymentType.installment
    )

    if data.customer_id:
        result = await db.execute(
            select(Customer).where(Customer.id == data.customer_id)
        )
        customer = result.scalar_one_or_none()
        if not customer:
            raise HTTPException(status_code=404, detail="Cliente não encontrado")

        if has_installment:
            if customer.is_blocked:
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

    # Calcular valor do fiado (portion installment)
    if splits:
        installment_amount = sum(
            s.amount for s in splits if s.type == "installment"
        ).quantize(Decimal("0.01"))
    else:
        installment_amount = total if effective_payment_type == PaymentType.installment else Decimal("0.00")

    # Validar splits somam o total
    if splits:
        splits_total = sum(s.amount for s in splits).quantize(Decimal("0.01"))
        if abs(splits_total - total) > Decimal("0.01"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Soma dos pagamentos (R$ {splits_total:.2f}) não bate com o total do pedido (R$ {total:.2f})",
            )

    # Validar limite de crédito para fiado
    if has_installment and customer:
        if customer.credit_limit > 0:
            disponivel = customer.credit_limit - customer.balance_due
            if installment_amount > disponivel:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Valor fiado (R$ {installment_amount:.2f}) excede o crédito disponível "
                        f"(R$ {disponivel:.2f}). "
                        f"Limite: R$ {customer.credit_limit:.2f} | Em aberto: R$ {customer.balance_due:.2f}"
                    ),
                )

    payment_splits_json = (
        [{"type": s.type, "amount": float(s.amount)} for s in splits]
        if len(splits) > 1
        else None
    )

    order = Order(
        customer_id=data.customer_id,
        total=total,
        discount=data.discount,
        payment_type=effective_payment_type,
        payment_splits=payment_splits_json,
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
            product_code=product.code,
            barcode=product.barcode,
            unit_type=product.unit_type.value,
            qty=qty,
            unit_price=product.price,
            subtotal=subtotal,
        )
        db.add(item)
        product.stock = (product.stock or Decimal("0")) - qty

    if has_installment and customer and installment_amount > 0:
        receivable = Receivable(
            customer_id=customer.id,
            order_id=order.id,
            amount=installment_amount,
            status=ReceivableStatus.open,
        )
        db.add(receivable)
        customer.balance_due = customer.balance_due + installment_amount
        customer_service._refresh_block_status(customer)

    await db.commit()
    await db.refresh(order)

    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.customer))
        .where(Order.id == order.id)
    )
    return result.scalar_one()


async def get_order(db: AsyncSession, order_id: uuid.UUID) -> Order | None:
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.customer))
        .where(Order.id == order_id)
    )
    return result.scalar_one_or_none()


async def list_orders(
    db: AsyncSession,
    *,
    customer_id: uuid.UUID | None = None,
    status: OrderStatus | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Order]:
    q = select(Order).options(selectinload(Order.items), selectinload(Order.customer))
    if customer_id:
        q = q.where(Order.customer_id == customer_id)
    if status:
        q = q.where(Order.status == status)
    if date_from:
        q = q.where(Order.created_at >= date_from)
    if date_to:
        q = q.where(Order.created_at <= date_to)
    q = q.order_by(Order.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(q)
    return list(result.scalars().all())


async def deliver_order(
    db: AsyncSession, order: Order, current_user: User
) -> Order:
    if order.status != OrderStatus.pending:
        raise HTTPException(
            status_code=400,
            detail=f"Pedido não pode ser entregue pois está com status '{order.status.value}'",
        )
    order.status = OrderStatus.delivered
    await db.commit()
    await db.refresh(order)
    return order


async def cancel_order(
    db: AsyncSession, order: Order, current_user: User, reason: str | None = None
) -> Order:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Apenas administradores podem cancelar pedidos")
    if order.status == OrderStatus.cancelled:
        raise HTTPException(status_code=400, detail="Pedido já foi cancelado")

    order.status = OrderStatus.cancelled
    if reason:
        order.notes = f"[CANCELADO por {current_user.name}] {reason}"

    # restore stock for each item
    for item in order.items:
        result_p = await db.execute(
            select(Product).where(Product.id == item.product_id)
        )
        product = result_p.scalar_one_or_none()
        if product:
            product.stock = (product.stock or Decimal("0")) + item.qty

    # Calcular quanto era fiado neste pedido
    cancel_installment = Decimal("0.00")
    if order.payment_type == PaymentType.installment:
        cancel_installment = order.total
    elif order.payment_type == PaymentType.mixed and order.payment_splits:
        cancel_installment = sum(
            Decimal(str(s["amount"])) for s in order.payment_splits if s.get("type") == "installment"
        ).quantize(Decimal("0.01"))

    if cancel_installment > 0 and order.customer_id:
        result = await db.execute(
            select(Customer).where(Customer.id == order.customer_id)
        )
        customer = result.scalar_one_or_none()
        if customer:
            customer.balance_due = max(
                Decimal("0.00"), customer.balance_due - cancel_installment
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


async def update_invoice(
    db: AsyncSession, order: Order, data: OrderInvoiceUpdate
) -> Order:
    order.invoice_number = data.invoice_number
    order.invoice_series = data.invoice_series
    order.invoice_key = data.invoice_key
    await db.commit()
    await db.refresh(order)
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.customer))
        .where(Order.id == order.id)
    )
    return result.scalar_one()
