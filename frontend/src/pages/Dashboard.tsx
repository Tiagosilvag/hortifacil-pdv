import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  BanknotesIcon,
  ShoppingCartIcon,
  UsersIcon,
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { getDashboard } from '@/api/dashboard'
import { formatCurrency } from '@/utils/format'
import { Button } from '@/components/ui/Button'

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex gap-4 items-start">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{value}</p>
        {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { data, isPending } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    refetchInterval: 60_000,
  })

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Resumo do dia</p>
        </div>
        <Link to="/orders/new">
          <Button size="md">
            <PlusIcon className="w-4 h-4" />
            Novo Pedido
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Vendas hoje"
          value={formatCurrency(data?.today_sales_total ?? 0)}
          sub={`${data?.today_sales_count ?? 0} pedido${(data?.today_sales_count ?? 0) !== 1 ? 's' : ''}`}
          icon={ShoppingCartIcon}
          color="bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400"
        />
        <StatCard
          label="Fiado em aberto"
          value={formatCurrency(data?.open_receivables_total ?? 0)}
          sub={`${data?.open_receivables_count ?? 0} conta${(data?.open_receivables_count ?? 0) !== 1 ? 's' : ''}`}
          icon={BanknotesIcon}
          color="bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
        />
        <StatCard
          label="Últimos 7 dias"
          value={formatCurrency(data?.last_7_days_total ?? 0)}
          icon={ArrowTrendingUpIcon}
          color="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
        />
        <StatCard
          label="Clientes bloqueados"
          value={String(data?.blocked_customers_count ?? 0)}
          icon={UsersIcon}
          color={
            (data?.blocked_customers_count ?? 0) > 0
              ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
              : 'bg-slate-50 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
          }
        />
        <StatCard
          label="Fiado vencido"
          value={String(data?.overdue_receivables_count ?? 0)}
          sub="contas em atraso"
          icon={ExclamationTriangleIcon}
          color={
            (data?.overdue_receivables_count ?? 0) > 0
              ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
              : 'bg-slate-50 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
          }
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          to="/orders/new"
          className="bg-green-600 hover:bg-green-700 text-white rounded-xl p-5 flex items-center gap-3 transition-colors"
        >
          <ShoppingCartIcon className="w-6 h-6" />
          <div>
            <p className="font-semibold">Novo Pedido</p>
            <p className="text-green-200 text-xs">Registrar venda</p>
          </div>
        </Link>
        <Link
          to="/receivables"
          className="bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex items-center gap-3 transition-colors"
        >
          <BanknotesIcon className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">Cobranças</p>
            <p className="text-slate-400 dark:text-slate-500 text-xs">Registrar pagamento</p>
          </div>
        </Link>
        <Link
          to="/customers"
          className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex items-center gap-3 transition-colors"
        >
          <UsersIcon className="w-6 h-6 text-slate-500 dark:text-slate-400" />
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">Clientes</p>
            <p className="text-slate-400 dark:text-slate-500 text-xs">Gerenciar clientes</p>
          </div>
        </Link>
      </div>
    </div>
  )
}
