import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getFiscalStatus } from '@/api/fiscal'
import { getOrder } from '@/api/orders'
import type { FiscalPrintInfo } from '@/hardware/printer/fiscalReceipt'
import type { Order } from '@/types'
import { fiscalPollDelay, isFiscalSettled, MAX_FISCAL_POLLS } from '@/utils/fiscal'

/**
 * Estado da NFC-e de um pedido recém-criado. A emissão roda em segundo plano depois de o pedido ser salvo, então este
 * hook consulta o pedido algumas vezes até a nota assentar. Use uma vez por tela: as consultas contam por instância.
 */
export function useOrderFiscal(order: Order) {
  const { data: status, isPending: statusPending } = useQuery({
    queryKey: ['fiscal', 'status'],
    queryFn: getFiscalStatus,
    staleTime: 60_000,
  })
  const emissionEnabled = !!status?.enabled
  const polls = useRef(0)

  // `dataUpdatedAt` é lido de propósito: o React Query só re-renderiza quando muda uma propriedade LIDA, e enquanto a nota
  // não assenta o pedido volta igual (mesmo `data`). Sem ler isto, a contagem de consultas acabaria sem ninguém perceber.
  const { data: current, dataUpdatedAt } = useQuery({
    queryKey: ['order', order.id, 'fiscal'],
    queryFn: () => {
      polls.current += 1
      return getOrder(order.id)
    },
    enabled: emissionEnabled,
    initialData: order,
    refetchInterval: (query) => fiscalPollDelay(query.state.data ?? order, emissionEnabled, polls.current),
  })

  const latest = current ?? order
  const settled = isFiscalSettled(latest)
  // Acabaram as consultas e a nota não assentou (provedor lento): a tela deixa de dizer "Emitindo…".
  const gaveUp = emissionEnabled && polls.current >= MAX_FISCAL_POLLS && !settled
  const fiscalInfo: FiscalPrintInfo | null = status?.issuer ? { issuer: status.issuer, environment: status.environment } : null

  // Erro ao consultar o estado da emissão conta como "pronto e desligado": o caixa não pode ficar esperando por isso.
  return { latest, emissionEnabled, statusReady: !statusPending, settled, gaveUp, fiscalInfo, updatedAt: dataUpdatedAt }
}
