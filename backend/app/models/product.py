import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UnitType(str, enum.Enum):
    unit = "unit"    # unidade
    kg = "kg"
    gram = "gram"    # grama
    liter = "liter"  # litro
    box = "box"      # caixa
    bunch = "bunch"  # maço


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    barcode: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    unit_type: Mapped[UnitType] = mapped_column(
        Enum(UnitType), default=UnitType.unit, nullable=False
    )
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
