import re
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ValidationInfo, field_validator, model_validator

from app.services.fiscal.rules import FISCAL_FIELDS, normalize_field


class FiscalFieldsIn(BaseModel):
    """Campos fiscais opcionais de produto e de padrão por categoria, validados e normalizados na entrada."""

    ncm: str | None = None
    cest: str | None = None
    origem: int | None = None
    cfop: str | None = None
    cst_icms: str | None = None
    aliquota_icms: Decimal | None = None
    cst_pis: str | None = None
    cst_cofins: str | None = None

    @field_validator(*FISCAL_FIELDS, mode="before")
    @classmethod
    def _normalize(cls, value, info: ValidationInfo):
        return normalize_field(info.field_name, value)


class FiscalFieldsOut(BaseModel):
    ncm: str | None = None
    cest: str | None = None
    origem: int | None = None
    cfop: str | None = None
    cst_icms: str | None = None
    aliquota_icms: Decimal | None = None
    cst_pis: str | None = None
    cst_cofins: str | None = None


class FiscalDefaultIn(FiscalFieldsIn):
    category: str

    @field_validator("category")
    @classmethod
    def category_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Categoria obrigatória")
        return v


class FiscalDefaultOut(FiscalFieldsOut):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    category: str


def _only_digits(value: str | None, label: str, length: int | None = None) -> str | None:
    if value is None or not str(value).strip():
        return None
    digits = re.sub(r"\D", "", str(value))
    if not digits or (length is not None and len(digits) != length):
        raise ValueError(f"{label} inválido" if length is None else f"{label} deve ter {length} dígitos")
    return digits


class FiscalSettingsIn(BaseModel):
    enabled: bool = False
    environment: Literal["homologacao", "producao"] = "homologacao"
    regime: Literal["normal", "simples"] = "normal"
    series: int = 1
    cnpj: str | None = None
    ie: str | None = None
    legal_name: str | None = None
    street: str | None = None
    number: str | None = None
    district: str | None = None
    city: str | None = None
    city_ibge: str | None = None
    state: str | None = None
    zip_code: str | None = None

    @field_validator("series")
    @classmethod
    def series_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Série deve ser 1 ou mais")
        return v

    @field_validator("cnpj")
    @classmethod
    def _cnpj(cls, v):
        return _only_digits(v, "CNPJ", 14)

    @field_validator("ie")
    @classmethod
    def _ie(cls, v):
        return _only_digits(v, "Inscrição estadual")

    @field_validator("city_ibge")
    @classmethod
    def _ibge(cls, v):
        return _only_digits(v, "Código IBGE do município", 7)

    @field_validator("zip_code")
    @classmethod
    def _zip(cls, v):
        return _only_digits(v, "CEP", 8)

    @field_validator("state")
    @classmethod
    def _state(cls, v):
        if v is None or not v.strip():
            return None
        v = v.strip().upper()
        if not re.fullmatch(r"[A-Z]{2}", v):
            raise ValueError("UF deve ter 2 letras")
        return v

    @model_validator(mode="after")
    def enabled_needs_complete_data(self) -> "FiscalSettingsIn":
        if self.enabled and self.regime != "normal":
            raise ValueError("A emissão só está pronta para o regime normal (o Simples Nacional usa CSOSN, ainda não suportado)")
        if self.enabled:
            needed = {
                "CNPJ": self.cnpj, "Inscrição estadual": self.ie, "Razão social": self.legal_name,
                "Rua": self.street, "Número": self.number, "Bairro": self.district, "Município": self.city,
                "Código IBGE do município": self.city_ibge, "UF": self.state, "CEP": self.zip_code,
            }
            missing = [label for label, value in needed.items() if not value]
            if missing:
                raise ValueError("Para ligar a emissão, preencha: " + ", ".join(missing))
        return self


class FiscalSettingsOut(BaseModel):
    model_config = {"from_attributes": True}

    enabled: bool
    environment: str
    regime: str
    series: int
    cnpj: str | None
    ie: str | None
    legal_name: str | None
    street: str | None
    number: str | None
    district: str | None
    city: str | None
    city_ibge: str | None
    state: str | None
    zip_code: str | None
    updated_at: datetime | None = None
    updated_by_name: str | None = None


class FiscalStatusOut(BaseModel):
    """O que o PDV precisa saber para mostrar o estado da emissão: ligada, ambiente e se há provedor configurado."""

    enabled: bool
    provider_configured: bool
    environment: str


class PendingProductOut(BaseModel):
    id: uuid.UUID
    code: int
    name: str
    category: str | None
    missing: list[str]
