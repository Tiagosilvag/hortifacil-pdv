import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { listProducts, updateProduct, deleteProduct } from '@/api/products'
import { getApiError } from '@/api/client'
import { formatCurrency, formatUnit } from '@/utils/format'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useAuthStore } from '@/stores/auth'
import ProductForm from './ProductForm'
import type { Product } from '@/types'

const PAGE_SIZE = 10

type SortField = 'code' | 'name' | 'category' | 'stock'
type SortDir = 'asc' | 'desc'

function stockBadge(p: Product) {
  if (p.stock <= 0) return <Badge variant="red">Zerado</Badge>
  if (p.stock < 5) return <Badge variant="amber">{Number(p.stock).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</Badge>
  return <span className="text-sm tabular-nums text-slate-700 dark:text-slate-300">{Number(p.stock).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</span>
}

function expiryBadge(expiry: string | null) {
  if (!expiry) return <span className="text-slate-400 dark:text-slate-500">—</span>
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000)
  if (days < 0) return <Badge variant="red">Vencido</Badge>
  if (days <= 3) return <Badge variant="red">{expiry}</Badge>
  if (days <= 7) return <Badge variant="amber">{expiry}</Badge>
  return <span className="text-sm text-slate-600 dark:text-slate-400">{expiry}</span>
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <ChevronUpIcon className="w-3 h-3 opacity-20" />
  return sortDir === 'asc'
    ? <ChevronUpIcon className="w-3 h-3 text-green-600 dark:text-green-400" />
    : <ChevronDownIcon className="w-3 h-3 text-green-600 dark:text-green-400" />
}

export default function ProductList() {
  const qc = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const isAdmin = currentUser?.role === 'admin'
  const canCreateProducts = isAdmin || !!currentUser?.can_create_products
  const canEditProducts = isAdmin || !!currentUser?.can_edit_products

  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [page, setPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const { data: products = [], isPending } = useQuery({
    queryKey: ['products', search],
    queryFn: () => listProducts({ search: search || undefined, include_inactive: true }),
  })

  const sorted = useMemo(() => {
    return [...products].sort((a, b) => {
      let cmp = 0
      if (sortField === 'code') cmp = a.code - b.code
      else if (sortField === 'name') cmp = a.name.localeCompare(b.name, 'pt-BR')
      else if (sortField === 'category') cmp = (a.category ?? '').localeCompare(b.category ?? '', 'pt-BR')
      else if (sortField === 'stock') cmp = Number(a.stock) - Number(b.stock)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [products, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const toggleActive = useMutation({
    mutationFn: (p: Product) => updateProduct(p.id, { is_active: !p.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      setDeleteTarget(null)
      setDeleteError('')
    },
    onError: (err) => setDeleteError(getApiError(err)),
  })

  const openNew = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (p: Product) => { setEditing(p); setModalOpen(true) }

  const handleSort = (field: SortField) => {
    if (field === sortField) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
    setPage(1)
  }

  const handleSearch = (v: string) => { setSearch(v); setPage(1) }

  const thBase = "text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide"
  const thSort = `${thBase} cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200`

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Produtos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{products.length} cadastrado{products.length !== 1 ? 's' : ''}</p>
        </div>
        {canCreateProducts && (
          <Button onClick={openNew} className="w-full sm:w-auto">
            <PlusIcon className="w-4 h-4" />
            Novo Produto
          </Button>
        )}
      </div>

      <div className="relative mb-4">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar por nome, código do produto, código de barras ou categoria..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
        />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {isPending ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-slate-400 dark:text-slate-500">
            <p>Nenhum produto encontrado</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className={thSort} onClick={() => handleSort('code')}>
                      <span className="flex items-center gap-1">Cód. <SortIcon field="code" sortField={sortField} sortDir={sortDir} /></span>
                    </th>
                    <th className={thSort} onClick={() => handleSort('name')}>
                      <span className="flex items-center gap-1">Produto <SortIcon field="name" sortField={sortField} sortDir={sortDir} /></span>
                    </th>
                    <th className={thSort} onClick={() => handleSort('category')}>
                      <span className="flex items-center gap-1">Categoria <SortIcon field="category" sortField={sortField} sortDir={sortDir} /></span>
                    </th>
                    <th className={thBase}>Unidade</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Preço</th>
                    <th className={thBase}>Cód. Barras</th>
                    <th className={`${thSort} text-right`} onClick={() => handleSort('stock')}>
                      <span className="flex items-center gap-1 justify-end">Estoque <SortIcon field="stock" sortField={sortField} sortDir={sortDir} /></span>
                    </th>
                    <th className={thBase}>Validade</th>
                    <th className={thBase}>Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {paginated.map((p) => {
                    const canEdit = canEditProducts
                    const canDelete = !p.has_orders

                    const editTitle = !canEditProducts
                      ? 'Sem permissão para editar produtos'
                      : 'Editar'

                    const deleteTitle = p.has_orders
                      ? 'Produto com pedidos não pode ser excluído'
                      : 'Excluir'

                    return (
                      <tr key={p.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${!p.is_active ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-500 dark:text-slate-400">{String(p.code).padStart(3, '0')}</td>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{p.name}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{p.category ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatUnit(p.unit_type)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-green-700 dark:text-green-400">
                          {formatCurrency(p.price)}
                        </td>
                        <td className="px-4 py-3 text-slate-400 dark:text-slate-500 font-mono text-xs">{p.barcode ?? '—'}</td>
                        <td className="px-4 py-3 text-right">{stockBadge(p)}</td>
                        <td className="px-4 py-3">{expiryBadge(p.expiry_date)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={p.is_active ? 'green' : 'slate'}>
                            {p.is_active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            {isAdmin && (
                              <button
                                onClick={() => canEdit && openEdit(p)}
                                disabled={!canEdit}
                                title={editTitle}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  canEdit
                                    ? 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                    : 'text-slate-200 dark:text-slate-600 cursor-not-allowed'
                                }`}
                              >
                                <PencilSquareIcon className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => { if (canDelete) { setDeleteError(''); setDeleteTarget(p) } }}
                              disabled={!canDelete}
                              title={deleteTitle}
                              className={`p-1.5 rounded-lg transition-colors ${
                                canDelete
                                  ? 'text-red-300 dark:text-red-800 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 dark:hover:text-red-400'
                                  : 'text-slate-200 dark:text-slate-700 cursor-not-allowed'
                              }`}
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => toggleActive.mutate(p)}
                              className="text-xs px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                            >
                              {p.is_active ? 'Desativar' : 'Ativar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} de {sorted.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Anterior
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-7 h-7 text-xs rounded-lg transition-colors ${
                        p === page
                          ? 'bg-green-600 text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de confirmação de exclusão */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => { setDeleteTarget(null); setDeleteError('') }} />
          <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center shrink-0">
                <TrashIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Excluir produto</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
              Tem certeza que deseja excluir <span className="font-medium text-slate-900 dark:text-slate-100">{deleteTarget.name}</span>?
            </p>
            <p className="text-sm text-red-600 dark:text-red-400 mb-5">
              Esta ação é permanente e não pode ser desfeita.
            </p>
            {deleteError && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 mb-4">
                {deleteError}
              </p>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => { setDeleteTarget(null); setDeleteError('') }}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
              >
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}

      <ProductForm
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        product={editing}
      />
    </div>
  )
}
