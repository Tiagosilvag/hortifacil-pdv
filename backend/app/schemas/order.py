import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, field_validator, model_validator

from app.models.order import OrderStatus, PaymentType
from app.schemas.customer import CustomerMinimal


class OrderItemCreate(BaseModel):
    product_id: uuid.UUID
    qty: Decimal

    @field_validator("qty")
    @classmethod
    def qty_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Quantidade deve ser maior que zero")
        return v


class OrderItemOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    unit_type: str
    qty: Decimal
    unit_price: Decimal
    subtotal: Decimal


class OrderCreate(BaseModel):
    customer_id: uuid.UUID | None = None
    payment_type: PaymentType
    items: list[OrderItemCreate]
    discount: Decimal = Decimal("0.00")
    notes: str | None = None

    @model_validator(mode="after")
    def validate_installment_needs_customer(self) -> "OrderCreate":
        if self.payment_type == PaymentType.installment and not self.customer_id:
            raise ValueError("Venda fiado exige um cliente cadastrado")
        if not self.items:
            raise ValueError("Pedido deve ter ao menos um item")
        return self


class OrderInvoiceUpdate(BaseModel):
    invoice_number: str | None = None
    invoice_series: str | None = None
    invoice_key: str | None = None


class OrderOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    order_number: int
    customer_id: uuid.UUID | None
    customer: CustomerMinimal | None = None
    total: Decimal
    discount: Decimal
    payment_type: PaymentType
    status: OrderStatus
    notes: str | None
    invoice_number: str | None
    invoice_series: str | None
    invoice_key: str | None
    created_at: datetime
    created_by_name: str
    items: list[OrderItemOut]


class OrderListOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    order_number: int
    customer_id: uuid.UUID | None
    customer: CustomerMinimal | None = None
    total: Decimal
    discount: Decimal
    payment_type: PaymentType
    status: OrderStatus
    notes: str | None
    created_at: datetime
    created_by_name: str
    items: list[OrderItemOut]


class OrderCancelRequest(BaseModel):
    reason: str | None = None
