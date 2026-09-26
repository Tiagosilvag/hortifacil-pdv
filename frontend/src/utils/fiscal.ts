import type { FiscalFieldKey, FiscalFields, FiscalStatus, OrderFiscal } from '@/types/fiscal'

export const FISCAL_STATUS_LABEL: Record<FiscalStatus, string> = {
  not_required: 'Sem NFC-e',
  pending: 'Pendente',
  authorized: 'Autorizada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
}

export type FiscalVariant = 'green' | 'amber' | 'red' | 'slate'

type OrderLike = Partial<Pick<OrderFiscal, 'fiscal_status' | 'fiscal_error' | 'fiscal_attempts' | 'fiscal_cancel_reason'>>

/** Pedidos de antes da NFC-e não trazem o campo: contam como "sem NFC-e". */
export function fiscalStatusOf(order: OrderLike): FiscalStatus {
  return order.fiscal_status ?? 'not_required'
}

export function fiscalVariant(status: FiscalStatus): FiscalVariant {
  if (status === 'authorized') return 'green'
  if (status === 'pending') return 'amber'
  if (status === 'rejected' || status === 'cancelled') return 'red'
  return 'slate'
}

/**
 * A emissão roda em segundo plano depois de o pedido ser salvo. Um pedido está "assentado" quando ela já disse o que
 * tinha a dizer: uma situação final, ou um motivo gravado (dado fiscal faltando, provedor fora do ar, fiado etc.).
 */
export function isFiscalSettled(order: OrderLike): boolean {
  const status = fiscalStatusOf(order)
  if (status === 'authorized' || status === 'rejected' || status === 'cancelled') return true
  return !!order.fiscal_error
}

export const MAX_FISCAL_POLLS = 6
export const FISCAL_POLL_MS = 1500

/** Quanto esperar para consultar o pedido de novo: `false` = parar (assentou, não há emissão, ou já tentou o bastante). */
export function fiscalPollDelay(order: OrderLike, emissionEnabled: boolean, polls: number): number | false {
  if (!emissionEnabled || isFiscalSettled(order) || polls >= MAX_FISCAL_POLLS) return false
  return FISCAL_POLL_MS
}

export interface FiscalSummary {
  label: string
  variant: FiscalVariant
  detail: string | null
}

/** Texto e cor do estado da NFC-e de um pedido, para a tela de sucesso e o detalhe do pedido. */
export function describeFiscal(order: OrderLike, emissionEnabled: boolean): FiscalSummary {
  const status = fiscalStatusOf(order)
  if (status === 'not_required' && !order.fiscal_error) {
    return emissionEnabled
      ? { label: 'Emitindo NFC-e…', variant: 'amber', detail: null }
      : { label: FISCAL_STATUS_LABEL.not_required, variant: 'slate', detail: null }
  }
  if (status === 'pending' && !order.fiscal_error) return { label: 'Emitindo NFC-e…', variant: 'amber', detail: null }
  if (status === 'cancelled') {
    return { label: FISCAL_STATUS_LABEL[status], variant: 'red', detail: order.fiscal_cancel_reason ? `Motivo: ${order.fiscal_cancel_reason}` : null }
  }
  return { label: FISCAL_STATUS_LABEL[status], variant: fiscalVariant(status), detail: order.fiscal_error ?? null }
}

export const ORIGEM_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '0 - Nacional' },
  { value: 1, label: '1 - Estrangeira (importação direta)' },
  { value: 2, label: '2 - Estrangeira (mercado interno)' },
  { value: 3, label: '3 - Nacional (importado 40% a 70%)' },
  { value: 4, label: '4 - Nacional (processos produtivos básicos)' },
  { value: 5, label: '5 - Nacional (importado até 40%)' },
  { value: 6, label: '6 - Estrangeira (sem similar nacional)' },
  { value: 7, label: '7 - Estrangeira (sem similar, mercado interno)' },
  { value: 8, label: '8 - Nacional (importado acima de 70%)' },
]

/** Valores dos campos fiscais como texto, do jeito que os inputs do formulário os guardam. */
export type FiscalFormValues = Record<FiscalFieldKey, string>

export const FISCAL_KEYS: FiscalFieldKey[] = ['ncm', 'cest', 'origem', 'cfop', 'cst_icms', 'aliquota_icms', 'cst_pis', 'cst_cofins']

export function fiscalFormDefaults(source?: Partial<FiscalFields> | null): FiscalFormValues {
  const values = {} as FiscalFormValues
  for (const key of FISCAL_KEYS) {
    const value = source?.[key]
    values[key] = value === null || value === undefined ? '' : String(value)
  }
  return values
}

export type FiscalPayload = Partial<{
  ncm: string
  cest: string
  origem: number
  cfop: string
  cst_icms: string
  aliquota_icms: string
  cst_pis: string
  cst_cofins: string
}>

/**
 * Formulário → corpo da API: só vai o que foi preenchido (vazio = herdar o padrão da categoria).
 * A API valida e normaliza (NCM 8 dígitos, CFOP começando com 5, etc.) e responde com a mensagem em português.
 */
export function fiscalPayload(values: FiscalFormValues): FiscalPayload {
  const payload: FiscalPayload = {}
  for (const key of FISCAL_KEYS) {
    const text = (values[key] ?? '').trim()
    if (!text) continue
    if (key === 'origem') payload.origem = Number(text)
    else if (key === 'aliquota_icms') payload.aliquota_icms = text.replace(',', '.')
    else payload[key] = text
  }
  return payload
}

/** Resumo do padrão fiscal de uma categoria para a tabela ("NCM 08039000 · CFOP 5102 · CST 041"). */
export function summarizeDefault(source?: Partial<FiscalFields> | null): string {
  if (!source) return ''
  const parts: string[] = []
  if (source.ncm) parts.push(`NCM ${source.ncm}`)
  if (source.cfop) parts.push(`CFOP ${source.cfop}`)
  if (source.cst_icms) parts.push(`CST ${source.origem ?? '?'}${source.cst_icms}`)
  if (source.aliquota_icms !== null && source.aliquota_icms !== undefined && source.aliquota_icms !== '') {
    parts.push(`ICMS ${Number(source.aliquota_icms).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`)
  }
  return parts.join(' · ')
}

/** Só dígitos, com limite de tamanho (CNPJ, CEP, código IBGE). */
export function digitsOnly(value: string, max?: number): string {
  const digits = value.replace(/\D/g, '')
  return max ? digits.slice(0, max) : digits
}

/** O Pydantic prefixa as mensagens de validação com "Value error, ": tira, deixando só o texto em português. */
export function cleanValidationMessage(text: string): string {
  return text.replace(/Value error, /g, '')
}

/** Chave de acesso de 44 dígitos em grupos de 4, como aparece no cupom ("2626 0356 ..."). */
export function formatAccessKey(key: string | null | undefined): string {
  if (!key) return ''
  return key.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ')
}

/** A SEFAZ exige de 15 a 255 caracteres no motivo do cancelamento de uma NFC-e. */
export const CANCEL_REASON_MIN = 15

/** Mensagem quando o motivo não serve; `null` quando serve (ou quando o pedido não tem NFC-e autorizada, e o motivo é opcional). */
export function cancelReasonError(text: string, nfceAuthorized: boolean): string | null {
  if (!nfceAuthorized) return null
  return text.trim().length >= CANCEL_REASON_MIN ? null : `Informe o motivo com pelo menos ${CANCEL_REASON_MIN} caracteres (a SEFAZ exige).`
}

/** "Consultar situação" só faz sentido para nota pendente que já foi ao provedor (a SEFAZ pode ter autorizado). */
export function canRefreshFiscal(order: OrderLike): boolean {
  return fiscalStatusOf(order) === 'pending' && (order.fiscal_attempts ?? 0) > 0
}

/** Palavra que o administrador digita para confirmar a ida para produção (com ou sem acento, em qualquer caixa). */
export function isProductionWord(text: string): boolean {
  const word = text.trim().toUpperCase()
  return word === 'PRODUÇÃO' || word === 'PRODUCAO'
}
