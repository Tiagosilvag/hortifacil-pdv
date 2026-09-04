import { useNavigate } from 'react-router-dom'
import {
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { Button } from '@/components/ui/Button'
import type { Theme } from '@/stores/theme'

const THEME_CYCLE: Record<Theme, Theme> = {
  system: 'dark',
  dark: 'light',
  light: 'system',
}

const THEME_ICONS: Record<Theme, React.ElementType> = {
  system: ComputerDesktopIcon,
  dark: MoonIcon,
  light: SunIcon,
}

const THEME_LABELS: Record<Theme, string> = {
  system: 'Sistema',
  dark: 'Escuro',
  light: 'Claro',
}

interface Props {
  onMenuClick: () => void
}

export default function Header({ onMenuClick }: Props) {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { theme, setTheme } = useThemeStore()

  const ThemeIcon = THEME_ICONS[theme]

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="h-14 shrink-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 sm:px-6">
      <button
        onClick={onMenuClick}
        className="p-1.5 -ml-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 lg:hidden"
        aria-label="Abrir menu"
      >
        <Bars3Icon className="w-6 h-6" />
      </button>
      <div className="flex items-center gap-1 sm:gap-2 ml-auto">
        <button
          onClick={() => setTheme(THEME_CYCLE[theme])}
          title={`Tema: ${THEME_LABELS[theme]}`}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          <ThemeIcon className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <UserCircleIcon className="w-5 h-5 text-slate-400 dark:text-slate-500 hidden sm:block" />
          <span className="font-medium max-w-[8rem] sm:max-w-none truncate">{user?.name}</span>
          {user?.role === 'admin' && (
            <span className="text-xs bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full font-medium hidden sm:inline">
              Admin
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5">
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Sair</span>
        </Button>
      </div>
    </header>
  )
}
