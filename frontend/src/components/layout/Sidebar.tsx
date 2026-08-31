import { NavLink } from 'react-router-dom'
import {
  HomeIcon,
  ShoppingCartIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
  ArchiveBoxIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline'

const nav = [
  { to: '/', icon: HomeIcon, label: 'Dashboard', exact: true },
  { to: '/orders/new', icon: ShoppingCartIcon, label: 'Novo Pedido', exact: true },
  { to: '/orders', icon: ClipboardDocumentListIcon, label: 'Pedidos', exact: true },
  { to: '/receivables', icon: BanknotesIcon, label: 'Fiado', exact: true },
  { to: '/customers', icon: UsersIcon, label: 'Clientes', exact: true },
  { to: '/products', icon: ArchiveBoxIcon, label: 'Produtos', exact: true },
]

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-green-900 flex flex-col h-full">
      <div className="px-5 py-5 border-b border-green-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-green-400 rounded-lg flex items-center justify-center">
            <span className="text-green-900 font-bold text-sm">H</span>
          </div>
          <div>
            <p className="text-green-50 font-semibold text-sm leading-tight">HortiFácil</p>
            <p className="text-green-400 text-xs">PDV</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        {nav.map(({ to, icon: Icon, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-green-700 text-white'
                  : 'text-green-200 hover:bg-green-800 hover:text-white',
                to === '/orders/new' && !isActive
                  ? 'mt-2 border border-green-600 text-green-100'
                  : '',
              ].join(' ')
            }
          >
            <Icon className="w-5 h-5 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-green-800">
        <p className="text-green-500 text-xs text-center">v1.0 — Fase 1</p>
      </div>
    </aside>
  )
}
