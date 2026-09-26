import { describe, expect, it } from 'vitest'
import type { Order } from '@/types'
import type { FiscalIssuer } from '@/types/fiscal'
import { buildFiscalReceipt, canPrintFiscal, formatCnpj, formatCpf, type FiscalPrintInfo } from './fiscalReceipt'
import type { Receipt } from './receipt'

const KEY = '26260311222333000181650010000000071000000019'
const QR = 'https://fake.invalid/qr/26260311222333000181650010000000071000000019'

const issuer: FiscalIssuer = {
  legal_name: 'EMPRESA TESTE LTDA', cnpj: '11222333000181', ie: '123456789', street: 'Rua Exemplo', number: '100',
  district: 'Centro', city: 'Recife', state: 'PE', zip_code: '50000000',
}
const info = (environment: 'homologacao' | 'producao' = 'producao', over: Partial<FiscalIssuer> = {}): FiscalPrintInfo => ({
  issuer: { ...issuer, ...over }, environment,
})

function order(over: Record<string, unknown> = {}): Order {
  return {
    id: 'o1', order_number: 42, customer_id: null, customer: null, total: '8.63', discount: '0', payment_type: 'cash',
    payment_splits: null, status: 'delivered', notes: null, invoice_number: '7', invoice_series: '1', invoice_key: KEY,
    created_by_name: 'Admin', created_at: '2026-09-25T15:30:00Z',
    fiscal_status: 'authorized', fiscal_protocol: '900000000000007', fiscal_qr_url: QR, fiscal_xml_url: null,
    fiscal_emitted_at: '2026-09-25T15:30:05Z', fiscal_error: null, fiscal_attempts: 1,
    items: [{ id: 'i1', product_id: 'p1', product_name: 'BANANA PRATA', product_code: 101, barcode: null, unit_type: 'kg', qty: '1.235', unit_price: '6.99', subtotal: '8.63' }],
    ...over,
  } as unknown as Order
}

/** Todo o texto do cupom, uma linha por bloco (linhas de duas colunas viram "esquerda | direita"). */
function lines(receipt: Receipt): string[] {
  return receipt.blocks.flatMap((block) => {
    if (block.type === 'text') return [block.text]
    if (block.type === 'row') return [`${block.left} | ${block.right}`]
    return []
  })
}

describe('canPrintFiscal', () => {
  it('só nota autorizada com chave e QR Code vira cupom fiscal', () => {
    expect(canPrintFiscal(order())).toBe(true)
    expect(canPrintFiscal(order({ fiscal_status: 'pending' }))).toBe(false)
    expect(canPrintFiscal(order({ fiscal_status: 'rejected' }))).toBe(false)
    expect(canPrintFiscal(order({ fiscal_status: undefined }))).toBe(false) // pedido de antes da NFC-e
    expect(canPrintFiscal(order({ invoice_key: null }))).toBe(false)
    expect(canPrintFiscal(order({ fiscal_qr_url: null }))).toBe(false)
  })
})

describe('formatação de documentos', () => {
  it('CNPJ e CPF com pontuação; o que não tem o tamanho certo fica como veio', () => {
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81')
    expect(formatCpf('12345678909')).toBe('123.456.789-09')
    expect(formatCnpj('123')).toBe('123')
  })
})

describe('cupom fiscal (DANFE NFC-e)', () => {
  it('cabeçalho com a empresa emitente', () => {
    const text = lines(buildFiscalReceipt(order(), info()))
    expect(text[0]).toBe('EMPRESA TESTE LTDA')
    expect(text).toContain('CNPJ: 11.222.333/0001-81  IE: 123456789')
    expect(text).toContain('Rua Exemplo, 100 - Centro')
    expect(text).toContain('Recife - PE  CEP 50000-000')
  })

  it('identifica o documento e nunca diz "não fiscal"', () => {
    const text = lines(buildFiscalReceipt(order(), info())).join('\n')
    expect(text).toContain('DANFE NFC-e')
    expect(text).toContain('Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica')
    expect(text).not.toMatch(/NÃO FISCAL/)
  })

  it('em homologação leva a marca obrigatória; em produção não', () => {
    const hml = lines(buildFiscalReceipt(order(), info('homologacao')))
    expect(hml).toContain('EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO')
    expect(hml).toContain('SEM VALOR FISCAL')
    expect(lines(buildFiscalReceipt(order(), info('producao'))).join('\n')).not.toMatch(/HOMOLOGAÇÃO/)
  })

  it('itens, total de itens e valor a pagar (valores chegam como texto da API)', () => {
    const text = lines(buildFiscalReceipt(order(), info()))
    expect(text).toContain('101 BANANA PRATA')
    expect(text.some((line) => line.startsWith('1,235 kg x') && /R\$\s8,63$/.test(line))).toBe(true)
    expect(text).toContain('Qtd. total de itens | 1')
    expect(text.find((line) => line.startsWith('VALOR A PAGAR'))).toMatch(/R\$\s8,63$/)
    expect(text.join('\n')).not.toMatch(/NaN/)
  })

  it('subtotal e desconto só aparecem quando há desconto', () => {
    expect(lines(buildFiscalReceipt(order(), info())).join('\n')).not.toMatch(/Desconto/)
    const text = lines(buildFiscalReceipt(order({ discount: '1.00', total: '7.63' }), info()))
    expect(text.find((line) => line.startsWith('Subtotal'))).toMatch(/R\$\s8,63$/)
    expect(text.find((line) => line.startsWith('Desconto'))).toMatch(/-R\$\s1,00$/)
    expect(text.find((line) => line.startsWith('VALOR A PAGAR'))).toMatch(/R\$\s7,63$/)
  })

  it('formas de pagamento: única e dividida', () => {
    expect(lines(buildFiscalReceipt(order({ payment_type: 'pix' }), info())).some((l) => l.startsWith('Pix'))).toBe(true)
    const split = lines(buildFiscalReceipt(order({
      payment_type: 'mixed', payment_splits: [{ type: 'cash', amount: 5 }, { type: 'pix', amount: '3.63' }],
    }), info()))
    expect(split.filter((line) => line.startsWith('Dinheiro') || line.startsWith('Pix'))).toHaveLength(2)
  })

  it('consumidor: não identificado, CPF ou CNPJ do cliente cadastrado; documento inválido não vira lixo', () => {
    const consumer = (customer: unknown) => lines(buildFiscalReceipt(order({ customer }), info())).find((l) => l.startsWith('CONSUMIDOR'))
    expect(consumer(null)).toBe('CONSUMIDOR NÃO IDENTIFICADO')
    expect(consumer({ name: 'Ana', document: '123.456.789-09' })).toBe('CONSUMIDOR CPF: 123.456.789-09')
    expect(consumer({ name: 'Loja', document: '11.222.333/0001-81' })).toBe('CONSUMIDOR CNPJ: 11.222.333/0001-81')
    expect(consumer({ name: 'X', document: '12345' })).toBe('CONSUMIDOR NÃO IDENTIFICADO')
  })

  it('número, série, emissão com segundos, chave em grupos e protocolo', () => {
    const text = lines(buildFiscalReceipt(order(), info()))
    expect(text).toContain('NFC-e nº 7  Série 1')
    expect(text.some((line) => /^Emissão: \d{2}\/\d{2}\/2026 \d{2}:\d{2}:05$/.test(line))).toBe(true)
    expect(text).toContain('2626 0311 2223 3300 0181 6500 1000 0000 0710 0000 0019')
    expect(text).toContain('Protocolo de autorização: 900000000000007')
  })

  it('o QR Code leva a URL devolvida pelo provedor e termina com corte', () => {
    const { blocks } = buildFiscalReceipt(order(), info())
    expect(blocks.filter((block) => block.type === 'qrcode')).toEqual([{ type: 'qrcode', data: QR }])
    expect(blocks.at(-1)).toEqual({ type: 'cut' })
  })

  it('rodapé opcional', () => {
    expect(lines(buildFiscalReceipt(order(), info(), 'Obrigado!'))).toContain('Obrigado!')
    expect(lines(buildFiscalReceipt(order(), info(), '  '))).not.toContain('')
  })

  it('campos da empresa em branco não deixam linhas vazias nem "null"', () => {
    const text = lines(buildFiscalReceipt(order(), info('producao', { ie: null, street: null, number: null, district: null, zip_code: null })))
    expect(text).toContain('CNPJ: 11.222.333/0001-81')
    expect(text).toContain('Recife - PE')
    expect(text.join('\n')).not.toMatch(/null|undefined/)
    expect(text.every((line) => line.trim() !== '')).toBe(true)
  })

  it('sem nome da empresa, o cupom ainda sai (a nota vale pela chave e pelo QR)', () => {
    const text = lines(buildFiscalReceipt(order(), info('producao', { legal_name: null })))
    expect(text[0]).toMatch(/^CNPJ:/)
  })
})
