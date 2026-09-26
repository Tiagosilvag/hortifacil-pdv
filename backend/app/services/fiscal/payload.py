"""Monta o payload canônico da NFC-e a partir do pedido. Sem banco e sem rede: os adaptadores dos provedores traduzem este
formato para a API de cada um."""
import re
from decimal import ROUND_DOWN, Decimal
from typing import Any

from app.services.fiscal.rules import cst_composto

CENT = Decimal("0.01")

# Tabela de meios de pagamento da NFC-e (tPag).
PAYMENT_METHODS = {"cash": "01", "credit_card": "03", "debit_card": "04", "pix": "17"}

# Unidade comercial da nota por unidade do PDV. "gram" e "bunch" a confirmar com o contador/provedor.
UNITS = {"unit": "UN", "kg": "KG", "gram": "G", "liter": "L", "box": "CX", "bunch": "MC"}


def _money(value: Decimal | float | int | str) -> str:
    return f"{Decimal(str(value)).quantize(CENT):.2f}"


def allocate_discount(subtotals: list[Decimal], discount: Decimal) -> list[Decimal]:
    """Reparte o desconto entre os itens proporcionalmente ao valor. Fecha o total exato e nunca passa do valor do item."""
    gross = sum(subtotals, Decimal("0"))
    discount = min(max(discount, Decimal("0")), gross).quantize(CENT)
    if discount == 0 or gross == 0:
        return [Decimal("0.00") for _ in subtotals]
    shares = [(discount * sub / gross).quantize(CENT, rounding=ROUND_DOWN) for sub in subtotals]
    remainder = discount - sum(shares)
    while remainder > 0:
        gave = False
        for i in range(len(shares) - 1, -1, -1):  # do último para o primeiro, só onde ainda cabe um centavo
            if remainder > 0 and shares[i] < subtotals[i]:
                shares[i] += CENT
                remainder -= CENT
                gave = True
        if not gave:
            break
    return shares


def _consumer(customer: Any) -> dict[str, str] | None:
    digits = re.sub(r"\D", "", getattr(customer, "document", None) or "")
    if len(digits) == 11:
        return {"kind": "cpf", "document": digits}
    if len(digits) == 14:
        return {"kind": "cnpj", "document": digits}
    return None


def _payments(order: Any) -> list[dict[str, str]]:
    payment_type = getattr(order.payment_type, "value", order.payment_type)
    if payment_type == "mixed":
        parts = [(split["type"], split["amount"]) for split in (order.payment_splits or [])]
    else:
        parts = [(payment_type, order.total)]
    payments = []
    for kind, amount in parts:
        if kind not in PAYMENT_METHODS:
            raise ValueError(f"Forma de pagamento sem código na NFC-e: {kind}")
        payments.append({"method": PAYMENT_METHODS[kind], "amount": _money(amount)})
    return payments


def build_nfce_payload(order: Any, settings: Any, resolved: dict[Any, dict[str, Any]]) -> dict[str, Any]:
    """`resolved` = dados fiscais já combinados (produto + padrão da categoria) por product_id."""
    subtotals = [Decimal(item.subtotal) for item in order.items]
    gross = sum(subtotals, Decimal("0"))
    discount = max(gross - Decimal(order.total), Decimal("0"))  # o desconto efetivo, já com o piso em zero do pedido
    shares = allocate_discount(subtotals, discount)

    items = []
    for number, (item, share) in enumerate(zip(order.items, shares), start=1):
        fiscal = resolved[item.product_id]
        subtotal = Decimal(item.subtotal)
        items.append({
            "number": number,
            "code": str(item.product_code),
            "description": item.product_name,
            "unit": UNITS[item.unit_type],
            "qty": f"{Decimal(item.qty):.4f}",
            "unit_price": _money(item.unit_price),
            "gross": _money(subtotal),
            "discount": _money(share),
            "net": _money(subtotal - share),
            "ncm": fiscal["ncm"],
            "cest": fiscal["cest"],
            "cfop": fiscal["cfop"],
            "origin": fiscal["origem"],
            "cst_icms": fiscal["cst_icms"],
            "cst_full": cst_composto(fiscal["origem"], fiscal["cst_icms"]),
            "icms_rate": _money(fiscal["aliquota_icms"]) if fiscal["aliquota_icms"] is not None else None,
            "cst_pis": fiscal["cst_pis"],
            "cst_cofins": fiscal["cst_cofins"],
        })

    prefix = "prod" if settings.environment == "producao" else "hml"
    return {
        "reference": f"{prefix}-{order.order_number}",
        "environment": settings.environment,
        "series": settings.series,
        "issuer": {
            "cnpj": settings.cnpj,
            "ie": settings.ie,
            "name": settings.legal_name,
            "regime": settings.regime,
            "address": {
                "street": settings.street, "number": settings.number, "district": settings.district,
                "city": settings.city, "city_ibge": settings.city_ibge, "state": settings.state,
                "zip_code": settings.zip_code,
            },
        },
        "consumer": _consumer(order.customer),
        "items": items,
        "payments": _payments(order),
        "totals": {"gross": _money(gross), "discount": _money(discount), "net": _money(gross - discount)},
    }
