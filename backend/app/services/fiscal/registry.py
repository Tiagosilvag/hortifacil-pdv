"""Escolhe o adaptador de emissão a partir do MODO salvo nas configurações fiscais (banco), não de variável de ambiente.

Modos: `none` (desligado), `sefaz_direto` (o sistema fala com a SEFAZ com o certificado A1; o adaptador chega na etapa E2) e `fake`
(só em desenvolvimento). Um modo sem adaptador pronto devolve `None`: nada é emitido e a tela explica.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as app_settings
from app.models.fiscal import FiscalSettings
from app.services.fiscal.provider import FiscalProvider, get_provider

# Modos que emitem nota de verdade (o `fake` não conta). "provider" entra quando existir o adaptador do provedor.
REAL_MODES = ("sefaz_direto",)


def settings_query():
    """Consulta única da linha de configuração; a ordem fixa garante que todos leiam a mesma linha."""
    return select(FiscalSettings).order_by(FiscalSettings.id).limit(1)


def effective_mode(saved_mode: str | None) -> str:
    """O modo em vigor. Em desenvolvimento, FISCAL_PROVIDER=fake força o provedor falso (atalho de quem desenvolve)."""
    forced = (app_settings.FISCAL_PROVIDER or "").strip().lower()
    if forced == "fake" and app_settings.ENVIRONMENT == "development":
        return "fake"
    return saved_mode or "none"


def provider_for_mode(mode: str) -> FiscalProvider | None:
    """None = nada a emitir: modo desligado, ou modo cujo adaptador ainda não existe, ou provedor falso fora de desenvolvimento."""
    if mode == "fake":
        try:
            return get_provider("fake", app_settings.ENVIRONMENT)
        except RuntimeError:
            return None
    return None  # none e sefaz_direto (o adaptador chega na E2)


def provider_for_settings(row: object | None) -> FiscalProvider | None:
    return provider_for_mode(effective_mode(getattr(row, "mode", None)))


def mode_available(mode: str) -> bool:
    """O adaptador deste modo existe neste sistema?"""
    return provider_for_mode(mode) is not None


async def load_provider(db: AsyncSession) -> FiscalProvider | None:
    """O provedor a usar agora, conforme o modo salvo. Com o atalho de desenvolvimento nem consulta o banco."""
    if effective_mode(None) == "fake":
        return provider_for_mode("fake")
    row = (await db.execute(settings_query())).scalar_one_or_none()
    return provider_for_settings(row)
