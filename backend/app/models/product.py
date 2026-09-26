import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Enum, Integer, Numeric, String, func
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
    code: Mapped[int] = mapped_column(Integer, nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    barcode: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    unit_type: Mapped[UnitType] = mapped_column(
        Enum(UnitType), default=UnitType.unit, nullable=False
    )
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    stock: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False, default=Decimal("0"), server_default="0")
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Dados fiscais (NFC-e). Vazio = herda o padrão da categoria; ver app/services/fiscal/rules.py
    ncm: Mapped[str | None] = mapped_column(String(8), nullable=True)
    cest: Mapped[str | None] = mapped_column(String(7), nullable=True)
    origem: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cfop: Mapped[str | None] = mapped_column(String(4), nullable=True)
    cst_icms: Mapped[str | None] = mapped_column(String(2), nullable=True)
    aliquota_icms: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    cst_pis: Mapped[str | None] = mapped_column(String(2), nullable=True)
    cst_cofins: Mapped[str | None] = mapped_column(String(2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
