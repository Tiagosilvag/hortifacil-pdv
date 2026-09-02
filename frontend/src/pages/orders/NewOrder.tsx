import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  XMarkIcon,
  PlusIcon,
  MinusIcon,
  MagnifyingGlassIcon,
  ShoppingCartIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { listCustomers } from '@/api/customers'
import { listProducts } from '@/api/products'
import { createOrder } from '@/api/orders'
import { getApiError } from '@/api/client'
import { formatCurrency, formatUnit } from '@/utils/format'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import type { Customer, Product } from '@/types'

interface CartItem {
  product: Product
  qty: number
}

export default function NewOrder() {
  const navigate = useNavigate()

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDrop, setShowCustomerDrop] = useState(false)
  const customerRef = useRef<HTMLDivElement>(null)

  const [productSearch, setProductSearch] = useState('')
  const [showProductDrop, setShowProductDrop] = useState(false)
  const productRef = useRef<HTMLDivElement>(null)

  const [cart, setCart] = useState<CartItem[]>([])
  const [paymentType, setPaymentType] = useState('cash')
  const [discount, setDiscount] = useState('')
  const [notes, setNotes] = useState('')
  const [apiError, setApiError] = useState('')
  const [success, setSuccess] = useState(false)
  const [lastOrder, setLastOrder] = useState<{ number: number; total: number } | null>(null)

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-search', customerSearch],
    queryFn: () => listCustomers({ search: customerSearch }),
    enabled: showCustomerDrop,
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products-search', productSearch],
    queryFn: () => listProducts({ search: productSearch }),
    enabled: showProductDrop,
  })

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.qty, 0)
  const discountValue = parseFloat(discount) || 0
  const total = Math.max(0, subtotal - discountValue)

  const creditAvailable = selectedCustomer && selectedCustomer.credit_limit > 0
    ? selectedCustomer.credit_limit - selectedCustomer.balance_due
    : null
  const exceedsCredit = paymentType === 'installment' && creditAvailable !== null && total > creditAvailable

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) return prev.map((i) => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { product, qty: 1 }]
    })
    setProductSearch('')
    setShowProductDrop(false)
  }

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => i.product.id === productId ? { ...i, qty: i.qty + delta } : i)
        .filter((i) => i.qty > 0)
    )
  }

  const setQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.product.id !== productId))
    } else {
      setCart((prev) => prev.map((i) => i.product.id === productId ? { ...i, qty } : i))
    }
  }

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId))
  }

  const mutation = useMutation({
    mutationFn: createOrder,
    onSuccess: (order) => {
      setLastOrder({ number: order.order_number, total: order.total })
      setSuccess(true)
    },
    onError: (err) => setApiError(getApiError(err)),
  })

  const handleSubmit = () => {
    if (cart.length === 0) { setApiError('Adicione pelo menos um produto'); return }
    if (paymentType === 'installment' && !selectedCustomer) {
      setApiError('Selecione um cliente para venda fiado')
      return
    }
    if (exceedsCredit) {
      setApiError(`Valor excede o crédito disponível (R$ ${creditAvailable!.toFixed(2).replace('.', ',')})`)
      return
    }
    setApiError('')
    mutation.mutate({
      customer_id: selectedCustomer?.id,
      payment_type: paymentType,
      items: cart.map((i) => ({ product_id: i.product.id, qty: i.qty })),
      discount: discountValue || undefined,
      notes: notes || undefined,
    })
  }

  const handleNewOrder = () => {
    setSelectedCustomer(null)
    setCustomerSearch('')
    setCart([])
    setPaymentType('cash')
    setDiscount('')
    setNotes('')
    setApiError('')
    setSuccess(false)
    setLastOrder(null)
  }

  if (success && lastOrder) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-10 shadow-sm">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingCartIcon className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">Pedido #{lastOrder.number}</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-2">Registrado com sucesso!</p>
          <p className="text-3xl font-bold text-green-700 dark:text-green-400 mb-8">{formatCurrency(lastOrder.total)}</p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => navigate('/orders')}>
              Ver Pedidos
            </Button>
            <Button className="flex-1" onClick={handleNewOrder}>
              Novo Pedido
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ShoppingCartIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Novo Pedido</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Customer search */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              Cliente <span className="text-slate-400 dark:text-slate-500 font-normal">(opcional — obrigatório para Fiado)</span>
            </p>
            {selectedCustomer ? (
              <div className={`flex items-center justify-between p-3 rounded-lg border ${selectedCustomer.is_blocked ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{selectedCustomer.name}</p>
                    {selectedCustomer.is_blocked && <Badge variant="red">Bloqueado</Badge>}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Fiado: {formatCurrency(selectedCustomer.balance_due)}
                    {selectedCustomer.credit_limit > 0 && ` / Limite: ${formatCurrency(selectedCustomer.credit_limit)}`}
                  </p>
                  {selectedCustomer.is_blocked && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 flex items-center gap-1">
                      <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                      Bloqueado — não é possível vender fiado
                    </p>
                  )}
                </div>
                <button onClick={() => setSelectedCustomer(null)} className="p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div ref={customerRef} className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                <input
                  value={customerSearch}
                  onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDrop(true) }}
                  onFocus={() => setShowCustomerDrop(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDrop(false), 150)}
                  placeholder="Buscar cliente por nome..."
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
                {showCustomerDrop && customers.length > 0 && (
                  <div className="absolute top-full mt-1 w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                    {customers.map((c) => (
                      <button
                        key={c.id}
                        onMouseDown={() => { setSelectedCustomer(c); setShowCustomerDrop(false); setCustomerSearch('') }}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-600 text-left text-sm"
                      >
                        <span className="font-medium text-slate-900 dark:text-slate-100">{c.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {c.is_blocked && <Badge variant="red">Bloqueado</Badge>}
                          {c.balance_due > 0 && (
                            <span className="text-xs text-amber-600 dark:text-amber-400">{formatCurrency(c.balance_due)}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Product search */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Adicionar produto</p>
            <div ref={productRef} className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <input
                value={productSearch}
                onChange={(e) => { setProductSearch(e.target.value); setShowProductDrop(true) }}
                onFocus={() => setShowProductDrop(true)}
                onBlur={() => setTimeout(() => setShowProductDrop(false), 150)}
                placeholder="Buscar produto por nome ou código..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              {showProductDrop && products.length > 0 && (
                <div className="absolute top-full mt-1 w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg z-20 max-h-56 overflow-y-auto">
                  {products.map((p) => (
                    <button
                      key={p.id}
                      onMouseDown={() => addToCart(p)}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-600 text-left text-sm"
                    >
                      <div>
                        <span className="font-medium text-slate-900 dark:text-slate-100">{p.name}</span>
                        {p.category && <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">{p.category}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-500 dark:text-slate-400">/{formatUnit(p.unit_type)}</span>
                        <span className="font-semibold text-green-700 dark:text-green-400">{formatCurrency(p.price)}</span>
                        <PlusIcon className="w-4 h-4 text-green-600 dark:text-green-400" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {cart.length > 0 && (
            <div className="lg:hidden bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Itens ({cart.length})</p>
              <CartItemList cart={cart} updateQty={updateQty} setQty={setQty} removeItem={removeItem} />
            </div>
          )}
        </div>

        {/* Right: order summary */}
        <div className="flex flex-col gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Resumo do pedido</p>
              {cart.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">Nenhum item adicionado</p>
              ) : (
                <div className="hidden lg:block">
                  <CartItemList cart={cart} updateQty={updateQty} setQty={setQty} removeItem={removeItem} />
                </div>
              )}
            </div>

            {/* Payment type */}
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Pagamento</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'cash', label: 'Dinheiro' },
                  { value: 'pix', label: 'Pix' },
                  { value: 'debit_card', label: 'Débito' },
                  { value: 'credit_card', label: 'Crédito' },
                  { value: 'installment', label: 'Fiado' },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setPaymentType(value)}
                    className={[
                      'px-3 py-2 text-sm rounded-lg border font-medium transition-colors',
                      paymentType === value
                        ? value === 'installment'
                          ? 'bg-amber-500 border-amber-500 text-white'
                          : 'bg-green-600 border-green-600 text-white'
                        : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {paymentType === 'installment' && !selectedCustomer && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                  <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                  Selecione um cliente para vender fiado
                </p>
              )}
              {paymentType === 'installment' && selectedCustomer?.is_blocked && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-2 flex items-center gap-1">
                  <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                  Cliente bloqueado — não é possível vender fiado
                </p>
              )}
              {exceedsCredit && (
                <div className="mt-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2">
                  <p className="text-xs text-red-700 dark:text-red-400 font-medium flex items-center gap-1">
                    <ExclamationTriangleIcon className="w-3.5 h-3.5 shrink-0" />
                    Limite insuficiente
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                    Disponível: {formatCurrency(creditAvailable!)} · Em aberto: {formatCurrency(selectedCustomer!.balance_due)} · Limite: {formatCurrency(selectedCustomer!.credit_limit)}
                  </p>
                </div>
              )}
            </div>

            {/* Discount */}
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">
                Desconto (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0,00"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">
                Observação
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anotação para o pedido..."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            {/* Totals */}
            <div className="border-t border-slate-100 dark:border-slate-700 pt-3 flex flex-col gap-1">
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              {discountValue > 0 && (
                <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                  <span>Desconto</span>
                  <span className="tabular-nums">-{formatCurrency(discountValue)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
                <span>Total</span>
                <span className="tabular-nums text-green-700 dark:text-green-400">{formatCurrency(total)}</span>
              </div>
            </div>

            {apiError && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2">
                <p className="text-xs text-red-700 dark:text-red-400">{apiError}</p>
              </div>
            )}

            <Button
              onClick={handleSubmit}
              loading={mutation.isPending}
              size="lg"
              className="w-full"
              disabled={cart.length === 0 || exceedsCredit || (paymentType === 'installment' && !!selectedCustomer?.is_blocked)}
            >
              Confirmar Pedido
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CartItemList({
  cart,
  updateQty,
  setQty,
  removeItem,
}: {
  cart: CartItem[]
  updateQty: (id: string, delta: number) => void
  setQty: (id: string, qty: number) => void
  removeItem: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {cart.map(({ product, qty }) => (
        <div key={product.id} className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{product.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatCurrency(product.price)}/{formatUnit(product.unit_type)}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => updateQty(product.id, -1)}
              className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center"
            >
              <MinusIcon className="w-3 h-3 text-slate-600 dark:text-slate-400" />
            </button>
            <input
              type="number"
              min="0.001"
              step="any"
              value={qty}
              onChange={(e) => setQty(product.id, parseFloat(e.target.value) || 0)}
              className="w-14 text-center text-sm border border-slate-200 dark:border-slate-600 rounded-lg py-0.5 focus:outline-none focus:ring-1 focus:ring-green-500 tabular-nums bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            />
            <button
              onClick={() => updateQty(product.id, 1)}
              className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center"
            >
              <PlusIcon className="w-3 h-3 text-slate-600 dark:text-slate-400" />
            </button>
          </div>
          <span className="text-sm font-semibold text-green-700 dark:text-green-400 w-20 text-right tabular-nums shrink-0">
            {formatCurrency(product.price * qty)}
          </span>
          <button
            onClick={() => removeItem(product.id)}
            className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-200 dark:text-red-950 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
