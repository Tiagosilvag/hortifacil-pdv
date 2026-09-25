from legacy_import.normalize import fold, format_document, format_phone, only_digits


def test_only_digits_strips_everything_else():
    assert only_digits("12.345.678/0001-95") == "12345678000195"
    assert only_digits(None) == ""


def test_fold_removes_accents_case_and_extra_spaces():
    assert fold("  maçã   Argentina ") == "MACA ARGENTINA"
    assert fold(None) == ""


def test_format_document_cpf_cnpj_and_other():
    assert format_document("12345678901") == "123.456.789-01"
    assert format_document("12345678000195") == "12.345.678/0001-95"
    assert format_document("123") == "123"
    assert format_document("") == ""


def test_format_phone_mobile_landline_and_other():
    assert format_phone("(81) 9 8888-7777") == "(81) 98888-7777"
    assert format_phone("8133334444") == "(81) 3333-4444"
    assert format_phone("3333444") == "3333444"
