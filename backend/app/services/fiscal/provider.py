"""Contrato do provedor de emissão fiscal. O resto do sistema só conhece esta interface; cada provedor real é um adaptador."""
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol


class ProviderUnavailable(Exception):
    """Provedor ou SEFAZ fora do ar, timeout ou erro de rede: a nota fica pendente e pode ser tentada de novo."""


@dataclass(frozen=True)
class EmitResult:
    status: Literal["authorized", "rejected", "pending"]
    code: str | None = None
    message: str | None = None
    number: str | None = None
    series: str | None = None
    key: str | None = None
    protocol: str | None = None
    qr_url: str | None = None
    xml_url: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CancelResult:
    cancelled: bool
    code: str | None = None
    message: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


class FiscalProvider(Protocol):
    name: str

    async def emit_nfce(self, payload: dict[str, Any]) -> EmitResult: ...

    async def get_nfce(self, reference: str) -> EmitResult: ...

    async def cancel_nfce(self, reference: str, reason: str) -> CancelResult: ...


def get_provider(name: str, environment: str) -> FiscalProvider | None:
    """None = emissão fiscal desligada. O provedor falso só roda em desenvolvimento: ele "autorizaria" notas que não existem."""
    name = (name or "").strip().lower()
    if name in ("", "none"):
        return None
    if name == "fake":
        if environment != "development":
            raise RuntimeError("O provedor fiscal falso só pode ser usado em desenvolvimento, nunca em produção")
        from app.services.fiscal.fake import shared_fake_provider

        return shared_fake_provider()  # o mesmo entre as chamadas: senão o cancelamento nunca encontra a nota emitida antes
    raise ValueError(f"Provedor fiscal desconhecido: {name}")
