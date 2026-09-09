import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, field_validator


class StockLossCreate(BaseModel):
    product_id: uuid.UUID
    qty: Decimal
    reason: str | None = None

    @field_validator("qty")
    @classmethod
    def qty_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Quantidade deve ser maior que zero")
        return v


class StockLossOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    product_id: uuid.UUID | None
    product_name: str
    unit_type: str
    qty: Decimal
    reason: str | None
    created_by_name: str
    created_at: datetime
