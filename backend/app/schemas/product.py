import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, field_validator

from app.models.product import UnitType
from app.schemas.fiscal import FiscalFieldsIn, FiscalFieldsOut


class ProductCreate(FiscalFieldsIn):
    name: str
    barcode: str | None = None
    unit_type: UnitType = UnitType.unit
    price: Decimal
    category: str
    stock: Decimal = Decimal("0")
    expiry_date: date | None = None

    @field_validator("price")
    @classmethod
    def price_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Preço deve ser maior que zero")
        return v


class ProductUpdate(FiscalFieldsIn):
    name: str | None = None
    barcode: str | None = None
    unit_type: UnitType | None = None
    price: Decimal | None = None
    category: str | None = None
    is_active: bool | None = None
    stock: Decimal | None = None
    expiry_date: date | None = None

    @field_validator("price")
    @classmethod
    def price_positive(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v <= 0:
            raise ValueError("Preço deve ser maior que zero")
        return v


class ProductOut(FiscalFieldsOut):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    code: int
    name: str
    barcode: str | None
    unit_type: UnitType
    price: Decimal
    category: str | None
    stock: Decimal
    expiry_date: date | None
    is_active: bool
    created_at: datetime
    has_orders: bool = False
