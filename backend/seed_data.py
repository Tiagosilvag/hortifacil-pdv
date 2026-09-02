"""
Script para popular o banco com dados de exemplo.
Execute UMA vez após o banco estar vazio:

  docker exec -it <api-container> python seed_data.py
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.customer import Customer
from app.models.order import Order, OrderItem, OrderStatus, PaymentType
from app.models.product import Product, UnitType
from app.models.receivable import Receivable, ReceivableStatus
from app.models.user import User, UserRole


ADMIN_EMAIL = "ogaitsgarcia@gmail.com"


async def get_admin(db) -> User:
    result = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
    user = result.scalar_one_or_none()
    if not user:
        raise RuntimeError(f"Admin {ADMIN_EMAIL} não encontrado. Crie o admin primeiro.")
    return user


async def seed_products(db) -> list[Product]:
    products = [
        Product(name="Alface Crespa", unit_type=UnitType.unit, price=Decimal("2.50")),
        Product(name="Tomate Italiano", unit_type=UnitType.kg, price=Decimal("6.90")),
        Product(name="Banana Prata", unit_type=UnitType.kg, price=Decimal("4.50")),
        Product(name="Cenoura", unit_type=UnitType.kg, price=Decimal("3.80")),
        Product(name="Batata Inglesa", unit_type=UnitType.kg, price=Decimal("5.20")),
        Product(name="Cebola", unit_type=UnitType.kg, price=Decimal("4.00")),
        Product(name="Maçã Fuji", unit_type=UnitType.kg, price=Decimal("8.90")),
        Product(name="Laranja Pera", unit_type=UnitType.kg, price=Decimal("3.50")),
        Product(name="Pepino Japonês", unit_type=UnitType.unit, price=Decimal("1.80")),
        Product(name="Couve-flor", unit_type=UnitType.unit, price=Decimal("6.00")),
        Product(name="Brócolis", unit_type=UnitType.unit, price=Decimal("5.50")),
        Product(name="Manga Tommy", unit_type=UnitType.unit, price=Decimal("3.00")),
    ]
    for p in products:
        db.add(p)
    await db.flush()
    return products


async def seed_customers(db) -> list[Customer]:
    customers = [
        Customer(name="Maria Silva", phone="11987654321", credit_limit=Decimal("200.00")),
        Customer(name="João Pereira", phone="11976543210", credit_limit=Decimal("150.00")),
        Customer(name="Ana Costa", phone="11965432109", credit_limit=Decimal("300.00")),
        Customer(name="Carlos Oliveira", phone="11954321098", credit_limit=Decimal("100.00")),
        Customer(name="Fernanda Santos", phone="11943210987", credit_limit=Decimal("0.00")),
        Customer(name="Roberto Lima", phone="11932109876", credit_limit=Decimal("500.00")),
        Customer(name="Juliana Alves", phone="11921098765", credit_limit=Decimal("250.00")),
        Customer(name="Padaria Pão Quente", phone="1133445566", credit_limit=Decimal("1000.00")),
    ]
    for c in customers:
        db.add(c)
    await db.flush()
    return customers


async def seed_orders(db, admin: User, customers: list[Customer], products: list[Product]):
    now = datetime.now(timezone.utc)

    def make_order(customer, payment_type, items_data, days_ago=0, status=OrderStatus.delivered):
        created_at = now - timedelta(days=days_ago)
        total = sum(Decimal(str(qty)) * price for _, qty, price in items_data)
        order = Order(
            customer_id=customer.id if customer else None,
            total=total,
            discount=Decimal("0.00"),
            payment_type=payment_type,
            status=status,
            created_at=created_at,
            created_by_id=admin.id,
            created_by_name=admin.name,
        )
        return order, items_data, total

    orders_to_create = [
        # Pedidos em dinheiro - avulso e com cliente
        make_order(None, PaymentType.cash,
                   [(products[0], Decimal("3"), products[0].price),
                    (products[2], Decimal("2.5"), products[2].price)], days_ago=1),
        make_order(customers[4], PaymentType.cash,
                   [(products[1], Decimal("1.2"), products[1].price),
                    (products[3], Decimal("0.8"), products[3].price)], days_ago=2),
        make_order(customers[0], PaymentType.pix,
                   [(products[6], Decimal("1.5"), products[6].price),
                    (products[7], Decimal("2"), products[7].price)], days_ago=3),
        # Pedidos no cartão
        make_order(customers[2], PaymentType.credit_card,
                   [(products[4], Decimal("3"), products[4].price),
                    (products[5], Decimal("2"), products[5].price)], days_ago=4),
        make_order(customers[5], PaymentType.debit_card,
                   [(products[8], Decimal("4"), products[8].price),
                    (products[9], Decimal("2"), products[9].price)], days_ago=5),
        # Pedidos fiado
        make_order(customers[0], PaymentType.installment,
                   [(products[0], Decimal("5"), products[0].price),
                    (products[2], Decimal("3"), products[2].price)], days_ago=7),
        make_order(customers[1], PaymentType.installment,
                   [(products[1], Decimal("2"), products[1].price),
                    (products[6], Decimal("1"), products[6].price)], days_ago=10),
        make_order(customers[6], PaymentType.installment,
                   [(products[3], Decimal("2"), products[3].price),
                    (products[11], Decimal("3"), products[11].price)], days_ago=15),
        # Padaria com crédito alto
        make_order(customers[7], PaymentType.installment,
                   [(products[1], Decimal("10"), products[1].price),
                    (products[4], Decimal("15"), products[4].price),
                    (products[5], Decimal("8"), products[5].price)], days_ago=3),
        # Pedido de hoje
        make_order(None, PaymentType.pix,
                   [(products[10], Decimal("2"), products[10].price),
                    (products[7], Decimal("3"), products[7].price)], days_ago=0),
    ]

    receivables = []
    for order_tuple in orders_to_create:
        order, items_data, total = order_tuple
        db.add(order)
        await db.flush()

        for product, qty, unit_price in items_data:
            item = OrderItem(
                order_id=order.id,
                product_id=product.id,
                product_name=product.name,
                unit_type=product.unit_type.value,
                qty=qty,
                unit_price=unit_price,
                subtotal=qty * unit_price,
            )
            db.add(item)

        if order.payment_type == PaymentType.installment and order.customer_id:
            rec = Receivable(
                customer_id=order.customer_id,
                order_id=order.id,
                amount=total,
                status=ReceivableStatus.open,
                created_at=order.created_at,
            )
            db.add(rec)
            receivables.append((order.customer_id, total))

    await db.flush()

    # Atualizar balance_due dos clientes com fiado
    from collections import defaultdict
    customer_totals = defaultdict(Decimal)
    for cid, total in receivables:
        customer_totals[cid] += total

    for cid, total in customer_totals.items():
        result = await db.execute(select(Customer).where(Customer.id == cid))
        customer = result.scalar_one()
        customer.balance_due = total
        if customer.credit_limit > 0 and customer.balance_due >= customer.credit_limit:
            customer.is_blocked = True

    print(f"  {len(orders_to_create)} pedidos criados")
    print(f"  {len(receivables)} fiados criados")


async def main():
    async with AsyncSessionLocal() as db:
        admin = await get_admin(db)
        print(f"Admin encontrado: {admin.name}")

        print("Criando produtos...")
        products = await seed_products(db)
        print(f"  {len(products)} produtos criados")

        print("Criando clientes...")
        customers = await seed_customers(db)
        print(f"  {len(customers)} clientes criados")

        print("Criando pedidos e fiados...")
        await seed_orders(db, admin, customers, products)

        await db.commit()
        print("\nDados de exemplo criados com sucesso!")


if __name__ == "__main__":
    asyncio.run(main())
