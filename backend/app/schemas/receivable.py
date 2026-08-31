import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, field_validator

from app.models.receivable import ReceivableStatus


class ReceivableOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    customer_id: uuid.UUID
    order_id: uuid.UUID
    amount: Decimal
    amount_paid: Decimal
    due_date: date | None
    status: ReceivableStatus
    notes: str | None
    paid_at: datetime | None
    paid_by_name: str | None
    created_at: datetime

    @property
    def amount_remaining(self) -> Decimal:
        return self.amount - self.amount_paid


class PaymentCreate(BaseModel):
    amount: Decimal
    notes: str | None = None

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Valor do pagamento deve ser maior que zero")
        return v
