import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, ExclamationTriangleIcon, ClockIcon } from '@heroicons/react/24/outline'
import { listStockLosses, createStockLoss } from '@/api/stock_losses'
import { listProducts } from '@/api/products'
import { getApiError } from '@/api/client'
import { formatUnit } from '@/utils/format'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { useForm } from 'react-hook-form'
import type { Product } from '@/types'

interface LossFormData {
  product_id: string
  qty: string
  reason: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function LossList() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'losses' | 'stock'>('losses')
  const [modalOpen, setModalOpen] = useState(false)
  const [apiError, setApiError] = useState('')

  const { data: losses = [], isPending: loadingLosses } = useQuery({
    queryKey: ['stock-losses'],
    queryFn: () => listStockLosses({ limit: 200 }),
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products', ''],
    queryFn: () => listProducts({ include_inactive: false }),
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<LossFormData>()

  const mutation = useMutation({
    mutationFn: (data: LossFormData) =>
      createStockLoss({
        product_id: data.product_id,
        qty: parseFloat(data.qty),
        reason: data.reason || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-losses'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      setModalOpen(false)
      reset()
      setApiError('')
    },
    onError: (err) => setApiError(getApiError(err)),
  })

  const openModal = () => { reset(); setApiError(''); setModalOpen(true) }

  // stock summary helpers
  const today = new Date()
  const lowStock = products.filter((p: Product) => p.is_active && p.stock < 5)
  const expiringSoon = products.filter((p: Product) => {
    if (!p.expiry_date) return false
    const days = Math.ceil((new Date(p.expiry_date).getTime() - today.getTime()) / 86400000)
    return days <= 7
  })
  const expired = expiringSoon.filter((p: Product) => {
    const days = Math.ceil((new Date(p.expiry_date!).getTime() - today.getTime()) / 86400000)
    return days < 0
  })

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Estoque</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Controle de perdas e validade</p>
        </div>
        <Button onClick={openModal} className="w-full sm:w-auto">
          <PlusIcon className="w-4 h-4" />
          Registrar Perda
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-start gap-3">
          <div className="w-9 h-9 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center shrink-0">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">Estoque baixo</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{lowStock.length}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">produtos com menos de 5 unidades</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-start gap-3">
          <div className="w-9 h-9 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center shrink-0">
            <ClockIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">Vencendo em 7 dias</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{expiringSoon.length}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{expired.length > 0 ? `${expired.length} já vencido(s)` : 'nenhum vencido'}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-start gap-3">
          <div className="w-9 h-9 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-slate-600 dark:text-slate-300 font-bold text-sm">{losses.length}</span>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">Total de perdas</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{losses.length}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">registros no sistema</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 mb-4">
        {(['losses', 'stock'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t
                ? 'border-green-600 text-green-700 dark:text-green-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            ].join(' ')}
          >
            {t === 'losses' ? 'Perdas registradas' : 'Alertas de estoque'}
          </button>
        ))}
      </div>

      {tab === 'losses' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {loadingLosses ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : losses.length === 0 ? (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500">
              <p>Nenhuma perda registrada</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Produto</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Qtd.</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Motivo</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Operador</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {losses.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{l.product_name}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-red-600 dark:text-red-400 font-semibold">
                        -{Number(l.qty).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {formatUnit(l.unit_type)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{l.reason ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{l.created_by_name}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(l.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'stock' && (
        <div className="space-y-4">
          {expiringSoon.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Vencendo em até 7 dias</h2>
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Produto</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Estoque</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Validade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {expiringSoon.map((p: Product) => {
                      const days = Math.ceil((new Date(p.expiry_date!).getTime() - today.getTime()) / 86400000)
                      return (
                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{p.name}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                            {Number(p.stock).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {formatUnit(p.unit_type)}
                          </td>
                          <td className="px-4 py-3">
                            {days < 0
                              ? <Badge variant="red">Vencido ({p.expiry_date})</Badge>
                              : days === 0
                                ? <Badge variant="red">Vence hoje</Badge>
                                : <Badge variant={days <= 3 ? 'red' : 'amber'}>{p.expiry_date} ({days}d)</Badge>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {lowStock.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Estoque baixo (menos de 5)</h2>
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Produto</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Categoria</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Estoque</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {lowStock.map((p: Product) => (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{p.name}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{p.category ?? '—'}</td>
                        <td className="px-4 py-3 text-right">
                          {p.stock <= 0
                            ? <Badge variant="red">Zerado</Badge>
                            : <Badge variant="amber">{Number(p.stock).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {formatUnit(p.unit_type)}</Badge>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {expiringSoon.length === 0 && lowStock.length === 0 && (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500">
              <p>Nenhum alerta de estoque no momento</p>
            </div>
          )}
        </div>
      )}

      {/* Register Loss Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Registrar Perda">
        <form onSubmit={handleSubmit((data) => { setApiError(''); mutation.mutate(data) })} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Produto *</label>
            <select
              {...register('product_id', { required: 'Selecione um produto' })}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value="">Selecionar produto...</option>
              {products.map((p: Product) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.barcode ? ` [${p.barcode}]` : ''} — {Number(p.stock).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {formatUnit(p.unit_type)}
                </option>
              ))}
            </select>
            {errors.product_id && <p className="text-xs text-red-600 mt-1">{errors.product_id.message}</p>}
          </div>

          <Input
            label="Quantidade perdida *"
            type="number"
            step="0.001"
            min="0.001"
            placeholder="0"
            error={errors.qty?.message}
            {...register('qty', { required: 'Quantidade obrigatória', min: { value: 0.001, message: 'Deve ser maior que zero' } })}
          />

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Motivo</label>
            <textarea
              {...register('reason')}
              rows={3}
              placeholder="Ex: produto vencido, avaria, etc."
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 resize-none"
            />
          </div>

          {apiError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
              <p className="text-sm text-red-700 dark:text-red-400">{apiError}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" className="flex-1" loading={mutation.isPending}>
              Registrar perda
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
