import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listOrders } from '@/api/orders'
import { formatCurrency, formatDate, formatPayment, formatStatus } from '@/utils/format'
import { Badge } from '@/components/ui/Badge'
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

export default function OrderList() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<string>('')

  const { data: orders = [], isPending } = useQuery({
    queryKey: ['orders', statusFilter],
    queryFn: () => listOrders({ status: statusFilter || undefined, limit: 100 }),
  })

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Pedidos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{orders.length} pedido{orders.length !== 1 ? 's' : ''}</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 w-full sm:w-auto"
        >
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="delivered">Entregue</option>
          <option value="cancelled">Cancelado</option>
        </select>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {isPending ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-slate-400 dark:text-slate-500">
            <p>Nenhum pedido encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Pagamento</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Operador</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {orders.map((order: Order) => (
                  <tr
                    key={order.id}
                    onClick={() => navigate(`/orders/${order.id}`)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 tabular-nums font-mono text-slate-600 dark:text-slate-400">#{order.order_number}</td>
                    <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{order.customer?.name ?? <span className="text-slate-400 dark:text-slate-500">—</span>}</td>
                    <td className="px-4 py-3">
                      <Badge variant={paymentVariant(order.payment_type)}>
                        {formatPayment(order.payment_type)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      {formatCurrency(order.total)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(order.status)}>{formatStatus(order.status)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-sm">{order.created_by_name}</td>
                    <td className="px-4 py-3 text-slate-400 dark:text-slate-500 text-sm">{formatDate(order.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
