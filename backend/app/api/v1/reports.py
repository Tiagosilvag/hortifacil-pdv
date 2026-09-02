from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.order import Order, OrderStatus, PaymentType
from app.models.user import User

router = APIRouter(prefix="/reports", tags=["reports"])


class PaymentBreakdown(BaseModel):
    payment_type: str
    total: Decimal
    count: int


class DayBreakdown(BaseModel):
    day: date
    total: Decimal
    count: int


class SalesReportOut(BaseModel):
    date_from: date
    date_to: date
    total: Decimal
    count: int
    avg_ticket: Decimal
    cancelled_count: int
    by_payment: list[PaymentBreakdown]
    by_day: list[DayBreakdown]


@router.get("/sales", response_model=SalesReportOut)
async def sales_report(
    date_from: date,
    date_to: date,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    dt_from = datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc)
    dt_to = datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=timezone.utc)

    # Total de vendas (excluindo cancelados)
    summary = await db.execute(
        select(
            func.coalesce(func.sum(Order.total), 0),
            func.count(Order.id),
        ).where(
            Order.created_at >= dt_from,
            Order.created_at <= dt_to,
            Order.status != OrderStatus.cancelled,
        )
    )
    total, count = summary.one()
    avg_ticket = (total / count) if count > 0 else Decimal("0")

    # Cancelados
    cancelled = await db.execute(
        select(func.count(Order.id)).where(
            Order.created_at >= dt_from,
            Order.created_at <= dt_to,
            Order.status == OrderStatus.cancelled,
        )
    )
    cancelled_count = cancelled.scalar_one()

    # Por forma de pagamento
    by_pay = await db.execute(
        select(
            Order.payment_type,
            func.coalesce(func.sum(Order.total), 0),
            func.count(Order.id),
        ).where(
            Order.created_at >= dt_from,
            Order.created_at <= dt_to,
            Order.status != OrderStatus.cancelled,
        ).group_by(Order.payment_type)
    )
    payment_breakdown = [
        PaymentBreakdown(payment_type=row[0].value, total=row[1], count=row[2])
        for row in by_pay.all()
    ]

    # Por dia — usa DATE() truncado
    by_day_q = await db.execute(
        select(
            func.date(Order.created_at),
            func.coalesce(func.sum(Order.total), 0),
            func.count(Order.id),
        ).where(
            Order.created_at >= dt_from,
            Order.created_at <= dt_to,
            Order.status != OrderStatus.cancelled,
        ).group_by(func.date(Order.created_at))
        .order_by(func.date(Order.created_at))
    )
    day_breakdown = [
        DayBreakdown(day=row[0], total=row[1], count=row[2])
        for row in by_day_q.all()
    ]

    return SalesReportOut(
        date_from=date_from,
        date_to=date_to,
        total=total,
        count=count,
        avg_ticket=avg_ticket.quantize(Decimal("0.01")),
        cancelled_count=cancelled_count,
        by_payment=payment_breakdown,
        by_day=day_breakdown,
    )
