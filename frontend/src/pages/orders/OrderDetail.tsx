import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  XCircleIcon,
  DocumentTextIcon,
  UserIcon,
  ShoppingBagIcon,
  ReceiptPercentIcon,
} from '@heroicons/react/24/outline'
import { getOrder, deliverOrder, cancelOrder, updateInvoice } from '@/api/orders'
import { formatCurrency, formatDate, formatPayment, formatStatus, formatUnit } from '@/utils/format'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { getApiError } from '@/api/client'
import type { OrderStatus } from '@/types'

function statusVariant(status: OrderStatus): 'green' | 'slate' | 'red' | 'amber' {
  if (status === 'delivered') return 'green'
  if (status === 'cancelled') return 'red'
  return 'amber'
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const [invoiceEdit, setInvoiceEdit] = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceSeries, setInvoiceSeries] = useState('')
  const [invoiceKey, setInvoiceKey] = useState('')
  const [invoiceError, setInvoiceError] = useState('')

  const { data: order, isPending } = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id!),
    enabled: !!id,
  })

  const deliverMutation = useMutation({
    mutationFn: () => deliverOrder(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelOrder(id!, cancelReason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setShowCancelModal(false)
      setCancelReason('')
    },
  })

  const invoiceMutation = useMutation({
    mutationFn: () =>
      updateInvoice(id!, {
        invoice_number: invoiceNumber.trim() || null,
        invoice_series: invoiceSeries.trim() || null,
        invoice_key: invoiceKey.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] })
      setInvoiceEdit(false)
      setInvoiceError('')
    },
    onError: (err) => setInvoiceError(getApiError(err)),
  })

  const openInvoiceEdit = () => {
    setInvoiceNumber(order?.invoice_number ?? '')
    setInvoiceSeries(order?.invoice_series ?? '')
    setInvoiceKey(order?.invoice_key ?? '')
    setInvoiceError('')
    setInvoiceEdit(true)
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="text-center py-16 text-slate-500 dark:text-slate-400">
        <p>Pedido não encontrado.</p>
        <button onClick={() => navigate('/orders')} className="mt-4 text-green-700 dark:text-green-400 hover:underline text-sm">
          Voltar para pedidos
        </button>
      </div>
    )
  }

  const hasInvoice = order.invoice_number || order.invoice_series || order.invoice_key

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        to="/orders"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-4"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Pedidos
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Pedido #{order.order_number}
            </h1>
            <Badge variant={statusVariant(order.status)}>
              {formatStatus(order.status)}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {formatDate(order.created_at)} — {order.created_by_name}
          </p>
        </div>

        {order.status === 'pending' && (
          <div className="flex gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCancelModal(true)}
              className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/30"
            >
              <XCircleIcon className="w-4 h-4 mr-1" />
              Cancelar
            </Button>
            <Button
              size="sm"
              loading={deliverMutation.isPending}
              onClick={() => deliverMutation.mutate()}
            >
              <CheckCircleIcon className="w-4 h-4 mr-1" />
              Marcar como entregue
            </Button>
          </div>
        )}

        {order.status === 'delivered' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowCancelModal(true)}
            className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/30 shrink-0"
          >
            <XCircleIcon className="w-4 h-4 mr-1" />
            Cancelar pedido
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 flex flex-col gap-5">
          {/* Items */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <ShoppingBagIcon className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              <h2 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                Produtos ({order.items.length})
              </h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.product_name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {item.qty} {formatUnit(item.unit_type)} × {formatCurrency(item.unit_price)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {formatCurrency(item.subtotal)}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 flex flex-col gap-1">
              {order.discount > 0 && (
                <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(order.total + order.discount)}</span>
                </div>
              )}
              {order.discount > 0 && (
                <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                  <span>Desconto</span>
                  <span className="tabular-nums">-{formatCurrency(order.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-slate-900 dark:text-slate-100">
                <span>Total</span>
                <span className="tabular-nums text-green-700 dark:text-green-400">{formatCurrency(order.total)}</span>
              </div>
            </div>
          </div>

          {/* Nota Fiscal */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <DocumentTextIcon className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                <h2 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">Nota Fiscal</h2>
              </div>
              {!invoiceEdit && (
                <button
                  onClick={openInvoiceEdit}
                  className="text-xs text-green-700 dark:text-green-400 hover:underline"
                >
                  {hasInvoice ? 'Editar' : 'Adicionar'}
                </button>
              )}
            </div>

            {invoiceEdit ? (
              <div className="p-5 flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">
                      Número da NF
                    </label>
                    <input
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="Ex: 000123"
                      className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">
                      Série
                    </label>
                    <input
                      value={invoiceSeries}
                      onChange={(e) => setInvoiceSeries(e.target.value)}
                      placeholder="Ex: 001"
                      className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">
                    Chave de Acesso (44 dígitos)
                  </label>
                  <input
                    value={invoiceKey}
                    onChange={(e) => setInvoiceKey(e.target.value.replace(/\D/g, '').slice(0, 44))}
                    placeholder="00000000000000000000000000000000000000000000"
                    maxLength={44}
                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-mono"
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{invoiceKey.length}/44 dígitos</p>
                </div>
                {invoiceError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{invoiceError}</p>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setInvoiceEdit(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" loading={invoiceMutation.isPending} onClick={() => invoiceMutation.mutate()}>
                    Salvar NF
                  </Button>
                </div>
              </div>
            ) : hasInvoice ? (
              <div className="p-5 flex flex-col gap-2">
                {order.invoice_number && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Número</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{order.invoice_number}</span>
                  </div>
                )}
                {order.invoice_series && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Série</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{order.invoice_series}</span>
                  </div>
                )}
                {order.invoice_key && (
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Chave de acesso</span>
                    <p className="text-xs font-mono text-slate-700 dark:text-slate-300 break-all bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2">
                      {order.invoice_key}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="px-5 py-6 text-center">
                <ReceiptPercentIcon className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400 dark:text-slate-500">Nenhuma nota fiscal cadastrada</p>
              </div>
            )}
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Observação</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">{order.notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar info */}
        <div className="flex flex-col gap-5">
          {/* Payment & status */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex flex-col gap-3">
            <InfoRow label="Forma de pagamento" value={formatPayment(order.payment_type)} />
            <InfoRow label="Total" value={formatCurrency(order.total)} highlight />
            {order.discount > 0 && (
              <InfoRow label="Desconto" value={`-${formatCurrency(order.discount)}`} />
            )}
            <InfoRow label="Operador" value={order.created_by_name} />
          </div>

          {/* Customer */}
          {order.customer ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex items-center gap-2 mb-3">
                <UserIcon className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                <h2 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">Cliente</h2>
              </div>
              <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">{order.customer.name}</p>
              {order.customer.phone && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{order.customer.phone}</p>
              )}
              {order.payment_type === 'installment' && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex flex-col gap-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Fiado em aberto</span>
                    <span className="font-medium text-amber-600 dark:text-amber-400 tabular-nums">
                      {formatCurrency(order.customer.balance_due)}
                    </span>
                  </div>
                  {order.customer.credit_limit > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Limite</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                        {formatCurrency(order.customer.credit_limit)}
                      </span>
                    </div>
                  )}
                  {order.customer.is_blocked && (
                    <Badge variant="red" className="mt-1">Cliente bloqueado</Badge>
                  )}
                </div>
              )}
              <Link
                to={`/customers/${order.customer.id}`}
                className="block mt-3 text-xs text-green-700 dark:text-green-400 hover:underline"
              >
                Ver histórico do cliente →
              </Link>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex items-center gap-2 mb-2">
                <UserIcon className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                <h2 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">Cliente</h2>
              </div>
              <p className="text-sm text-slate-400 dark:text-slate-500">Venda sem cliente</p>
            </div>
          )}
        </div>
      </div>

      {/* Cancel modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowCancelModal(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Cancelar pedido #{order.order_number}?
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Esta ação irá cancelar o pedido
              {order.payment_type === 'installment' && ' e reverter o saldo do fiado do cliente'}.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motivo do cancelamento (opcional)..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 mb-4 resize-none bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowCancelModal(false)}>
                Voltar
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                loading={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
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

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-sm font-semibold tabular-nums text-right ${highlight ? 'text-green-700 dark:text-green-400' : 'text-slate-900 dark:text-slate-100'}`}>
        {value}
      </span>
    </div>
  )
}
