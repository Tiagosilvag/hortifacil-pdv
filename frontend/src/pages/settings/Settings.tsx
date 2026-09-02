import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Cog6ToothIcon,
  PlusIcon,
  PencilIcon,
  XMarkIcon,
  CheckIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import { listUsers, createUser, updateUser } from '@/api/users'
import { getApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { ALL_MODULES, MODULE_LABELS } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import type { ModuleKey, User } from '@/types'
import { formatDate } from '@/utils/format'

interface UserFormData {
  name: string
  email: string
  password: string
  passwordConfirm: string
  role: 'admin' | 'operator'
  allowed_modules: ModuleKey[] | null
}

const emptyForm: UserFormData = {
  name: '',
  email: '',
  password: '',
  passwordConfirm: '',
  role: 'operator',
  allowed_modules: null,
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function ModuleCheckboxes({
  value,
  onChange,
  disabled,
}: {
  value: ModuleKey[] | null
  onChange: (v: ModuleKey[] | null) => void
  disabled?: boolean
}) {
  const allSelected = value === null
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={allSelected}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? null : [])}
          className="rounded border-slate-300 dark:border-slate-600 text-green-600 focus:ring-green-500"
        />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Todos os módulos</span>
      </label>
      {!allSelected && (
        <div className="ml-4 grid grid-cols-2 gap-1.5">
          {ALL_MODULES.map((mod) => (
            <label key={mod} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                disabled={disabled}
                checked={(value ?? []).includes(mod)}
                onChange={(e) => {
                  const current = value ?? []
                  onChange(
                    e.target.checked
                      ? [...current, mod]
                      : current.filter((m) => m !== mod)
                  )
                }}
                className="rounded border-slate-300 dark:border-slate-600 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm text-slate-600 dark:text-slate-400">{MODULE_LABELS[mod]}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function UserFormModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const qc = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const isEdit = !!user

  const [form, setForm] = useState<UserFormData>(
    user
      ? { name: user.name, email: user.email, password: '', passwordConfirm: '', role: user.role, allowed_modules: user.allowed_modules }
      : emptyForm
  )
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: isEdit
      ? (data: UserFormData) =>
          updateUser(user!.id, {
            name: data.name,
            role: data.role,
            allowed_modules: data.role === 'admin' ? null : data.allowed_modules,
            ...(data.password ? { password: data.password } : {}),
          })
      : (data: UserFormData) =>
          createUser({
            name: data.name,
            email: data.email,
            password: data.password,
            role: data.role,
            allowed_modules: data.role === 'admin' ? null : data.allowed_modules,
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      onClose()
    },
    onError: (err) => setError(getApiError(err)),
  })

  const set = (field: keyof UserFormData, value: unknown) =>
    setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = () => {
    if (!form.name.trim()) { setError('Nome obrigatório'); return }
    if (form.name.trim().length < 2) { setError('Nome deve ter ao menos 2 caracteres'); return }

    if (!isEdit) {
      if (!form.email.trim()) { setError('E-mail obrigatório'); return }
      if (!EMAIL_RE.test(form.email)) { setError('E-mail inválido'); return }
      if (!form.password) { setError('Senha obrigatória'); return }
    }

    if (form.password) {
      if (form.password.length < 6) { setError('Senha deve ter ao menos 6 caracteres'); return }
      if (form.password !== form.passwordConfirm) { setError('As senhas não conferem'); return }
    }

    setError('')
    mutation.mutate(form)
  }

  const showPasswordConfirm = !!form.password || !isEdit

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 w-full max-w-md flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">
            {isEdit ? 'Editar usuário' : 'Novo usuário'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <Input
          label="Nome"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Nome completo"
        />

        {!isEdit ? (
          <Input
            label="E-mail"
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="usuario@email.com"
          />
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">E-mail</label>
            <p className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-600">
              {user!.email}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">O e-mail não pode ser alterado após o cadastro.</p>
          </div>
        )}

        <Input
          label={isEdit ? 'Nova senha (deixe em branco para manter)' : 'Senha'}
          type="password"
          value={form.password}
          onChange={(e) => set('password', e.target.value)}
          placeholder="Mínimo 6 caracteres"
          hint={isEdit ? undefined : 'Mínimo 6 caracteres'}
        />

        {showPasswordConfirm && (
          <Input
            label={isEdit ? 'Confirmar nova senha' : 'Confirmar senha'}
            type="password"
            value={form.passwordConfirm}
            onChange={(e) => set('passwordConfirm', e.target.value)}
            placeholder="Repita a senha"
          />
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Perfil</label>
          <div className="flex gap-3">
            {(['operator', 'admin'] as const).map((r) => (
              <button
                key={r}
                type="button"
                disabled={isEdit && user?.id === currentUser?.id}
                onClick={() => set('role', r)}
                className={[
                  'flex-1 py-2 text-sm rounded-lg border font-medium transition-colors',
                  form.role === r
                    ? r === 'admin'
                      ? 'bg-purple-600 border-purple-600 text-white'
                      : 'bg-green-600 border-green-600 text-white'
                    : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600',
                ].join(' ')}
              >
                {r === 'admin' ? 'Admin' : 'Operador'}
              </button>
            ))}
          </div>
          {form.role === 'admin' && (
            <p className="text-xs text-purple-600 dark:text-purple-400 mt-1.5">Admin tem acesso total a todos os módulos.</p>
          )}
        </div>

        {form.role === 'operator' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Módulos permitidos</label>
            <ModuleCheckboxes
              value={form.allowed_modules}
              onChange={(v) => set('allowed_modules', v)}
            />
            {form.allowed_modules !== null && form.allowed_modules.length === 0 && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-1.5">Atenção: sem nenhum módulo selecionado, o usuário não poderá acessar nada.</p>
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="flex-1" loading={mutation.isPending} onClick={handleSubmit}>
            {isEdit ? 'Salvar' : 'Criar usuário'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function Settings() {
  const currentUser = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const [modalUser, setModalUser] = useState<User | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [userSearch, setUserSearch] = useState('')

  const { data: users = [], isPending } = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
  })

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  )

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateUser(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const openCreate = () => { setModalUser(null); setShowModal(true) }
  const openEdit = (u: User) => { setModalUser(u); setShowModal(true) }
  const closeModal = () => setShowModal(false)

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Cog6ToothIcon className="w-6 h-6 text-slate-600 dark:text-slate-400" />
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Configurações</h1>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Usuários do sistema</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button onClick={openCreate} size="sm">
            <PlusIcon className="w-4 h-4 mr-1.5" />
            Novo usuário
          </Button>
        </div>

        {users.length > 3 && (
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Buscar usuário por nome ou e-mail..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
          </div>
        )}

        {isPending ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {filteredUsers.length === 0 && (
              <div className="text-center py-10 text-slate-400 dark:text-slate-500 text-sm">
                Nenhum usuário encontrado
              </div>
            )}
            {filteredUsers.map((u) => {
              const isMe = u.id === currentUser?.id
              return (
                <div key={u.id} className={`px-5 py-4 flex items-start justify-between gap-4 ${!u.is_active ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{u.name}</span>
                      {isMe && <Badge variant="green">Você</Badge>}
                      {!u.is_active && <Badge variant="slate">Inativo</Badge>}
                      <Badge variant={u.role === 'admin' ? 'blue' : 'slate'}>
                        {u.role === 'admin' ? 'Admin' : 'Operador'}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{u.email}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {u.role === 'admin' || u.allowed_modules === null ? (
                        <span className="text-xs text-slate-400 dark:text-slate-500">Acesso total</span>
                      ) : u.allowed_modules.length === 0 ? (
                        <span className="text-xs text-red-500 dark:text-red-400 font-medium">Sem acesso a módulos</span>
                      ) : (
                        u.allowed_modules.map((m) => (
                          <span key={m} className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded px-1.5 py-0.5">
                            {MODULE_LABELS[m]}
                          </span>
                        ))
                      )}
                    </div>
                    {u.last_login && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Último acesso: {formatDate(u.last_login)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(u)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      title="Editar"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    {!isMe && (
                      <button
                        onClick={() => toggleActive.mutate({ id: u.id, is_active: !u.is_active })}
                        className={`p-1.5 rounded-lg transition-colors ${
                          u.is_active
                            ? 'text-red-300 dark:text-red-900 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 dark:hover:text-red-400'
                            : 'text-green-300 dark:text-green-900 hover:bg-green-50 dark:hover:bg-green-900/30 hover:text-green-600 dark:hover:text-green-400'
                        }`}
                        title={u.is_active ? 'Desativar' : 'Ativar'}
                      >
                        {u.is_active ? <XMarkIcon className="w-4 h-4" /> : <CheckIcon className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showModal && (
        <UserFormModal user={modalUser} onClose={closeModal} />
      )}
    </div>
  )
}
