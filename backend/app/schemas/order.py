import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

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
    product_code: int | None
    barcode: str | None
    unit_type: str
    qty: Decimal
    unit_price: Decimal
    subtotal: Decimal


class PaymentSplit(BaseModel):
    type: str
    amount: Decimal

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Valor de pagamento deve ser maior que zero")
        return v


class OrderCreate(BaseModel):
    customer_id: uuid.UUID | None = None
    payment_type: PaymentType | None = None
    payments: list[PaymentSplit] | None = None
    items: list[OrderItemCreate]
    discount: Decimal = Decimal("0.00")
    notes: str | None = None

    @model_validator(mode="after")
    def validate_order(self) -> "OrderCreate":
        if not self.items:
            raise ValueError("Pedido deve ter ao menos um item")

        if not self.payment_type and not self.payments:
            raise ValueError("Informe o método de pagamento")

        has_installment = False
        if self.payments:
            has_installment = any(p.type == "installment" for p in self.payments)
        elif self.payment_type == PaymentType.installment:
            has_installment = True

        if has_installment and not self.customer_id:
            raise ValueError("Venda fiado exige um cliente cadastrado")

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
    payment_splits: list[Any] | None = None
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
    payment_splits: list[Any] | None = None
    status: OrderStatus
    notes: str | None
    created_at: datetime
    created_by_name: str
    items: list[OrderItemOut]


class OrderCancelRequest(BaseModel):
    reason: str | None = None
