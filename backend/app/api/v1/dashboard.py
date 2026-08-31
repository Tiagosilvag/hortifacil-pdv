from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.customer import Customer
from app.models.order import Order, OrderStatus, PaymentType
from app.models.receivable import Receivable, ReceivableStatus
from app.models.user import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class DashboardOut(BaseModel):
    today_sales_total: Decimal
    today_sales_count: int
    open_receivables_total: Decimal
    open_receivables_count: int
    blocked_customers_count: int
    overdue_receivables_count: int
    last_7_days_total: Decimal


@router.get("", response_model=DashboardOut)
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    today_start = datetime.combine(date.today(), datetime.min.time()).replace(
        tzinfo=timezone.utc
    )
    week_start = today_start - timedelta(days=7)

    # Vendas de hoje
    today_result = await db.execute(
        select(func.coalesce(func.sum(Order.total), 0), func.count(Order.id)).where(
            Order.created_at >= today_start,
            Order.status != OrderStatus.cancelled,
        )
    )
    today_total, today_count = today_result.one()

    # Últimos 7 dias
    week_result = await db.execute(
        select(func.coalesce(func.sum(Order.total), 0)).where(
            Order.created_at >= week_start,
            Order.status != OrderStatus.cancelled,
        )
    )
    week_total = week_result.scalar_one()

    # Contas a receber abertas
    recv_result = await db.execute(
        select(func.coalesce(func.sum(Receivable.amount - Receivable.amount_paid), 0), func.count(Receivable.id)).where(
            Receivable.status.in_([ReceivableStatus.open, ReceivableStatus.partial])
        )
    )
    recv_total, recv_count = recv_result.one()

    # Clientes bloqueados
    blocked_result = await db.execute(
        select(func.count(Customer.id)).where(Customer.is_blocked == True, Customer.is_active == True)
    )
    blocked_count = blocked_result.scalar_one()

    # Recebíveis vencidos (sem data de vencimento definida não contam)
    overdue_result = await db.execute(
        select(func.count(Receivable.id)).where(
            Receivable.status.in_([ReceivableStatus.open, ReceivableStatus.partial]),
            Receivable.due_date < date.today(),
        )
    )
    overdue_count = overdue_result.scalar_one()

    return DashboardOut(
        today_sales_total=today_total,
        today_sales_count=today_count,
        open_receivables_total=recv_total,
        open_receivables_count=recv_count,
        blocked_customers_count=blocked_count,
        overdue_receivables_count=overdue_count,
        last_7_days_total=week_total,
    )
