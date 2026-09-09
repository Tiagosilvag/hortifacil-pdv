import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftIcon,
  UserIcon,
  PhoneIcon,
  CurrencyDollarIcon,
  ShoppingBagIcon,
  BanknotesIcon,
  MapPinIcon,
  IdentificationIcon,
} from '@heroicons/react/24/outline'
import { getCustomer } from '@/api/customers'
import { listOrders, cancelOrder } from '@/api/orders'
import { listReceivables, bulkPayReceivables } from '@/api/receivables'
import { formatCurrency, formatDate, formatPayment, formatStatus } from '@/utils/format'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { getApiError } from '@/api/client'
import type { Order, OrderStatus } from '@/types'

function orderStatusVariant(status: OrderStatus): 'green' | 'slate' | 'red' | 'amber' {
  if (status === 'delivered') return 'green'
  if (status === 'cancelled') return 'red'
  return 'amber'
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  const [bulkPayOpen, setBulkPayOpen] = useState(false)
  const [bulkPayAmount, setBulkPayAmount] = useState('')
  const [bulkPayError, setBulkPayError] = useState('')

  const { data: customer, isPending: loadingCustomer } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => getCustomer(id!),
    enabled: !!id,
  })

  const { data: orders = [], isPending: loadingOrders } = useQuery({
    queryKey: ['customer-orders', id],
    queryFn: () => listOrders({ customer_id: id, limit: 200 }),
    enabled: !!id,
  })

  const { data: receivables = [] } = useQuery({
    queryKey: ['customer-receivables', id],
    queryFn: () => listReceivables({ customer_id: id }),
    enabled: !!id,
  })

  const cancelMutation = useMutation({
    mutationFn: (o: Order) => cancelOrder(o.id, cancelReason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-orders', id] })
      qc.invalidateQueries({ queryKey: ['customer', id] })
      qc.invalidateQueries({ queryKey: ['customer-receivables', id] })
      setCancelTarget(null)
      setCancelReason('')
    },
  })

  const bulkPayMutation = useMutation({
    mutationFn: (amount: number) => bulkPayReceivables(id!, amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-receivables', id] })
      qc.invalidateQueries({ queryKey: ['customer', id] })
      setBulkPayOpen(false)
      setBulkPayAmount('')
      setBulkPayError('')
    },
    onError: (err) => setBulkPayError(getApiError(err)),
  })

  const openBulkPay = () => {
    setBulkPayAmount(customer ? Number(customer.balance_due).toFixed(2) : '')
    setBulkPayError('')
    setBulkPayOpen(true)
  }

  const handleBulkPay = () => {
    const amount = parseFloat(bulkPayAmount)
    if (isNaN(amount) || amount <= 0) { setBulkPayError('Valor inválido'); return }
    bulkPayMutation.mutate(amount)
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
        <button onClick={() => navigate(-1)} className="mt-4 text-green-700 dark:text-green-400 hover:underline text-sm">
          Voltar para clientes
        </button>
      </div>
    )
  }

  const activeOrders = orders.filter((o) => o.status !== 'cancelled')
  const totalSpent = activeOrders.reduce((s, o) => s + Number(o.total), 0)
  const totalPaid = activeOrders
    .filter((o) => o.payment_type !== 'installment')
    .reduce((s, o) => s + Number(o.total), 0)

  // Map receivables by order_number for quick lookup
  const recByOrderNum = new Map(receivables.map((r) => [r.order_number, r]))

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-4"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Voltar
      </button>

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
                  <PhoneIcon className="w-3.5 h-3.5 shrink-0" />
                  {customer.phone}
                </div>
              )}
              {customer.document && (
                <div className="flex items-center gap-1.5 mt-1 text-sm text-slate-500 dark:text-slate-400">
                  <IdentificationIcon className="w-3.5 h-3.5 shrink-0" />
                  {customer.document}
                </div>
              )}
              {customer.address && (
                <div className="flex items-start gap-1.5 mt-1 text-sm text-slate-500 dark:text-slate-400">
                  <MapPinIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {customer.address}
                </div>
              )}
              {customer.notes && (
                <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">{customer.notes}</p>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
            icon={<ShoppingBagIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
            label="Total de pedidos"
            value={String(orders.length)}
          />
          <StatCell
            icon={<BanknotesIcon className="w-4 h-4 text-green-600 dark:text-green-400" />}
            label="Total gasto"
            value={formatCurrency(totalSpent)}
            highlight="green"
          />
          <StatCell
            icon={<BanknotesIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
            label="Total pago"
            value={formatCurrency(totalPaid)}
            highlight="emerald"
          />
        </div>
      </div>

      {/* Orders section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Pedidos</h2>
          {customer.balance_due > 0 && (
            <Button size="sm" onClick={openBulkPay}>
              <BanknotesIcon className="w-4 h-4 mr-1.5" />
              Receber Fiado
            </Button>
          )}
        </div>

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
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Pagamento</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Falta pagar</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Operador</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Data</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {orders.map((order) => {
                  const rec = order.payment_type === 'installment' ? recByOrderNum.get(order.order_number) : undefined
                  const fiadoRemaining = rec ? rec.amount - rec.amount_paid : null
                  return (
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
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fiadoRemaining !== null ? (
                          fiadoRemaining > 0 ? (
                            <span className="font-semibold text-amber-700 dark:text-amber-400">
                              {formatCurrency(fiadoRemaining)}
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">Quitado</span>
                          )
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={orderStatusVariant(order.status)}>
                          {formatStatus(order.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {order.created_by_name}
                      </td>
                      <td className="px-4 py-3 text-slate-400 dark:text-slate-500 text-xs">
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {order.status !== 'cancelled' && (
                          <button
                            onClick={() => setCancelTarget(order)}
                            className="text-xs px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-300 dark:text-red-900 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          >
                            Cancelar
                          </button>
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

      {/* Cancel modal */}
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

      {/* Receber Fiado modal */}
      {bulkPayOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setBulkPayOpen(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Receber Fiado</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Total em aberto:{' '}
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {formatCurrency(customer.balance_due)}
              </span>
              <br />
              O valor será descontado dos pedidos mais antigos primeiro.
            </p>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1">
              Valor recebido (R$)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={bulkPayAmount}
              onChange={(e) => { setBulkPayAmount(e.target.value); setBulkPayError('') }}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 mb-4 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              autoFocus
            />
            {bulkPayError && <p className="text-xs text-red-600 dark:text-red-400 mb-3">{bulkPayError}</p>}
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setBulkPayOpen(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" loading={bulkPayMutation.isPending} onClick={handleBulkPay}>
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
  highlight?: 'green' | 'amber' | 'emerald'
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
        highlight === 'emerald' ? 'text-emerald-700 dark:text-emerald-400' :
        'text-slate-900 dark:text-slate-100',
      ].join(' ')}>
        {value}
      </p>
    </div>
  )
}
