"""Regras de unidade e de categoria dos produtos importados (funções puras)."""
import re

from legacy_import.normalize import fold

_NUMERIC = re.compile(r"[\d.,]+")


def classify_unit(legacy_unit: str, name: str) -> str:
    """Devolve o valor de UnitType do HortiFácil (kg / box / unit).

    `kg` se a unidade do Gestão Fácil for KG, ou se a descrição terminar com o
    token KG sem número antes (ex.: "UVA VITORIA KG"; "ALHO 1 KG" é embalagem e fica `unit`).
    `box` para CX e SC. Todo o resto (UN, PCT, PC, PT, EMB, GR, ML, LT, GF...) é `unit`.
    """
    unit = (legacy_unit or "").strip().upper()
    if unit == "KG":
        return "kg"
    tokens = fold(name).split()
    if tokens and tokens[-1] == "KG" and not (len(tokens) > 1 and _NUMERIC.fullmatch(tokens[-2])):
        return "kg"
    if unit in {"CX", "SC"}:
        return "box"
    return "unit"


DEFAULT_CATEGORY = "Outros"

# Ordem importa: a primeira regra que casar vence. Exceções específicas vêm antes das gerais.
# O texto comparado é `fold(nome)`: maiúsculo e sem acento.
_RULES: list[tuple[str, str]] = [
    # exceções: parecem fruta/legume/laticínio no nome, mas são outra coisa
    ("Mercearia", r"BATATA PALHA|LEITE (DE )?COCO|OLEO COCO|COCO RALADO|COCO SECO|COCADA|GOIABADA|"
                  r"BANANA PASSA|UVA PASSA|AMEIXA SECA|FRUTAS CRISTALIZADAS|EXTRATO TOM|CHAMPIGNON|"
                  r"MILHO (VD|TORRADO)|SARD|PASSA|MEL|NESCAU|ADOCANTE|MASSA MANDIOCA"),
    ("Mercearia", r"BISC\w*|BOLACHA|BOLCHA|BROWNIE|BOLINHO|BOLO|BROA|BROAS|DOCE|LOLITA|MASSA|ROSQ|"
                  r"KI PIMENTA|LANCHINHO|LAMB|SALGADINHO"),
    ("Legumes", r"PIMENTA (CHEIRO|DEDO MOCA|MALAGUETA|BIQUINHO GRAO) KG"),
    ("Limpeza e Higiene", r"AGUA SANIT\w*|ALCOOL|AMACIANTE|DESIFETANTE|DETERG\w*|ESPONJA|FLANELA|LA ACO|"
                          r"LIMPADOR|LUSTRA|PANO CHAO|PAPEL (HIG\w*|HING\w*|TOALHA)|POLIDOR|RODO|SABAO|"
                          r"SABONETE|SAB|SAO LIXO|SACO LIXO|TOALHA UMEDECIDA|VASSOURA|VEJA|PASTILHA|"
                          r"INSETICIDA|CREME DENTA[LI]|HIPLOCLORITO|BICARBONATO|BIRCABONATO"),
    ("Descartáveis e Utilidades", r"COPO|CANUDO|PALITO|GUARDANAPO|FOSFORO|ISQUEIRO|VELA|CARVAO|GELO|"
                                  r"FILTRO PAPEL|PAPEL ALUMINIO"),
    ("Bebidas", r"AGUA MINERAL|AGUA DIAMANTE|AGUA SANTA JOANA|AGUA DE COCO|ACHOC|CHA ICE|CHA LEAO|"
                r"COCA COLA|POWERADE"),
    ("Ovos e Laticínios", r"OVOS|LEITE|QUEIJO|MANTEIGA|MARGARINA|CREME LEITE|CREMOGEMA|FIAMBRE|KITUT"),
    ("Temperos e Ervas", r"ACAFRAO|ALECRIM|ALECRIN|AMAC|BOLDO|CAMOMILA|CANELA|CHIMICHURRI|COENTRO|COLORAL|"
                         r"COLORAU|COMINHO|CORRY|CRAVO INDIA|CURRY|EDU GUEDES|ERVA DOCE|GENGIBRE|HIBISCO|"
                         r"HORTELA|LEMON PEPPER|LOURO|MANJERICAO|OREGANO|PAPRICA|PEGA MARIDO|SALSA|SAL|SAZON|"
                         r"TEMP\w*|TOMILHO|CEBOLINHO|VINAGRETE|BREDO|"
                         r"PIM\w*TA (MOIDA|GRAO|REINO|DO REINO|CALAB\w*|CASEIRA)|"
                         r"ALHO (FRITO|FLOCOS|TRITUR\w*|CEBOLA E SALSA|CREMOSO)"),
    ("Mercearia", r"PIMENTA \w+ .*(ML|CONSERVA)|PIMENTA (CONSERVA|ARTESANAL|1 CAROLINA|KOISA|MIXTA|MISTA|"
                  r"CHORA|PREMIUM|MALAGUETA CHORA)|MOLHO|ACUCAR|AMENDOAS|AMENDOIM|ARROZ|AVEIA|AZEITE|"
                  r"AZEITONA?S?|CAFE|CASTANHA|CAT CHUP|CHARQUE|DUETO|ERVILHA|FARINHA|FAROFA|FEIJAO|FEIJOADA|"
                  r"FERMENTO|FLOCAO|GOMA|GRANOLA|KNNOR|MACARRAO|MAIONESE|MIOJO|MOSTARDA|MUCILON|NOZES|OLEO|"
                  r"PACOCA|PISTACHE|QUEBRA QUEIXO|RAPADURA|SALGADINHO|SEMENTE|TAMARA|TARECO|TRIGO|VINAG\w+|"
                  r"XAROPE|DAMASCO|NEGO BOM|CHA|PIMENTA"),
    ("Verduras", r"ALFACE|ACELGA|AGRIAO|BROCOLIS|COUVE FOLHA|ESPINAFRE|RUCULA|REPOLHO\w*"),
    ("Legumes", r"ABOBRINHA|ABORBORA|BATATA|BERIJELA|BETERRABA|CEBOLA|CENOURA|CHUCHU|COUVE FLOR|INHAME|JILO|"
                r"MACAXEIRA|MANDIOQUINHA|MAXIXE|MORANGA|NABO|PEPINO|PIMENTAO|QUIABO|TOMATE|VAGEM|JERIMUN|"
                r"MILHO VERDE|MAO (DE )?MILHO|FEIJAO VERDE|SALSAO|COGUMELO|ALHO|CARA|JACAREZINHO"),
    ("Frutas", r"ABACATE|ABACAXI|ACEROLA|AMEIXA|ATIMOIA|BANANA|CAJU|CAQUI|CARAMBOLA|CEREJA|COCO VERDE|FIGO|"
               r"GOIABA|GRAVIOLA|JABUTICABA|JACA|JAMBO|KIWI|LARANJA|LIMAO|MACA|MACAIBA|MAMAO|MANGA|MANGABA|"
               r"MARACUJA|MELANCIA|MELAO|MORANGO|NECTARINA|PERA|PESSEGO|PHYSALIS|PINHA|PITAYA|PITOMBA|"
               r"RAMBOTA[NM]|ROMA|SAPOTI|SERIGUELA|TAMARINDO|TANGERINA|UMBU|UVA|CUPUACU|CAJA|POLPA|POLKPA"),
]
# `\b(?:...)\b` em volta de cada regra garante palavra inteira (MEL não casa MELANCIA).
_COMPILED = [(category, re.compile(rf"\b(?:{pattern})\b")) for category, pattern in _RULES]


def classify_category(name: str) -> str:
    folded = fold(name)
    for category, pattern in _COMPILED:
        if pattern.search(folded):
            return category
    return DEFAULT_CATEGORY
