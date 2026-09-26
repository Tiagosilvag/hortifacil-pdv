import { describe, expect, it } from 'vitest'
import {
  cleanValidationMessage,
  describeFiscal,
  digitsOnly,
  fiscalFormDefaults,
  fiscalPayload,
  fiscalPollDelay,
  fiscalStatusOf,
  fiscalVariant,
  formatAccessKey,
  isFiscalSettled,
  MAX_FISCAL_POLLS,
  summarizeDefault,
} from './fiscal'

describe('estado da NFC-e do pedido', () => {
  it('pedido de antes da NFC-e (sem o campo) conta como "sem NFC-e"', () => {
    expect(fiscalStatusOf({})).toBe('not_required')
    expect(describeFiscal({}, false)).toEqual({ label: 'Sem NFC-e', variant: 'slate', detail: null })
  })

  it('cada estado tem a sua cor', () => {
    expect(fiscalVariant('authorized')).toBe('green')
    expect(fiscalVariant('pending')).toBe('amber')
    expect(fiscalVariant('rejected')).toBe('red')
    expect(fiscalVariant('cancelled')).toBe('red')
    expect(fiscalVariant('not_required')).toBe('slate')
  })

  it('recém-criado e sem motivo gravado = ainda emitindo, se a emissão está ligada', () => {
    expect(describeFiscal({ fiscal_status: 'not_required' }, true)).toEqual({ label: 'Emitindo NFC-e…', variant: 'amber', detail: null })
    expect(describeFiscal({ fiscal_status: 'pending', fiscal_error: null }, true).label).toBe('Emitindo NFC-e…')
  })

  it('com motivo gravado o estado é mostrado como está, junto com o motivo', () => {
    expect(describeFiscal({ fiscal_status: 'pending', fiscal_error: 'Produtos sem dados fiscais: 205 OVOS (NCM)' }, true)).toEqual({
      label: 'Pendente',
      variant: 'amber',
      detail: 'Produtos sem dados fiscais: 205 OVOS (NCM)',
    })
    expect(describeFiscal({ fiscal_status: 'not_required', fiscal_error: 'Venda com fiado: a NFC-e não é emitida' }, true).label).toBe('Sem NFC-e')
    expect(describeFiscal({ fiscal_status: 'rejected', fiscal_error: '778 - NCM inválido' }, true)).toMatchObject({ label: 'Rejeitada', variant: 'red' })
    expect(describeFiscal({ fiscal_status: 'authorized' }, true)).toEqual({ label: 'Autorizada', variant: 'green', detail: null })
  })
})

describe('consulta do pedido depois de salvar', () => {
  const fresh = { fiscal_status: 'not_required' as const, fiscal_error: null }

  it('situações finais e pedidos com motivo gravado estão assentados', () => {
    for (const status of ['authorized', 'rejected', 'cancelled'] as const) expect(isFiscalSettled({ fiscal_status: status })).toBe(true)
    expect(isFiscalSettled({ fiscal_status: 'pending', fiscal_error: 'Provedor indisponível: tempo esgotado' })).toBe(true)
    expect(isFiscalSettled(fresh)).toBe(false)
    expect(isFiscalSettled({ fiscal_status: 'pending', fiscal_error: null })).toBe(false)
  })

  it('só consulta de novo enquanto a emissão está ligada e o pedido não assentou', () => {
    expect(fiscalPollDelay(fresh, true, 0)).toBe(1500)
    expect(fiscalPollDelay(fresh, false, 0)).toBe(false) // emissão desligada: nunca vai mudar
    expect(fiscalPollDelay({ fiscal_status: 'authorized' }, true, 1)).toBe(false)
  })

  it('desiste depois de algumas consultas, para não ficar consultando para sempre', () => {
    expect(fiscalPollDelay(fresh, true, MAX_FISCAL_POLLS - 1)).toBe(1500)
    expect(fiscalPollDelay(fresh, true, MAX_FISCAL_POLLS)).toBe(false)
  })
})

describe('formulário dos dados fiscais', () => {
  it('produto sem dados fiscais abre com campos vazios', () => {
    expect(fiscalFormDefaults(null)).toEqual({
      ncm: '', cest: '', origem: '', cfop: '', cst_icms: '', aliquota_icms: '', cst_pis: '', cst_cofins: '',
    })
  })

  it('preenche a partir do cadastro; origem 0 é valor válido e não vira vazio', () => {
    const values = fiscalFormDefaults({ ncm: '08039000', origem: 0, cfop: '5102', aliquota_icms: '20.50' })
    expect(values.origem).toBe('0')
    expect(values.aliquota_icms).toBe('20.50')
    expect(values.cest).toBe('')
  })

  it('só manda o que foi preenchido', () => {
    expect(fiscalPayload(fiscalFormDefaults(null))).toEqual({})
    const values = { ...fiscalFormDefaults(null), ncm: ' 0803.90.00 ', origem: '0', aliquota_icms: '20,5', cst_icms: '41' }
    expect(fiscalPayload(values)).toEqual({ ncm: '0803.90.00', origem: 0, aliquota_icms: '20.5', cst_icms: '41' })
  })

  it('origem 0 vai como número 0 (não some do corpo)', () => {
    expect(fiscalPayload({ ...fiscalFormDefaults(null), origem: '0' })).toEqual({ origem: 0 })
  })
})

describe('resumo do padrão da categoria', () => {
  it('lista o que está preenchido', () => {
    expect(summarizeDefault({ ncm: '08039000', cfop: '5102', origem: 0, cst_icms: '41' })).toBe('NCM 08039000 · CFOP 5102 · CST 041')
    expect(summarizeDefault({ ncm: '08039000', origem: 0, cst_icms: '00', aliquota_icms: '20.50' })).toBe(
      'NCM 08039000 · CST 000 · ICMS 20,50%',
    )
  })

  it('sem padrão o resumo é vazio', () => {
    expect(summarizeDefault(null)).toBe('')
    expect(summarizeDefault({})).toBe('')
  })
})

it('digitsOnly tira a pontuação e limita o tamanho', () => {
  expect(digitsOnly('11.222.333/0001-81')).toBe('11222333000181')
  expect(digitsOnly('50000-000abc', 8)).toBe('50000000')
})

it('cleanValidationMessage tira o prefixo técnico do Pydantic', () => {
  expect(cleanValidationMessage('Value error, NCM deve ter 8 dígitos')).toBe('NCM deve ter 8 dígitos')
  expect(cleanValidationMessage('Value error, A, Value error, B')).toBe('A, B')
  expect(cleanValidationMessage('Pedido não encontrado')).toBe('Pedido não encontrado')
})

it('formatAccessKey agrupa a chave de 44 dígitos de 4 em 4', () => {
  const key = '26260311222333000181650010000000011000000019'
  expect(key).toHaveLength(44)
  expect(formatAccessKey(key)).toBe('2626 0311 2223 3300 0181 6500 1000 0000 0110 0000 0019')
  expect(formatAccessKey(null)).toBe('')
})
