import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BanknotesIcon } from '@heroicons/react/24/outline'
import { listReceivables, registerPayment } from '@/api/receivables'
import { formatCurrency, formatDate, formatDateShort, formatStatus } from '@/utils/format'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { getApiError } from '@/api/client'
import type { Receivable, ReceivableStatus } from '@/types'

function statusVariant(status: ReceivableStatus): 'amber' | 'blue' | 'emerald' | 'red' | 'slate' {
  if (status === 'open') return 'amber'
  if (status === 'partial') return 'blue'
  if (status === 'paid') return 'emerald'
  if (status === 'overdue') return 'red'
  return 'slate'
}

interface PaymentModal {
  receivable: Receivable
  amount: string
  error: string
}

export default function ReceivableList() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('open,partial,overdue')
  const [payModal, setPayModal] = useState<PaymentModal | null>(null)

  const { data: receivables = [], isPending } = useQuery({
    queryKey: ['receivables', statusFilter],
    queryFn: () => {
      const statuses = statusFilter ? statusFilter.split(',') : []
      if (statuses.length === 0) return listReceivables()
      if (statuses.length === 1) return listReceivables({ status: statuses[0] })
      return Promise.all(statuses.map((s) => listReceivables({ status: s }))).then((results) =>
        results.flat().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      )
    },
  })

  const payMutation = useMutation({
    mutationFn: ({ rec, amount }: { rec: Receivable; amount: number }) =>
      registerPayment(rec.id, amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receivables'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setPayModal(null)
    },
    onError: (err) => {
      if (payModal) setPayModal({ ...payModal, error: getApiError(err) })
    },
  })

  const openPayModal = (rec: Receivable) => {
    const remaining = rec.amount - rec.amount_paid
    setPayModal({ receivable: rec, amount: String(remaining.toFixed(2)), error: '' })
  }

  const handlePay = () => {
    if (!payModal) return
    const amount = parseFloat(payModal.amount)
    if (isNaN(amount) || amount <= 0) {
      setPayModal({ ...payModal, error: 'Valor inválido' })
      return
    }
    payMutation.mutate({ rec: payModal.receivable, amount })
  }

  const totalOpen = receivables
    .filter((r) => r.status !== 'paid')
    .reduce((sum, r) => sum + (r.amount - r.amount_paid), 0)

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Fiado / Cobranças</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {receivables.length} conta{receivables.length !== 1 ? 's' : ''}
            {totalOpen > 0 && ` — ${formatCurrency(totalOpen)} em aberto`}
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 w-full sm:w-auto"
        >
          <option value="open,partial,overdue">Em aberto</option>
          <option value="open">Aberto</option>
          <option value="partial">Parcial</option>
          <option value="overdue">Vencido</option>
          <option value="paid">Pagos</option>
          <option value="">Todos</option>
        </select>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {isPending ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : receivables.length === 0 ? (
          <div className="text-center py-12 text-slate-400 dark:text-slate-500">
            <BanknotesIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Nenhuma cobrança encontrada</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Pedido</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Pago</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Restante</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Data</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {receivables.map((rec) => {
                  const remaining = rec.amount - rec.amount_paid
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{rec.customer?.name ?? '—'}</p>
                        {rec.customer?.is_blocked && (
                          <Badge variant="red" className="mt-0.5">Bloqueado</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {rec.order_number ? `#${rec.order_number}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {formatCurrency(rec.amount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                        {rec.amount_paid > 0 ? formatCurrency(rec.amount_paid) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                        {remaining > 0 ? formatCurrency(remaining) : <span className="text-emerald-600 dark:text-emerald-400">Quitado</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(rec.status)}>{formatStatus(rec.status)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-400 dark:text-slate-500 text-xs">
                        {formatDate(rec.created_at)}
                        {rec.due_date && (
                          <p className="text-slate-300 dark:text-slate-600">Vence {formatDateShort(rec.due_date)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {rec.status !== 'paid' && (
                          <Button size="sm" variant="secondary" onClick={() => openPayModal(rec)}>
                            Receber
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setPayModal(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Registrar pagamento</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {payModal.receivable.customer?.name} —{' '}
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {formatCurrency(payModal.receivable.amount - payModal.receivable.amount_paid)} restante
              </span>
            </p>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1">Valor recebido (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={payModal.amount}
              onChange={(e) => setPayModal({ ...payModal, amount: e.target.value, error: '' })}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 mb-4 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              autoFocus
            />
            {payModal.error && (
              <p className="text-xs text-red-600 dark:text-red-400 mb-3">{payModal.error}</p>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setPayModal(null)}>
                Cancelar
              </Button>
              <Button className="flex-1" loading={payMutation.isPending} onClick={handlePay}>
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
