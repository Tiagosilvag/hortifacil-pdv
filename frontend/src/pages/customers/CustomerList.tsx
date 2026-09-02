import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  EyeIcon,
  XMarkIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import { listCustomers, updateCustomer } from '@/api/customers'
import { formatCurrency, formatCustomerType } from '@/utils/format'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import CustomerForm from './CustomerForm'
import type { Customer, CustomerType } from '@/types'

type StatusFilter = '' | 'active' | 'blocked' | 'inactive'

function creditBar(due: number, limit: number) {
  if (limit <= 0) return null
  const pct = Math.min((due / limit) * 100, 100)
  const color = pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-400' : 'bg-green-500'
  return (
    <div className="mt-1 h-1.5 w-20 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function CustomerList() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<CustomerType | ''>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)

  const { data: allCustomers = [], isPending } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => listCustomers({ search: search || undefined, include_inactive: true }),
  })

  const customers = allCustomers.filter((c) => {
    if (typeFilter && c.customer_type !== typeFilter) return false
    if (statusFilter === 'active' && (!c.is_active || c.is_blocked)) return false
    if (statusFilter === 'blocked' && !c.is_blocked) return false
    if (statusFilter === 'inactive' && c.is_active) return false
    return true
  })

  const toggleActive = useMutation({
    mutationFn: (c: Customer) => updateCustomer(c.id, { is_active: !c.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })

  const openNew = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (c: Customer) => { setEditing(c); setModalOpen(true) }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Clientes</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {customers.length} de {allCustomers.length} cliente{allCustomers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={openNew}>
          <PlusIcon className="w-4 h-4" />
          Novo Cliente
        </Button>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as CustomerType | '')}
          className="text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
        >
          <option value="">Todos os tipos</option>
          <option value="counter">Balcão</option>
          <option value="external">Externo</option>
          <option value="hotel">Hotel</option>
          <option value="inn">Pousada</option>
          <option value="wholesale">Atacado</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
        >
          <option value="">Todos os status</option>
          <option value="active">Ativos</option>
          <option value="blocked">Bloqueados</option>
          <option value="inactive">Inativos</option>
        </select>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {isPending ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-12 text-slate-400 dark:text-slate-500">
            <p>Nenhum cliente encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Telefone</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Fiado / Limite</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {customers.map((c) => (
                  <tr key={c.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${!c.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{c.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatCustomerType(c.customer_type)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end">
                        <span className={`tabular-nums font-semibold ${c.balance_due > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
                          {formatCurrency(c.balance_due)}
                          {c.credit_limit > 0 && (
                            <span className="font-normal text-slate-400 dark:text-slate-500"> / {formatCurrency(c.credit_limit)}</span>
                          )}
                        </span>
                        {creditBar(c.balance_due, c.credit_limit)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {c.is_blocked && <Badge variant="red">Bloqueado</Badge>}
                        {!c.is_active && <Badge variant="slate">Inativo</Badge>}
                        {c.is_active && !c.is_blocked && <Badge variant="green">Ativo</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => navigate(`/customers/${c.id}`)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                          title="Ver histórico"
                        >
                          <EyeIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                          title="Editar"
                        >
                          <PencilSquareIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleActive.mutate(c)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            c.is_active
                              ? 'text-red-300 dark:text-red-900 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 dark:hover:text-red-400'
                              : 'text-green-300 dark:text-green-900 hover:bg-green-50 dark:hover:bg-green-900/30 hover:text-green-600 dark:hover:text-green-400'
                          }`}
                          title={c.is_active ? 'Desativar cliente' : 'Ativar cliente'}
                        >
                          {c.is_active ? <XMarkIcon className="w-4 h-4" /> : <CheckIcon className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CustomerForm
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        customer={editing}
      />
    </div>
  )
}
