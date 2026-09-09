import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import { listProducts, updateProduct } from '@/api/products'
import { formatCurrency, formatUnit } from '@/utils/format'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
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
  if (field !== sortField) {
    return <ChevronUpIcon className="w-3 h-3 opacity-20" />
  }
  return sortDir === 'asc'
    ? <ChevronUpIcon className="w-3 h-3 text-green-600 dark:text-green-400" />
    : <ChevronDownIcon className="w-3 h-3 text-green-600 dark:text-green-400" />
}

export default function ProductList() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [page, setPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

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

  const openNew = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (p: Product) => { setEditing(p); setModalOpen(true) }

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
    setPage(1)
  }

  const handleSearch = (v: string) => {
    setSearch(v)
    setPage(1)
  }

  const thClass = "text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide"
  const thSortClass = `${thClass} cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200`

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Produtos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{products.length} cadastrado{products.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openNew} className="w-full sm:w-auto">
          <PlusIcon className="w-4 h-4" />
          Novo Produto
        </Button>
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
                    <th
                      className={`${thSortClass} flex items-center gap-1`}
                      onClick={() => handleSort('code')}
                    >
                      Cód. <SortIcon field="code" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      className={thSortClass}
                      onClick={() => handleSort('name')}
                    >
                      <span className="flex items-center gap-1">
                        Produto <SortIcon field="name" sortField={sortField} sortDir={sortDir} />
                      </span>
                    </th>
                    <th
                      className={thSortClass}
                      onClick={() => handleSort('category')}
                    >
                      <span className="flex items-center gap-1">
                        Categoria <SortIcon field="category" sortField={sortField} sortDir={sortDir} />
                      </span>
                    </th>
                    <th className={thClass}>Unidade</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Preço</th>
                    <th className={thClass}>Cód. Barras</th>
                    <th
                      className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200"
                      onClick={() => handleSort('stock')}
                    >
                      <span className="flex items-center gap-1 justify-end">
                        Estoque <SortIcon field="stock" sortField={sortField} sortDir={sortDir} />
                      </span>
                    </th>
                    <th className={thClass}>Validade</th>
                    <th className={thClass}>Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {paginated.map((p) => (
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
                          <button
                            onClick={() => openEdit(p)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                            title="Editar"
                          >
                            <PencilSquareIcon className="w-4 h-4" />
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
                  ))}
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

      <ProductForm
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        product={editing}
      />
    </div>
  )
}
