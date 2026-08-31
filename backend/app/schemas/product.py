import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, field_validator

from app.models.product import UnitType


class ProductCreate(BaseModel):
    name: str
    barcode: str | None = None
    unit_type: UnitType = UnitType.unit
    price: Decimal
    category: str | None = None

    @field_validator("price")
    @classmethod
    def price_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Preço deve ser maior que zero")
        return v


class ProductUpdate(BaseModel):
    name: str | None = None
    barcode: str | None = None
    unit_type: UnitType | None = None
    price: Decimal | None = None
    category: str | None = None
    is_active: bool | None = None

    @field_validator("price")
    @classmethod
    def price_positive(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v <= 0:
            raise ValueError("Preço deve ser maior que zero")
        return v


class ProductOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    barcode: str | None
    unit_type: UnitType
    price: Decimal
    category: str | None
    is_active: bool
    created_at: datetime
