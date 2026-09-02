import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, field_validator

from app.models.customer import CustomerType


class CustomerCreate(BaseModel):
    name: str
    phone: str | None = None
    document: str | None = None
    address: str | None = None
    customer_type: CustomerType = CustomerType.counter
    credit_limit: Decimal = Decimal("0.00")
    notes: str | None = None

    @field_validator("credit_limit")
    @classmethod
    def credit_limit_non_negative(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("Limite de crédito não pode ser negativo")
        return v


class CustomerUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    document: str | None = None
    address: str | None = None
    customer_type: CustomerType | None = None
    credit_limit: Decimal | None = None
    notes: str | None = None
    is_active: bool | None = None

    @field_validator("credit_limit")
    @classmethod
    def credit_limit_non_negative(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v < 0:
            raise ValueError("Limite de crédito não pode ser negativo")
        return v


class CustomerOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    phone: str | None
    document: str | None
    address: str | None
    customer_type: CustomerType
    credit_limit: Decimal
    balance_due: Decimal
    is_blocked: bool
    notes: str | None
    is_active: bool
    created_at: datetime


class CustomerMinimal(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    is_blocked: bool
    balance_due: Decimal
    credit_limit: Decimal


class CustomerListOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    phone: str | None
    customer_type: CustomerType
    credit_limit: Decimal
    balance_due: Decimal
    is_blocked: bool
    is_active: bool
