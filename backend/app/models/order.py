import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime, Enum, ForeignKey, Integer, JSON, Numeric,
    Sequence, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

order_number_seq = Sequence("order_number_seq", start=1, metadata=Base.metadata)


class PaymentType(str, enum.Enum):
    cash = "cash"              # dinheiro
    pix = "pix"
    credit_card = "credit_card"
    debit_card = "debit_card"
    installment = "installment"  # fiado/parcelado
    mixed = "mixed"            # múltiplos métodos


class OrderStatus(str, enum.Enum):
    pending = "pending"
    delivered = "delivered"
    cancelled = "cancelled"


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    order_number: Mapped[int] = mapped_column(
        Integer,
        order_number_seq,
        server_default=order_number_seq.next_value(),
        unique=True,
        nullable=False,
        index=True,
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    discount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    payment_type: Mapped[PaymentType] = mapped_column(Enum(PaymentType), nullable=False)
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus), default=OrderStatus.pending, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_splits: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Nota Fiscal
    invoice_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    invoice_series: Mapped[str | None] = mapped_column(String(10), nullable=True)
    invoice_key: Mapped[str | None] = mapped_column(String(44), nullable=True)
    # NFC-e: not_required | pending | authorized | rejected | cancelled
    fiscal_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="not_required", server_default="not_required"
    )
    fiscal_protocol: Mapped[str | None] = mapped_column(String(30), nullable=True)
    fiscal_qr_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    fiscal_xml_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    fiscal_emitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fiscal_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    fiscal_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_by_name: Mapped[str] = mapped_column(String(255), nullable=False)

    customer: Mapped["Customer | None"] = relationship(back_populates="orders")  # type: ignore[name-defined]
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    receivables: Mapped[list["Receivable"]] = relationship(back_populates="order")  # type: ignore[name-defined]


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), nullable=False
    )
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)  # snapshot no momento da venda
    product_code: Mapped[int | None] = mapped_column(Integer, nullable=True)  # snapshot
    barcode: Mapped[str | None] = mapped_column(String(50), nullable=True)  # snapshot
    unit_type: Mapped[str] = mapped_column(String(20), nullable=False)       # snapshot
    qty: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)  # snapshot
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # Dados fiscais usados na emissão (cópia: mudar o cadastro depois não altera a nota já emitida)
    ncm: Mapped[str | None] = mapped_column(String(8), nullable=True)
    cest: Mapped[str | None] = mapped_column(String(7), nullable=True)
    origem: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cfop: Mapped[str | None] = mapped_column(String(4), nullable=True)
    cst_icms: Mapped[str | None] = mapped_column(String(2), nullable=True)
    aliquota_icms: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    cst_pis: Mapped[str | None] = mapped_column(String(2), nullable=True)
    cst_cofins: Mapped[str | None] = mapped_column(String(2), nullable=True)

    order: Mapped["Order"] = relationship(back_populates="items")
