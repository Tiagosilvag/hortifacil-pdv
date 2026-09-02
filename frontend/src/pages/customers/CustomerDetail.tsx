import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'
import { getCustomer } from '@/api/customers'
import { listOrders, cancelOrder } from '@/api/orders'
import { listReceivables, registerPayment } from '@/api/receivables'
import { formatCurrency, formatDate, formatCustomerType, formatPayment, formatStatus } from '@/utils/format'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { Order, OrderStatus, Receivable, ReceivableStatus } from '@/types'

function statusVariant(s: OrderStatus): 'green' | 'amber' | 'red' | 'slate' {
  if (s === 'delivered') return 'green'
  if (s === 'cancelled') return 'red'
  return 'amber'
}

function recStatusVariant(s: ReceivableStatus): 'green' | 'amber' | 'red' | 'blue' | 'slate' {
  if (s === 'paid') return 'green'
  if (s === 'overdue') return 'red'
  if (s === 'partial') return 'amber'
  return 'blue'
}

function OrderRow({ order, onCancel }: { order: Order; onCancel: (o: Order) => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors">
        <td className="px-4 py-3 tabular-nums font-mono text-slate-600">#{order.order_number}</td>
        <td className="px-4 py-3">
          <Badge variant={statusVariant(order.status)}>{formatStatus(order.status)}</Badge>
        </td>
        <td className="px-4 py-3">
          <Badge variant="slate">{formatPayment(order.payment_type)}</Badge>
        </td>
        <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">
          {formatCurrency(order.total)}
        </td>
        <td className="px-4 py-3 text-slate-400 text-sm">{formatDate(order.created_at)}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 justify-end">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
            >
              {expanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
            </button>
            {order.status !== 'cancelled' && (
              <button
                onClick={() => onCancel(order)}
                className="text-xs px-2 py-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-slate-50 px-4 pb-3 pt-1">
            <div className="flex flex-wrap gap-2">
              {order.items.map((item) => (
                <div key={item.id} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs">
                  <span className="font-medium text-slate-900">{item.product_name}</span>
                  <span className="text-slate-500 ml-2">
                    {item.qty} {item.unit_type} × {formatCurrency(item.unit_price)} = {formatCurrency(item.subtotal)}
                  </span>
                </div>
              ))}
            </div>
            {order.notes && <p className="text-xs text-slate-500 mt-2">{order.notes}</p>}
          </td>
        </tr>
      )}
    </>
  )
}

function PayModal({
  rec,
  onClose,
  onPay,
  loading,
}: {
  rec: Receivable
  onClose: () => void
  onPay: (amount: number) => void
  loading: boolean
}) {
  const [amount, setAmount] = useState(String((rec.amount - rec.amount_paid).toFixed(2)))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
        <h3 className="font-semibold text-slate-900 mb-1">Registrar pagamento</h3>
        <p className="text-sm text-slate-500 mb-4">
          Saldo pendente: <strong>{formatCurrency(rec.amount - rec.amount_paid)}</strong>
        </p>
        <label className="block text-xs text-slate-500 mb-1">Valor recebido (R$)</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          max={rec.amount - rec.amount_paid}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 mb-4"
        />
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button
            className="flex-1"
            loading={loading}
            onClick={() => onPay(parseFloat(amount))}
            disabled={!amount || parseFloat(amount) <= 0}
          >
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'orders' | 'receivables'>('orders')
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [payTarget, setPayTarget] = useState<Receivable | null>(null)

  const { data: customer, isPending: loadingCustomer } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => getCustomer(id!),
    enabled: !!id,
  })

  const { data: orders = [], isPending: loadingOrders } = useQuery({
    queryKey: ['orders', 'customer', id],
    queryFn: () => listOrders({ customer_id: id!, limit: 200 }),
    enabled: !!id && tab === 'orders',
  })

  const { data: receivables = [], isPending: loadingReceivables } = useQuery({
    queryKey: ['receivables', 'customer', id],
    queryFn: () => listReceivables({ customer_id: id! }),
    enabled: !!id && tab === 'receivables',
  })

  const cancelMutation = useMutation({
    mutationFn: (o: Order) => cancelOrder(o.id, cancelReason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders', 'customer', id] })
      qc.invalidateQueries({ queryKey: ['customer', id] })
      setCancelTarget(null)
      setCancelReason('')
    },
  })

  const payMutation = useMutation({
    mutationFn: ({ recId, amount }: { recId: string; amount: number }) =>
      registerPayment(recId, amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receivables', 'customer', id] })
      qc.invalidateQueries({ queryKey: ['customer', id] })
      setPayTarget(null)
    },
  })

  if (loadingCustomer) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!customer) {
    return <div className="text-center py-12 text-slate-400">Cliente não encontrado</div>
  }

  return (
    <div className="max-w-5xl mx-auto">
      <button
        onClick={() => navigate('/customers')}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-5 transition-colors"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Voltar para Clientes
      </button>

      {/* Info card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{customer.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {formatCustomerType(customer.customer_type)}
              {customer.phone && ` · ${customer.phone}`}
            </p>
            {customer.notes && (
              <p className="text-sm text-slate-500 mt-1 italic">{customer.notes}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {customer.is_blocked && <Badge variant="red">Bloqueado</Badge>}
            {!customer.is_active && <Badge variant="slate">Inativo</Badge>}
            {customer.is_active && !customer.is_blocked && <Badge variant="green">Ativo</Badge>}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Fiado em aberto" value={formatCurrency(customer.balance_due)} accent={customer.balance_due > 0 ? 'amber' : undefined} />
          <Stat label="Limite de crédito" value={customer.credit_limit > 0 ? formatCurrency(customer.credit_limit) : '—'} />
          <Stat label="Cadastrado em" value={new Intl.DateTimeFormat('pt-BR').format(new Date(customer.created_at))} />
          <Stat label="Tipo" value={formatCustomerType(customer.customer_type)} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {(['orders', 'receivables'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === t ? 'bg-green-700 text-white' : 'text-slate-600 hover:bg-slate-100',
            ].join(' ')}
          >
            {t === 'orders' ? 'Pedidos' : 'Fiado'}
          </button>
        ))}
      </div>

      {/* Orders tab */}
      {tab === 'orders' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loadingOrders ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">Nenhum pedido encontrado</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pagamento</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Data</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((o) => (
                    <OrderRow key={o.id} order={o} onCancel={setCancelTarget} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Receivables tab */}
      {tab === 'receivables' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loadingReceivables ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : receivables.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">Nenhum fiado encontrado</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pedido</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pago</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Restante</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Data</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {receivables.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 tabular-nums font-mono text-slate-600">
                        {r.order_number ? `#${r.order_number}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={recStatusVariant(r.status)}>{formatStatus(r.status)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-900">{formatCurrency(r.amount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-green-700">{formatCurrency(r.amount_paid)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-amber-600">
                        {formatCurrency(r.amount - r.amount_paid)}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-sm">{formatDate(r.created_at)}</td>
                      <td className="px-4 py-3">
                        {r.status !== 'paid' && (
                          <button
                            onClick={() => setPayTarget(r)}
                            className="text-xs px-2 py-1 rounded-lg hover:bg-green-50 text-slate-400 hover:text-green-700 transition-colors"
                          >
                            Pagar
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

      {/* Cancel confirmation */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setCancelTarget(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-slate-900 mb-2">Cancelar pedido #{cancelTarget.order_number}?</h3>
            <p className="text-sm text-slate-500 mb-4">
              {cancelTarget.payment_type === 'installment'
                ? 'O saldo do fiado do cliente será revertido.'
                : 'Esta ação não pode ser desfeita.'}
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motivo (opcional)..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 mb-4 resize-none"
            />
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setCancelTarget(null)}>Voltar</Button>
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

      {/* Pay modal */}
      {payTarget && (
        <PayModal
          rec={payTarget}
          onClose={() => setPayTarget(null)}
          onPay={(amount) => payMutation.mutate({ recId: payTarget.id, amount })}
          loading={payMutation.isPending}
        />
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'amber' }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2.5">
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className={`font-semibold text-sm tabular-nums ${accent === 'amber' ? 'text-amber-700' : 'text-slate-800'}`}>
        {value}
      </p>
    </div>
  )
}
