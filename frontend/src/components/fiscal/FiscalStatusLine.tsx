import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getFiscalStatus } from '@/api/fiscal'
import { getOrder } from '@/api/orders'
import { Badge } from '@/components/ui/Badge'
import type { Order } from '@/types'
import { describeFiscal, fiscalPollDelay, isFiscalSettled, MAX_FISCAL_POLLS } from '@/utils/fiscal'

/**
 * Estado da NFC-e na tela "Pedido registrado". A emissão roda em segundo plano depois de o pedido ser salvo, então esta
 * linha consulta o pedido algumas vezes até a nota assentar. O caixa nunca fica esperando: os botões seguem livres.
 */
export function FiscalStatusLine({ order }: { order: Order }) {
  const { data: status } = useQuery({ queryKey: ['fiscal', 'status'], queryFn: getFiscalStatus, staleTime: 60_000 })
  const enabled = !!status?.enabled
  const polls = useRef(0)

  const { data: current } = useQuery({
    queryKey: ['order', order.id, 'fiscal'],
    queryFn: () => {
      polls.current += 1
      return getOrder(order.id)
    },
    enabled,
    initialData: order,
    refetchInterval: (query) => fiscalPollDelay(query.state.data ?? order, enabled, polls.current),
  })

  const latest = current ?? order
  // Depois de todas as consultas sem a nota assentar (provedor lento), não diz mais "Emitindo…": manda olhar o pedido.
  const gaveUp = enabled && polls.current >= MAX_FISCAL_POLLS && !isFiscalSettled(latest)
  const summary = gaveUp
    ? { label: 'NFC-e ainda em andamento', variant: 'amber' as const, detail: 'Confira o estado no detalhe do pedido.' }
    : describeFiscal(latest, enabled)
  if (!enabled && summary.label === 'Sem NFC-e') return null // emissão desligada: a tela fica como sempre foi

  return (
    <div className="mb-6 flex flex-col items-center gap-1" aria-live="polite">
      <Badge variant={summary.variant}>{summary.label}</Badge>
      {summary.detail && <p className="text-xs text-slate-500 dark:text-slate-400">{summary.detail}</p>}
    </div>
  )
}
