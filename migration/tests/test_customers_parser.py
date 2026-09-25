from legacy_import.customers_parser import merge_customers, parse_customers_text
from report_builders import customer_block, customers_page


def parse(*blocks, source="Clientes.pdf"):
    return parse_customers_text(customers_page(*blocks), source)


def test_full_block_is_parsed():
    block = customer_block(
        7, doc="12.345.678/0001-95", ie="1234567-89", razao="POUSADA EXEMPLO LTDA", fantasia="POUSADA EXEMPLO",
        street="RUA DAS FLORES", number="120", cep="55590000", bairro="CENTRO", cidade="IPOJUCA", uf="PE",
        cel1="(81) 9 8888-7777", fone1="(81) 3333-4444")
    (c,) = parse(block)
    assert c.legacy_code == 7
    assert c.document == "12.345.678/0001-95"
    assert c.ie == "1234567-89"
    assert (c.razao, c.fantasia) == ("POUSADA EXEMPLO LTDA", "POUSADA EXEMPLO")
    assert (c.street, c.number, c.cep) == ("RUA DAS FLORES", "120", "55590000")
    assert (c.bairro, c.cidade, c.uf) == ("CENTRO", "IPOJUCA", "PE")
    assert c.phones == ("(81) 98888-7777", "(81) 3333-4444")  # celular vem antes do fixo


def test_empty_fields_do_not_break_parsing():
    (c,) = parse(customer_block(9, razao="SONIA", fantasia="SONIA", cidade="RECIFE"))
    assert (c.document, c.street, c.number, c.cep, c.bairro) == ("", "", "", "", "")
    assert c.cidade == "RECIFE"
    assert c.phones == ()


def test_uf_is_read_from_the_city_line():
    (c,) = parse(customer_block(3, razao="MARIA", cidade="RECIFE", uf="PE"))
    assert (c.cidade, c.uf) == ("RECIFE", "PE")


def test_several_blocks_in_one_page():
    result = parse(customer_block(1, razao="UM"), customer_block(2, razao="DOIS"))
    assert [c.legacy_code for c in result] == [1, 2]


def test_merge_builds_address_notes_and_phone():
    raws = parse(customer_block(
        7, doc="123.456.789-01", ie="99", razao="JOSE DA SILVA", fantasia="ZE DO SITIO", street="RUA A", number="5",
        cep="55590000", bairro="CENTRO", cidade="IPOJUCA", uf="PE",
        cel1="(81) 9 8888-7777", fone1="(81) 3333-4444"))
    (c,) = merge_customers(raws).customers
    assert c.name == "JOSE DA SILVA"
    assert c.document == "123.456.789-01"
    assert c.phone == "(81) 98888-7777"
    assert c.address == "RUA A, 5 - CENTRO - IPOJUCA/PE - CEP 55590-000"
    assert c.notes == ("Gestão Fácil: cód. 7 (Clientes.pdf) | Fantasia: ZE DO SITIO | IE/RG: 99 | "
                       "Outros fones: (81) 3333-4444")
    assert (c.legacy_code, c.legacy_source) == (7, "Clientes.pdf")


def test_consumidor_final_is_skipped():
    result = merge_customers(parse(customer_block(0, razao="CONSUMIDOR FINAL"), customer_block(1, razao="ANA")))
    assert [c.name for c in result.customers] == ["ANA"]
    assert len(result.skipped) == 1


def test_identical_duplicate_across_pdfs_is_merged_silently():
    a = parse(customer_block(5, doc="123.456.789-01", razao="ANA", street="RUA B"), source="Clientes.pdf")
    b = parse(customer_block(5, doc="123.456.789-01", razao="ANA", street="RUA B"), source="Clientes 2.pdf")
    result = merge_customers(a + b)
    assert len(result.customers) == 1
    assert result.duplicates_merged == 1
    assert result.conflicts == []


def test_same_document_with_different_data_is_a_conflict_and_keeps_first():
    a = parse(customer_block(5, doc="123.456.789-01", razao="ANA LIMA", street="RUA B"), source="Clientes.pdf")
    b = parse(customer_block(9, doc="123.456.789-01", razao="ANA SOUZA", street="RUA C"), source="Clientes 2.pdf")
    result = merge_customers(a + b)
    assert [c.name for c in result.customers] == ["ANA LIMA"]
    assert [c.kind for c in result.conflicts] == ["dados-divergentes"]


def test_same_code_different_people_keeps_both_and_reports():
    a = parse(customer_block(5, doc="123.456.789-01", razao="ANA"), source="Clientes.pdf")
    b = parse(customer_block(5, doc="987.654.321-00", razao="BRUNO"), source="Clientes 2.pdf")
    result = merge_customers(a + b)
    assert sorted(c.name for c in result.customers) == ["ANA", "BRUNO"]
    assert [c.kind for c in result.conflicts] == ["codigo-repetido"]


def test_customers_without_document_are_matched_by_name_and_street():
    a = parse(customer_block(1, razao="DONA MARIA", street="RUA X"), source="Clientes.pdf")
    b = parse(customer_block(2, razao="Dona  Maria", street="rua x"), source="Clientes 2.pdf")
    c = parse(customer_block(3, razao="DONA MARIA", street="RUA Y"), source="Clientes 2.pdf")
    result = merge_customers(a + b + c)
    assert len(result.customers) == 2  # a e b são a mesma pessoa; c mora em outra rua
    assert result.duplicates_merged == 1
