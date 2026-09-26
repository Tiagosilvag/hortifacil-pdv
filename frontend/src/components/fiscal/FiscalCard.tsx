import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QrCodeIcon } from '@heroicons/react/24/outline'
import { emitOrderNfce, getFiscalStatus } from '@/api/fiscal'
import { getApiError } from '@/api/client'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/utils/format'
import { cleanValidationMessage, describeFiscal, fiscalStatusOf, formatAccessKey } from '@/utils/fiscal'
import type { Order } from '@/types'

/** Cartão "NFC-e" do detalhe do pedido: estado, dados da nota autorizada e "Tentar de novo". */
export function FiscalCard({ order }: { order: Order }) {
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const { data: status } = useQuery({ queryKey: ['fiscal', 'status'], queryFn: getFiscalStatus, staleTime: 60_000 })
  const enabled = !!status?.enabled

  const retry = useMutation({
    mutationFn: () => emitOrderNfce(order.id),
    onSuccess: (updated) => {
      setError('')
      qc.setQueryData(['order', order.id], updated)
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err) => setError(cleanValidationMessage(getApiError(err))),
  })

  const fiscal = fiscalStatusOf(order)
  // Pedido sem nota e sem nada a dizer (anterior à NFC-e, ou emissão desligada): o cartão nem aparece.
  if (fiscal === 'not_required' && !order.fiscal_error) return null

  const summary = describeFiscal(order, enabled)
  const canRetry = enabled && (fiscal === 'pending' || fiscal === 'rejected') && order.status !== 'cancelled'

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <QrCodeIcon className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          <h2 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">NFC-e</h2>
        </div>
        <Badge variant={summary.variant}>{summary.label}</Badge>
      </div>

      <div className="p-5 flex flex-col gap-3 text-sm">
        {fiscal === 'authorized' && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-slate-700 dark:text-slate-300">
            <dt className="text-slate-500 dark:text-slate-400">Número / série</dt>
            <dd>{order.invoice_number ?? '—'} / {order.invoice_series ?? '—'}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Chave</dt>
            <dd className="font-mono text-xs break-all">{formatAccessKey(order.invoice_key) || '—'}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Protocolo</dt>
            <dd>{order.fiscal_protocol ?? '—'}</dd>
            {order.fiscal_emitted_at && (
              <>
                <dt className="text-slate-500 dark:text-slate-400">Emitida em</dt>
                <dd>{formatDate(order.fiscal_emitted_at)}</dd>
              </>
            )}
          </dl>
        )}

        {summary.detail && <p className="text-slate-600 dark:text-slate-400">{summary.detail}</p>}
        {error && <p className="text-red-700 dark:text-red-400">{error}</p>}

        {canRetry && (
          <div>
            <Button size="sm" variant="secondary" loading={retry.isPending} onClick={() => retry.mutate()}>
              Tentar de novo
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
