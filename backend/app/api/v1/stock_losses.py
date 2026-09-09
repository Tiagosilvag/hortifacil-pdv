from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.product import Product
from app.models.stock_loss import StockLoss
from app.models.user import User
from app.schemas.stock_loss import StockLossCreate, StockLossOut

router = APIRouter(prefix="/stock-losses", tags=["stock-losses"])


@router.post("", response_model=StockLossOut, status_code=201)
async def create_loss(
    data: StockLossCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Product).where(Product.id == data.product_id, Product.is_active == True)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    product.stock = (product.stock or 0) - data.qty

    loss = StockLoss(
        product_id=product.id,
        product_name=product.name,
        unit_type=product.unit_type.value,
        qty=data.qty,
        reason=data.reason,
        created_by_id=current_user.id,
        created_by_name=current_user.name,
    )
    db.add(loss)
    await db.commit()
    await db.refresh(loss)
    return loss


@router.get("", response_model=list[StockLossOut])
async def list_losses(
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(StockLoss)
        .order_by(StockLoss.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())
