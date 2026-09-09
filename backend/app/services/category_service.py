import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.schemas.category import CategoryCreate


async def list_categories(db: AsyncSession, active_only: bool = False) -> list[Category]:
    q = select(Category)
    if active_only:
        q = q.where(Category.is_active == True)
    q = q.order_by(Category.name)
    result = await db.execute(q)
    return list(result.scalars().all())


async def create_category(db: AsyncSession, data: CategoryCreate) -> Category:
    existing = await db.execute(
        select(Category).where(Category.name.ilike(data.name))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Categoria com esse nome já existe")
    category = Category(name=data.name.strip())
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


async def toggle_category(db: AsyncSession, category_id: uuid.UUID) -> Category:
    result = await db.execute(select(Category).where(Category.id == category_id))
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    category.is_active = not category.is_active
    await db.commit()
    await db.refresh(category)
    return category


async def delete_category(db: AsyncSession, category_id: uuid.UUID) -> None:
    result = await db.execute(select(Category).where(Category.id == category_id))
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    await db.delete(category)
    await db.commit()
