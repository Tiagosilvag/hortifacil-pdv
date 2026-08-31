import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'
import { listOrders, cancelOrder } from '@/api/orders'
import { formatCurrency, formatDate, formatPayment, formatStatus } from '@/utils/format'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { Order, OrderStatus } from '@/types'

function statusVariant(status: OrderStatus): 'green' | 'slate' | 'red' | 'amber' {
  if (status === 'delivered') return 'green'
  if (status === 'cancelled') return 'red'
  return 'amber'
}

function paymentVariant(type: string): 'green' | 'blue' | 'amber' | 'slate' {
  if (type === 'cash') return 'green'
  if (type === 'pix') return 'blue'
  if (type === 'installment') return 'amber'
  return 'slate'
}

function OrderRow({ order, onCancel }: { order: Order; onCancel: (o: Order) => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors">
        <td className="px-4 py-3 tabular-nums font-mono text-slate-600">#{order.order_number}</td>
        <td className="px-4 py-3 text-slate-900">{order.customer?.name ?? <span className="text-slate-400">—</span>}</td>
        <td className="px-4 py-3">
          <Badge variant={paymentVariant(order.payment_type)}>
            {formatPayment(order.payment_type)}
          </Badge>
        </td>
        <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">
          {formatCurrency(order.total)}
        </td>
        <td className="px-4 py-3">
          <Badge variant={statusVariant(order.status)}>{formatStatus(order.status)}</Badge>
        </td>
        <td className="px-4 py-3 text-slate-500 text-sm">{order.created_by_name}</td>
        <td className="px-4 py-3 text-slate-400 text-sm">{formatDate(order.created_at)}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 justify-end">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              title="Ver itens"
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
          <td colSpan={8} className="bg-slate-50 px-4 pb-3 pt-1">
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
            {order.notes && (
              <p className="text-xs text-slate-500 mt-2">📝 {order.notes}</p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export default function OrderList() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  const { data: orders = [], isPending } = useQuery({
    queryKey: ['orders', statusFilter],
    queryFn: () => listOrders({ status: statusFilter || undefined, limit: 100 }),
  })

  const cancelMutation = useMutation({
    mutationFn: (o: Order) => cancelOrder(o.id, cancelReason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setCancelTarget(null)
      setCancelReason('')
    },
  })

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pedidos</h1>
          <p className="text-sm text-slate-500 mt-0.5">{orders.length} pedido{orders.length !== 1 ? 's' : ''}</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
        >
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="delivered">Entregue</option>
          <option value="cancelled">Cancelado</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isPending ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p>Nenhum pedido encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pagamento</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Operador</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Data</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => (
                  <OrderRow key={order.id} order={order} onCancel={setCancelTarget} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cancel confirmation */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setCancelTarget(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-slate-900 mb-2">
              Cancelar pedido #{cancelTarget.order_number}?
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Esta ação irá cancelar o pedido
              {cancelTarget.payment_type === 'installment' && ' e reverter o saldo do fiado do cliente'}.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motivo do cancelamento (opcional)..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 mb-4 resize-none"
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
    </div>
  )
}
