import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class FiscalSettings(Base):
    """Dados da empresa emitente. Uma única linha. Os segredos (token do provedor, CSC) ficam em variável de ambiente."""

    __tablename__ = "fiscal_settings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    environment: Mapped[str] = mapped_column(String(15), nullable=False, default="homologacao", server_default="homologacao")
    regime: Mapped[str] = mapped_column(String(10), nullable=False, default="normal", server_default="normal")
    series: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    # Prazo para cancelar uma NFC-e depois de emitida. Varia por UF (30 min ou 24 h): confirmar com o contador.
    cancel_window_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30, server_default="30")
    cnpj: Mapped[str | None] = mapped_column(String(14), nullable=True)
    ie: Mapped[str | None] = mapped_column(String(20), nullable=True)
    legal_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    street: Mapped[str | None] = mapped_column(String(255), nullable=True)
    number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    district: Mapped[str | None] = mapped_column(String(100), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    city_ibge: Mapped[str | None] = mapped_column(String(7), nullable=True)
    state: Mapped[str | None] = mapped_column(String(2), nullable=True)
    zip_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    updated_by_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    production_confirmed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    production_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class FiscalDefault(Base):
    """Padrão fiscal por categoria. O produto herda campo a campo o que estiver vazio nele."""

    __tablename__ = "fiscal_defaults"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    category: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    ncm: Mapped[str | None] = mapped_column(String(8), nullable=True)
    cest: Mapped[str | None] = mapped_column(String(7), nullable=True)
    origem: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cfop: Mapped[str | None] = mapped_column(String(4), nullable=True)
    cst_icms: Mapped[str | None] = mapped_column(String(2), nullable=True)
    aliquota_icms: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    cst_pis: Mapped[str | None] = mapped_column(String(2), nullable=True)
    cst_cofins: Mapped[str | None] = mapped_column(String(2), nullable=True)


class FiscalEvent(Base):
    """Auditoria imutável: cada chamada ao provedor (emissão ou cancelamento) e o que ele respondeu."""

    __tablename__ = "fiscal_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)      # emit | cancel
    status: Mapped[str] = mapped_column(String(20), nullable=False)    # authorized | rejected | pending | cancelled
    code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by_name: Mapped[str] = mapped_column(String(255), nullable=False)
