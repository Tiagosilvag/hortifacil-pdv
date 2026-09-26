/** Campos fiscais do produto e do padrão por categoria. Valores opcionais: vazio = herda o padrão da categoria. */
export interface FiscalFields {
  ncm: string | null
  cest: string | null
  origem: number | null
  cfop: string | null
  cst_icms: string | null
  aliquota_icms: number | string | null // a API devolve Decimal como texto
  cst_pis: string | null
  cst_cofins: string | null
}

export type FiscalFieldKey = keyof FiscalFields

export type FiscalStatus = 'not_required' | 'pending' | 'authorized' | 'rejected' | 'cancelled'

/** Campos da NFC-e no pedido. Opcionais no tipo: pedidos de antes da NFC-e chegam sem eles. */
export interface OrderFiscal {
  fiscal_status: FiscalStatus
  fiscal_protocol: string | null
  fiscal_qr_url: string | null
  fiscal_xml_url: string | null
  fiscal_emitted_at: string | null
  fiscal_error: string | null
  fiscal_attempts: number
  fiscal_cancelled_at: string | null
  fiscal_cancel_reason: string | null
}

export type FiscalRegime = 'normal' | 'simples'
export type FiscalEnvironment = 'homologacao' | 'producao'

export interface FiscalSettings {
  enabled: boolean
  environment: FiscalEnvironment
  regime: FiscalRegime
  series: number
  cancel_window_minutes: number
  cnpj: string | null
  ie: string | null
  legal_name: string | null
  street: string | null
  number: string | null
  district: string | null
  city: string | null
  city_ibge: string | null
  state: string | null
  zip_code: string | null
  updated_at: string | null
  updated_by_name: string | null
  production_confirmed_by: string | null
  production_confirmed_at: string | null
}

export interface FiscalDefault extends FiscalFields {
  id: string
  category: string
}

/** Empresa emitente: os dados que saem impressos em todo cupom fiscal. */
export interface FiscalIssuer {
  legal_name: string | null
  cnpj: string | null
  ie: string | null
  street: string | null
  number: string | null
  district: string | null
  city: string | null
  state: string | null
  zip_code: string | null
}

/** Resposta de GET /fiscal/status: o que o PDV precisa saber para mostrar o estado da emissão e imprimir o cupom fiscal. */
export interface FiscalStatusInfo {
  enabled: boolean
  provider_configured: boolean
  environment: FiscalEnvironment
  issuer: FiscalIssuer | null
}

export interface PendingProduct {
  id: string
  code: number
  name: string
  category: string | null
  missing: string[]
}
