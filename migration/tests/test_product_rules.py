import pytest

from legacy_import.product_rules import classify_category, classify_unit


@pytest.mark.parametrize(
    "legacy_unit,name,expected",
    [
        ("KG", "BANANA PRATA KG", "kg"),
        ("KG", "SACO CEBOLA 20KG", "kg"),  # coluna KG manda, mesmo com peso no nome
        ("UN", "UVA VITORIA KG", "kg"),  # descrição termina com KG
        ("GR", "AMENDOIM CRU C/ CASCA KG", "kg"),  # unidade errada no cadastro antigo
        ("CX", "UVA BALAIO FORA KG", "kg"),
        ("UN", "ALHO TRITUR DA LIA 1 KG", "unit"),  # "1 KG" é embalagem, não venda por peso
        ("UN", "ALHO TRITUR FELIZ 1KG", "unit"),
        ("CX", "CX DETERGENTE LIMPOL 500ML", "box"),
        ("SC", "SACO LARANJA 20KG", "box"),
        ("UN", "OVOS UND", "unit"),
        ("PCT", "BOLACHA COQ TWO 200G", "unit"),
        ("GR", "MAIONESE HELLMANNS SACHE 200G", "unit"),
        ("ML", "VINAGRE MINHOTO 500ML", "unit"),
        ("LT", "FEIJOADA ODERICH LT 420G", "unit"),  # LT é lata, não litro
        ("EMB", "OVOS VERM BD C/15", "unit"),
    ],
)
def test_classify_unit(legacy_unit, name, expected):
    assert classify_unit(legacy_unit, name) == expected


@pytest.mark.parametrize(
    "name,expected",
    [
        ("BANANA PRATA KG", "Frutas"),
        ("LARANJA CRAVO KG", "Frutas"),  # CRAVO da fruta não é o tempero
        ("MELANCIA KG", "Frutas"),  # MEL não casa dentro de MELANCIA
        ("POLPA MORANGO PRIM KG", "Frutas"),
        ("ALFACE CRESPO UND", "Verduras"),
        ("COUVE FLOR KG", "Legumes"),
        ("BATATA INGLESA KG", "Legumes"),
        ("PIMENTA CHEIRO KG", "Legumes"),  # pimenta fresca
        ("PIMENTAO VERDE KG", "Legumes"),
        ("BATATA PALHA RAINHA 80G", "Mercearia"),
        ("UVA PASSA KG", "Mercearia"),
        ("GOIABADA XAVANTE 250G", "Mercearia"),
        ("BROWNIE DUGUGA DOCE LEITE 95G", "Mercearia"),  # LEITE no nome não vira laticínio
        ("SALGADINHO QUEIJO CIA 150G", "Mercearia"),
        ("LEITE COCO SOCOCO 500ML", "Mercearia"),
        ("PIMENTA CONSERVA 300ML", "Mercearia"),
        ("VINAGTRE MINHOTO 250ML", "Mercearia"),  # erro de digitação do cadastro antigo
        ("MEL ZUMBI 700G", "Mercearia"),
        ("LEITE LIQ BETANIA 1LT", "Ovos e Laticínios"),
        ("OVOS TABIRA BD C/30", "Ovos e Laticínios"),
        ("QUEIJO MANTEIGA KG", "Ovos e Laticínios"),
        ("SAZON FRANGO 60G", "Temperos e Ervas"),
        ("PIMEMNTA MOIDA RONALDO 20G", "Temperos e Ervas"),
        ("PIMENTA DO REINO VERCOSA 70G", "Temperos e Ervas"),
        ("ALHO TRITURADO 160G", "Temperos e Ervas"),
        ("ALHO KG", "Legumes"),
        ("AGUA SANITARIA BRILUX AZUL", "Limpeza e Higiene"),
        ("AMACIANTE SONHO AZUL 500ML", "Limpeza e Higiene"),
        ("AMAC CARNE VERCOSA 100G", "Temperos e Ervas"),  # AMAC = amaciante de carne
        ("SACO LIXO PT 50LTS", "Limpeza e Higiene"),
        ("COPO DESC. IDEAL 250ML", "Descartáveis e Utilidades"),
        ("AGUA DE COCO 600ML", "Bebidas"),
        ("ADOCANTE ADOCYL 100ML", "Mercearia"),
        ("COCO VERDE GELADO", "Frutas"),
        ("DIVERSOS", "Outros"),
        ("A", "Outros"),
    ],
)
def test_classify_category(name, expected):
    assert classify_category(name) == expected
