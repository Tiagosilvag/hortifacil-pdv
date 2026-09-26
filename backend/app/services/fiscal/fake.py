"""Provedor falso: nenhum teste chama a SEFAZ. Também serve para desenvolver as telas sem contratar nada."""
from typing import Any, Literal

from app.services.fiscal.provider import CancelResult, EmitResult, ProviderUnavailable

Mode = Literal["authorized", "rejected", "timeout"]


class FakeFiscalProvider:
    name = "fake"

    def __init__(self, mode: Mode = "authorized") -> None:
        self.mode = mode
        self.emitted: dict[str, EmitResult] = {}
        self.cancelled: set[str] = set()

    async def emit_nfce(self, payload: dict[str, Any]) -> EmitResult:
        if self.mode == "timeout":
            raise ProviderUnavailable("tempo esgotado (provedor falso)")
        if self.mode == "rejected":
            return EmitResult(status="rejected", code="778", message="NCM do item 1 inválido (provedor falso)")
        reference = payload["reference"]
        if reference in self.emitted:  # idempotência: a mesma referência devolve a mesma nota
            return self.emitted[reference]
        number = len(self.emitted) + 1
        key = str(number).rjust(44, "0")
        result = EmitResult(
            status="authorized",
            code="100",
            message="Autorizado o uso da NFC-e (provedor falso)",
            number=str(number),
            series=str(payload["series"]),
            key=key,
            protocol=f"9{str(number).rjust(14, '0')}",
            qr_url=f"https://fake.invalid/qr/{key}",
            xml_url=f"https://fake.invalid/xml/{key}",
            raw={"fake": True, "reference": reference},
        )
        self.emitted[reference] = result
        return result

    async def get_nfce(self, reference: str) -> EmitResult:
        if reference not in self.emitted:
            raise ProviderUnavailable(f"nota {reference} não encontrada (provedor falso)")
        return self.emitted[reference]

    async def cancel_nfce(self, reference: str, reason: str) -> CancelResult:
        if reference not in self.emitted:
            raise ProviderUnavailable(f"nota {reference} não encontrada (provedor falso)")
        self.cancelled.add(reference)
        return CancelResult(cancelled=True, code="135", message="Cancelamento homologado (provedor falso)")
