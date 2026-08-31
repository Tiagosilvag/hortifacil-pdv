import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate


async def create_product(db: AsyncSession, data: ProductCreate) -> Product:
    product = Product(**data.model_dump())
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


async def get_product(db: AsyncSession, product_id: uuid.UUID) -> Product | None:
    result = await db.execute(select(Product).where(Product.id == product_id))
    return result.scalar_one_or_none()


async def get_product_by_barcode(db: AsyncSession, barcode: str) -> Product | None:
    result = await db.execute(
        select(Product).where(Product.barcode == barcode, Product.is_active == True)
    )
    return result.scalar_one_or_none()


async def list_products(
    db: AsyncSession,
    *,
    active_only: bool = True,
    search: str | None = None,
    category: str | None = None,
) -> list[Product]:
    q = select(Product)
    if active_only:
        q = q.where(Product.is_active == True)
    if search:
        q = q.where(Product.name.ilike(f"%{search}%"))
    if category:
        q = q.where(Product.category == category)
    q = q.order_by(Product.name)
    result = await db.execute(q)
    return list(result.scalars().all())


async def update_product(
    db: AsyncSession, product: Product, data: ProductUpdate
) -> Product:
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(product, field, value)
    await db.commit()
    await db.refresh(product)
    return product
