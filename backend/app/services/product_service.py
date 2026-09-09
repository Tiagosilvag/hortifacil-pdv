import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import OrderItem
from app.models.product import Product
from app.models.user import User, UserRole
from app.schemas.product import ProductCreate, ProductUpdate


async def _check_name_unique(db: AsyncSession, name: str, exclude_id: uuid.UUID | None = None) -> None:
    q = select(Product).where(Product.name.ilike(name))
    if exclude_id:
        q = q.where(Product.id != exclude_id)
    result = await db.execute(q)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Já existe um produto com esse nome")


async def _product_has_orders(db: AsyncSession, product_id: uuid.UUID) -> bool:
    result = await db.execute(
        select(OrderItem.id).where(OrderItem.product_id == product_id).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _annotate_has_orders(db: AsyncSession, products: list[Product]) -> list[Product]:
    if not products:
        return products
    product_ids = [p.id for p in products]
    result = await db.execute(
        select(OrderItem.product_id).where(OrderItem.product_id.in_(product_ids)).distinct()
    )
    ids_with_orders = set(result.scalars().all())
    for p in products:
        p.has_orders = p.id in ids_with_orders  # type: ignore[attr-defined]
    return products


async def create_product(db: AsyncSession, data: ProductCreate) -> Product:
    await _check_name_unique(db, data.name)
    result = await db.execute(select(func.coalesce(func.max(Product.code), 0)))
    next_code = result.scalar() + 1
    product = Product(**data.model_dump(), code=next_code)
    product.has_orders = False  # type: ignore[attr-defined]
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


async def get_product(db: AsyncSession, product_id: uuid.UUID) -> Product | None:
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if product:
        product.has_orders = await _product_has_orders(db, product_id)  # type: ignore[attr-defined]
    return product


async def get_product_by_barcode(db: AsyncSession, barcode: str) -> Product | None:
    result = await db.execute(
        select(Product).where(Product.barcode == barcode, Product.is_active == True)
    )
    product = result.scalar_one_or_none()
    if product:
        product.has_orders = await _product_has_orders(db, product.id)  # type: ignore[attr-defined]
    return product


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
        if search.strip().isdigit():
            q = q.where(Product.code == int(search.strip()))
        else:
            q = q.where(
                Product.name.ilike(f"%{search}%")
                | Product.barcode.ilike(f"%{search}%")
                | Product.category.ilike(f"%{search}%")
            )
    if category:
        q = q.where(Product.category == category)
    q = q.order_by(Product.name)
    result = await db.execute(q)
    products = list(result.scalars().all())
    return await _annotate_has_orders(db, products)


async def update_product(
    db: AsyncSession, product: Product, data: ProductUpdate, current_user: User
) -> Product:
    updates = data.model_dump(exclude_none=True)
    data_fields = {k: v for k, v in updates.items() if k != "is_active"}

    if data_fields:
        can_edit = current_user.role == UserRole.admin or current_user.can_manage_products
        if not can_edit:
            raise HTTPException(status_code=403, detail="Sem permissão para alterar dados do produto")
        if data.name is not None:
            await _check_name_unique(db, data.name, exclude_id=product.id)

    for field, value in updates.items():
        setattr(product, field, value)
    await db.commit()
    await db.refresh(product)
    product.has_orders = await _product_has_orders(db, product.id)  # type: ignore[attr-defined]
    return product


async def delete_product(db: AsyncSession, product: Product) -> None:
    if await _product_has_orders(db, product.id):
        raise HTTPException(
            status_code=409,
            detail="Não é possível excluir um produto que já possui pedidos registrados"
        )
    await db.delete(product)
    await db.commit()
