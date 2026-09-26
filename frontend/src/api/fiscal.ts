import { api } from './client'
import type { Order } from '@/types'
import type {
  FiscalDefault,
  FiscalEnvironment,
  FiscalMode,
  FiscalRegime,
  FiscalSecrets,
  FiscalSettings,
  FiscalStatusInfo,
  PendingProduct,
} from '@/types/fiscal'
import type { FiscalPayload } from '@/utils/fiscal'

export async function getFiscalStatus(): Promise<FiscalStatusInfo> {
  const { data } = await api.get<FiscalStatusInfo>('/fiscal/status')
  return data
}

export async function getFiscalSettings(): Promise<FiscalSettings> {
  const { data } = await api.get<FiscalSettings>('/fiscal/settings')
  return data
}

export interface FiscalSettingsBody {
  enabled: boolean
  environment: FiscalEnvironment
  regime: FiscalRegime
  mode?: FiscalMode
  series: number
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
  cancel_window_minutes?: number
  /** Só vale ao passar de homologação para produção. */
  production_confirmation?: boolean
}

export async function saveFiscalSettings(body: FiscalSettingsBody): Promise<FiscalSettings> {
  const { data } = await api.put<FiscalSettings>('/fiscal/settings', body)
  return data
}

/** O que está cadastrado no cofre (certificado, CSC), sem nenhum conteúdo secreto. */
export async function getFiscalSecrets(): Promise<FiscalSecrets> {
  const { data } = await api.get<FiscalSecrets>('/fiscal/secrets')
  return data
}

/** Envia o .pfx e a senha. O servidor confere senha, validade e CNPJ e guarda cifrado; a resposta não traz segredo. */
export async function uploadCertificate(file: File, password: string): Promise<FiscalSecrets> {
  const form = new FormData()
  form.append('file', file)
  form.append('password', password)
  const { data } = await api.put<FiscalSecrets>('/fiscal/secrets/certificate', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  return data
}

export async function deleteCertificate(): Promise<FiscalSecrets> {
  const { data } = await api.delete<FiscalSecrets>('/fiscal/secrets/certificate')
  return data
}

export async function saveCsc(environment: FiscalEnvironment, id: string, token: string): Promise<FiscalSecrets> {
  const { data } = await api.put<FiscalSecrets>(`/fiscal/secrets/csc/${environment}`, { id, token })
  return data
}

export async function deleteCsc(environment: FiscalEnvironment): Promise<FiscalSecrets> {
  const { data } = await api.delete<FiscalSecrets>(`/fiscal/secrets/csc/${environment}`)
  return data
}

export async function listFiscalDefaults(): Promise<FiscalDefault[]> {
  const { data } = await api.get<FiscalDefault[]>('/fiscal/defaults')
  return data
}

/** Cria ou troca o padrão da categoria: campo que não vai no corpo fica vazio. */
export async function saveFiscalDefault(category: string, fields: FiscalPayload): Promise<FiscalDefault> {
  const { data } = await api.put<FiscalDefault>('/fiscal/defaults', { category, ...fields })
  return data
}

export async function deleteFiscalDefault(id: string): Promise<void> {
  await api.delete(`/fiscal/defaults/${id}`)
}

export async function listPendingProducts(): Promise<PendingProduct[]> {
  const { data } = await api.get<PendingProduct[]>('/fiscal/pending-products')
  return data
}

/** "Tentar de novo": emite (ou reemite) a NFC-e do pedido agora e devolve o pedido atualizado. */
export async function emitOrderNfce(orderId: string): Promise<Order> {
  const { data } = await api.post<Order>(`/fiscal/orders/${orderId}/emit`)
  return data
}

/** "Consultar situação": pergunta ao provedor o que houve com a nota (útil depois de um tempo esgotado). */
export async function refreshOrderNfce(orderId: string): Promise<Order> {
  const { data } = await api.post<Order>(`/fiscal/orders/${orderId}/refresh`)
  return data
}

/** Reenvia agora as notas pendentes por falha do provedor (só administrador). */
export async function retryPendingNfce(): Promise<{ attempted: number }> {
  const { data } = await api.post<{ attempted: number }>('/fiscal/retry-pending')
  return data
}
