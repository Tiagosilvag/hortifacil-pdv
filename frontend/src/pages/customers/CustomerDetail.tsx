import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftIcon,
  UserIcon,
  PhoneIcon,
  CurrencyDollarIcon,
  ShoppingBagIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline'
import { getCustomer } from '@/api/customers'
import { listOrders, cancelOrder } from '@/api/orders'
import { listReceivables, registerPayment } from '@/api/receivables'
import { formatCurrency, formatDate, formatPayment, formatStatus } from '@/utils/format'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { getApiError } from '@/api/client'
import type { Order, Receivable, OrderStatus, ReceivableStatus } from '@/types'

function orderStatusVariant(status: OrderStatus): 'green' | 'slate' | 'red' | 'amber' {
  if (status === 'delivered') return 'green'
  if (status === 'cancelled') return 'red'
  return 'amber'
}

function receivableStatusVariant(status: ReceivableStatus): 'amber' | 'blue' | 'emerald' | 'red' | 'slate' {
  if (status === 'open') return 'amber'
  if (status === 'partial') return 'blue'
  if (status === 'paid') return 'emerald'
  if (status === 'overdue') return 'red'
  return 'slate'
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'orders' | 'receivables'>('orders')

  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  const [payTarget, setPayTarget] = useState<Receivable | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payError, setPayError] = useState('')

  const { data: customer, isPending: loadingCustomer } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => getCustomer(id!),
    enabled: !!id,
  })

  const { data: orders = [], isPending: loadingOrders } = useQuery({
    queryKey: ['customer-orders', id],
    queryFn: () => listOrders({ customer_id: id, limit: 200 }),
    enabled: !!id && tab === 'orders',
  })

  const { data: receivables = [], isPending: loadingReceivables } = useQuery({
    queryKey: ['customer-receivables', id],
    queryFn: () => listReceivables({ customer_id: id }),
    enabled: !!id && tab === 'receivables',
  })

  const cancelMutation = useMutation({
    mutationFn: (o: Order) => cancelOrder(o.id, cancelReason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-orders', id] })
      qc.invalidateQueries({ queryKey: ['customer', id] })
      setCancelTarget(null)
      setCancelReason('')
    },
  })

  const payMutation = useMutation({
    mutationFn: ({ rec, amount }: { rec: Receivable; amount: number }) =>
      registerPayment(rec.id, amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-receivables', id] })
      qc.invalidateQueries({ queryKey: ['customer', id] })
      setPayTarget(null)
      setPayAmount('')
      setPayError('')
    },
    onError: (err) => setPayError(getApiError(err)),
  })

  const openPayModal = (rec: Receivable) => {
    const remaining = rec.amount - rec.amount_paid
    setPayTarget(rec)
    setPayAmount(remaining.toFixed(2))
    setPayError('')
  }

  const handlePay = () => {
    const amount = parseFloat(payAmount)
    if (isNaN(amount) || amount <= 0) { setPayError('Valor inválido'); return }
    payMutation.mutate({ rec: payTarget!, amount })
  }

  if (loadingCustomer) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="text-center py-16 text-slate-500 dark:text-slate-400">
        <p>Cliente não encontrado.</p>
        <button onClick={() => navigate('/customers')} className="mt-4 text-green-700 dark:text-green-400 hover:underline text-sm">
          Voltar para clientes
        </button>
      </div>
    )
  }

  const totalOrders = orders.length
  const totalSpent = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + o.total, 0)

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        to="/customers"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-4"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Clientes
      </Link>

      {/* Customer card */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center shrink-0">
              <UserIcon className="w-6 h-6 text-green-700 dark:text-green-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{customer.name}</h1>
                {customer.is_blocked && <Badge variant="red">Bloqueado</Badge>}
              </div>
              {customer.phone && (
                <div className="flex items-center gap-1.5 mt-1 text-sm text-slate-500 dark:text-slate-400">
                  <PhoneIcon className="w-3.5 h-3.5" />
                  {customer.phone}
                </div>
              )}
              {customer.notes && (
                <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">{customer.notes}</p>
              )}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCell
            icon={<CurrencyDollarIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
            label="Fiado em aberto"
            value={formatCurrency(customer.balance_due)}
            highlight={customer.balance_due > 0 ? 'amber' : undefined}
          />
          <StatCell
            icon={<CurrencyDollarIcon className="w-4 h-4 text-slate-400 dark:text-slate-500" />}
            label="Limite de crédito"
            value={customer.credit_limit > 0 ? formatCurrency(customer.credit_limit) : 'Sem limite'}
          />
          <StatCell
            icon={<ShoppingBagIcon className="w-4 h-4 text-green-600 dark:text-green-400" />}
            label="Total de pedidos"
            value={String(totalOrders)}
          />
          <StatCell
            icon={<BanknotesIcon className="w-4 h-4 text-green-600 dark:text-green-400" />}
            label="Total gasto"
            value={formatCurrency(totalSpent)}
            highlight="green"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit border border-slate-200 dark:border-slate-700">
        {(['orders', 'receivables'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === t
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            ].join(' ')}
          >
            {t === 'orders' ? 'Pedidos' : 'Fiado'}
          </button>
        ))}
      </div>

      {/* Orders tab */}
      {tab === 'orders' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {loadingOrders ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500">
              <ShoppingBagIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nenhum pedido encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Pagamento</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Data</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3 tabular-nums font-mono text-slate-600 dark:text-slate-400">
                        #{order.order_number}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {formatPayment(order.payment_type)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {formatCurrency(order.total)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={orderStatusVariant(order.status)}>
                          {formatStatus(order.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-400 dark:text-slate-500 text-xs">
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {order.status !== 'cancelled' && (
                          <button
                            onClick={() => setCancelTarget(order)}
                            className="text-xs px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          >
                            Cancelar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Receivables tab */}
      {tab === 'receivables' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {loadingReceivables ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : receivables.length === 0 ? (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500">
              <BanknotesIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nenhum fiado encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
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
                          {remaining > 0 ? formatCurrency(remaining) : (
                            <span className="text-emerald-600 dark:text-emerald-400">Quitado</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={receivableStatusVariant(rec.status)}>
                            {formatStatus(rec.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-400 dark:text-slate-500 text-xs">
                          {formatDate(rec.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
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
      )}

      {/* Cancel order modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setCancelTarget(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Cancelar pedido #{cancelTarget.order_number}?
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Esta ação irá cancelar o pedido
              {cancelTarget.payment_type === 'installment' && ' e reverter o saldo do fiado do cliente'}.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motivo do cancelamento (opcional)..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 mb-4 resize-none bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setCancelTarget(null)}>
                Voltar
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                loading={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(cancelTarget)}
              >
                Cancelar pedido
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setPayTarget(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Registrar pagamento</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {payTarget.order_number && `Pedido #${payTarget.order_number} — `}
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {formatCurrency(payTarget.amount - payTarget.amount_paid)} restante
              </span>
            </p>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1">
              Valor recebido (R$)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={payAmount}
              onChange={(e) => { setPayAmount(e.target.value); setPayError('') }}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 mb-4 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              autoFocus
            />
            {payError && <p className="text-xs text-red-600 dark:text-red-400 mb-3">{payError}</p>}
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setPayTarget(null)}>
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

function StatCell({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  highlight?: 'green' | 'amber'
}) {
  return (
    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <p className={[
        'text-base font-bold tabular-nums',
        highlight === 'amber' ? 'text-amber-700 dark:text-amber-400' :
        highlight === 'green' ? 'text-green-700 dark:text-green-400' :
        'text-slate-900 dark:text-slate-100',
      ].join(' ')}>
        {value}
      </p>
    </div>
  )
}
