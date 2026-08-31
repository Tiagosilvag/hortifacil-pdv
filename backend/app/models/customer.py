import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CustomerType(str, enum.Enum):
    counter = "counter"      # balcão
    external = "external"    # externo (hotéis, pousadas, atacado)
    hotel = "hotel"
    inn = "inn"              # pousada
    wholesale = "wholesale"  # atacado


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    document: Mapped[str | None] = mapped_column(String(20), nullable=True)  # CPF ou CNPJ
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    customer_type: Mapped[CustomerType] = mapped_column(
        Enum(CustomerType), default=CustomerType.counter, nullable=False
    )
    credit_limit: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=Decimal("0.00"), nullable=False
    )
    balance_due: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=Decimal("0.00"), nullable=False
    )
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    orders: Mapped[list["Order"]] = relationship(back_populates="customer")  # type: ignore[name-defined]
    receivables: Mapped[list["Receivable"]] = relationship(back_populates="customer")  # type: ignore[name-defined]
