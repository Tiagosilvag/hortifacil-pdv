"""Busca de produto por código de barras: um produto, nenhum, e o caso de código repetido (409, e não erro 500)."""
import asyncio
import os
from types import SimpleNamespace

import pytest

# O serviço importa `app.core.config`, que exige estas variáveis já no import.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://teste:teste@localhost/teste")
os.environ.setdefault("DATABASE_URL_SYNC", "postgresql://teste:teste@localhost/teste")
os.environ.setdefault("SECRET_KEY", "teste")

from fastapi import HTTPException  # noqa: E402

from app.services import product_service  # noqa: E402


class FakeResult:
    def __init__(self, items):
        self._items = list(items)

    def scalars(self):
        return self

    def all(self):
        return list(self._items)

    def scalar_one_or_none(self):
        return self._items[0] if self._items else None


class FakeDb:
    """1ª consulta = produtos com o código de barras; as seguintes (pedidos do produto) voltam vazias."""

    def __init__(self, products):
        self.products = products
        self.calls = 0

    async def execute(self, _statement):
        self.calls += 1
        return FakeResult(self.products if self.calls == 1 else [])


def product(name="BANANA PRATA KG"):
    return SimpleNamespace(id=name, name=name, barcode="7891234567895", is_active=True)


def lookup(products):
    return asyncio.run(product_service.get_product_by_barcode(FakeDb(products), "7891234567895"))


def test_finds_the_only_product_with_that_barcode():
    found = lookup([product("OVOS")])
    assert found.name == "OVOS"
    assert found.has_orders is False


def test_unknown_barcode_returns_none():
    assert lookup([]) is None


def test_two_active_products_with_the_same_barcode_is_a_409_not_a_500():
    with pytest.raises(HTTPException) as info:
        lookup([product("OVOS A"), product("OVOS B")])
    assert info.value.status_code == 409
    assert "repetido" in info.value.detail
