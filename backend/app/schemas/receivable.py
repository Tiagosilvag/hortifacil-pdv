import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, field_validator, model_validator

from app.models.receivable import ReceivableStatus
from app.schemas.customer import CustomerMinimal


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
    customer: CustomerMinimal | None = None
    order_number: int | None = None

    @model_validator(mode="before")
    @classmethod
    def _resolve_nested(cls, obj: Any) -> Any:
        if isinstance(obj, dict):
            return obj
        data: dict[str, Any] = {}
        for f in (
            "id", "customer_id", "order_id", "amount", "amount_paid",
            "due_date", "status", "notes", "paid_at", "paid_by_name", "created_at",
        ):
            data[f] = getattr(obj, f, None)
        try:
            data["customer"] = obj.customer if obj.customer else None
        except Exception:
            pass
        try:
            data["order_number"] = obj.order.order_number if obj.order else None
        except Exception:
            pass
        return data


class PaymentCreate(BaseModel):
    amount: Decimal
    notes: str | None = None

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Valor do pagamento deve ser maior que zero")
        return v
