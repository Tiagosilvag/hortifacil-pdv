import { useNavigate } from 'react-router-dom'
import { ArrowRightOnRectangleIcon, UserCircleIcon } from '@heroicons/react/24/outline'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/Button'

export default function Header() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="h-14 shrink-0 bg-white border-b border-slate-200 flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <UserCircleIcon className="w-5 h-5 text-slate-400" />
          <span className="font-medium">{user?.name}</span>
          {user?.role === 'admin' && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              Admin
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5">
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          Sair
        </Button>
      </div>
    </header>
  )
}
