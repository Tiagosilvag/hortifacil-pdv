import { NavLink } from 'react-router-dom'
import {
  HomeIcon,
  ShoppingCartIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
  ArchiveBoxIcon,
  BanknotesIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useAuthStore } from '@/stores/auth'
import type { ModuleKey } from '@/types'

interface NavItem {
  to: string
  icon: React.ElementType
  label: string
  exact: boolean
  module?: ModuleKey
  adminOnly?: boolean
  highlight?: boolean
}

const navItems: NavItem[] = [
  { to: '/', icon: HomeIcon, label: 'Dashboard', exact: true, module: 'dashboard' },
  { to: '/orders/new', icon: ShoppingCartIcon, label: 'Novo Pedido', exact: true, module: 'new_order', highlight: true },
  { to: '/orders', icon: ClipboardDocumentListIcon, label: 'Pedidos', exact: true, module: 'orders' },
  { to: '/receivables', icon: BanknotesIcon, label: 'Fiado', exact: true, module: 'receivables' },
  { to: '/customers', icon: UsersIcon, label: 'Clientes', exact: true, module: 'customers' },
  { to: '/products', icon: ArchiveBoxIcon, label: 'Produtos', exact: true, module: 'products' },
  { to: '/reports', icon: ChartBarIcon, label: 'Relatórios', exact: true, module: 'reports' },
]

interface Props {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: Props) {
  const canAccess = useAuthStore((s) => s.canAccess)
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  const visible = navItems.filter((item) => !item.module || canAccess(item.module))

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 w-64 shrink-0 bg-green-900 dark:bg-[#061710] flex flex-col h-full',
          'transform transition-transform duration-200 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
          'lg:static lg:z-auto lg:w-56 lg:translate-x-0',
        ].join(' ')}
      >
        <div className="px-5 py-5 border-b border-green-800 dark:border-[#0c2718] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-green-400 dark:bg-green-800 rounded-lg flex items-center justify-center">
              <span className="text-green-900 dark:text-green-200 font-bold text-sm">H</span>
            </div>
            <div>
              <p className="text-green-50 font-semibold text-sm leading-tight">HortiFácil</p>
              <p className="text-green-400 dark:text-green-600 text-xs">PDV</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-green-300 hover:bg-green-800 hover:text-white lg:hidden"
            aria-label="Fechar menu"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
          {visible.map(({ to, icon: Icon, label, exact, highlight }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              onClick={onClose}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-green-700 dark:bg-[#0c2718] text-white'
                    : 'text-green-200 dark:text-green-500 hover:bg-green-800 dark:hover:bg-[#0c2718] hover:text-white dark:hover:text-green-200',
                  highlight && !isActive ? 'mt-2 border border-green-600 dark:border-green-900 text-green-100 dark:text-green-500' : '',
                ].join(' ')
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 pb-3 flex flex-col gap-0.5">
          {isAdmin && (
            <NavLink
              to="/settings"
              onClick={onClose}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'bg-green-700 dark:bg-[#0c2718] text-white' : 'text-green-300 dark:text-green-600 hover:bg-green-800 dark:hover:bg-[#0c2718] hover:text-white dark:hover:text-green-200',
                ].join(' ')
              }
            >
              <Cog6ToothIcon className="w-5 h-5 shrink-0" />
              Configurações
            </NavLink>
          )}
          <div className="px-3 py-2">
            <p className="text-green-500 dark:text-green-800 text-xs text-center">v1.0 — Fase 1</p>
          </div>
        </div>
      </aside>
    </>
  )
}
