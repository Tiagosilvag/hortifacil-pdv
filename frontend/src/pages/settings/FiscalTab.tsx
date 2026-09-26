import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteFiscalDefault,
  getFiscalSettings,
  getFiscalStatus,
  listFiscalDefaults,
  listPendingProducts,
  saveFiscalDefault,
  saveFiscalSettings,
} from '@/api/fiscal'
import { listCategories } from '@/api/categories'
import { getApiError } from '@/api/client'
import { FiscalFieldsForm } from '@/components/fiscal/FiscalFieldsForm'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { FiscalDefault, FiscalSettings } from '@/types/fiscal'
import { cleanValidationMessage, digitsOnly, fiscalFormDefaults, fiscalPayload, summarizeDefault, type FiscalFormValues } from '@/utils/fiscal'

const cardClass = 'rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800'

interface CompanyForm {
  enabled: boolean
  environment: 'homologacao' | 'producao'
  regime: 'normal' | 'simples'
  series: string
  legal_name: string
  cnpj: string
  ie: string
  street: string
  number: string
  district: string
  city: string
  city_ibge: string
  state: string
  zip_code: string
}

function companyDefaults(s: FiscalSettings): CompanyForm {
  return {
    enabled: s.enabled,
    environment: s.environment,
    regime: s.regime,
    series: String(s.series),
    legal_name: s.legal_name ?? '',
    cnpj: s.cnpj ?? '',
    ie: s.ie ?? '',
    street: s.street ?? '',
    number: s.number ?? '',
    district: s.district ?? '',
    city: s.city ?? '',
    city_ibge: s.city_ibge ?? '',
    state: s.state ?? '',
    zip_code: s.zip_code ?? '',
  }
}

function CompanyCard({ settings }: { settings: FiscalSettings }) {
  const qc = useQueryClient()
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const { register, handleSubmit } = useForm<CompanyForm>({ defaultValues: companyDefaults(settings) })

  const save = useMutation({
    mutationFn: (v: CompanyForm) =>
      saveFiscalSettings({
        enabled: v.enabled,
        environment: v.environment,
        regime: v.regime,
        series: Number(v.series) || 1,
        legal_name: v.legal_name.trim() || null,
        cnpj: digitsOnly(v.cnpj) || null,
        ie: digitsOnly(v.ie) || null,
        street: v.street.trim() || null,
        number: v.number.trim() || null,
        district: v.district.trim() || null,
        city: v.city.trim() || null,
        city_ibge: digitsOnly(v.city_ibge) || null,
        state: v.state.trim().toUpperCase() || null,
        zip_code: digitsOnly(v.zip_code) || null,
      }),
    onSuccess: () => {
      setMessage({ kind: 'ok', text: 'Dados fiscais salvos.' })
      qc.invalidateQueries({ queryKey: ['fiscal'] })
    },
    onError: (err) => setMessage({ kind: 'error', text: cleanValidationMessage(getApiError(err)) }),
  })

  return (
    <form
      onSubmit={handleSubmit((v) => {
        setMessage(null)
        save.mutate(v)
      })}
      className={cardClass}
    >
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">Empresa emitente</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Dados que saem na NFC-e. Para ligar a emissão, todos precisam estar preenchidos.
      </p>

      <label className="mt-4 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input type="checkbox" {...register('enabled')} />
        Emitir NFC-e nos pedidos
      </label>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Select label="Ambiente" {...register('environment')}>
          <option value="homologacao">Homologação (teste, sem valor fiscal)</option>
          <option value="producao">Produção</option>
        </Select>
        <Select label="Regime tributário" {...register('regime')}>
          <option value="normal">Normal</option>
          <option value="simples">Simples Nacional (ainda não suportado)</option>
        </Select>
        <Input label="Série da NFC-e" type="number" min="1" {...register('series')} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Razão social" {...register('legal_name')} />
        <Input label="CNPJ" placeholder="14 dígitos" inputMode="numeric" {...register('cnpj')} />
        <Input label="Inscrição estadual" inputMode="numeric" {...register('ie')} />
        <Input label="CEP" placeholder="8 dígitos" inputMode="numeric" {...register('zip_code')} />
        <Input label="Rua" {...register('street')} />
        <Input label="Número" {...register('number')} />
        <Input label="Bairro" {...register('district')} />
        <Input label="Município" {...register('city')} />
        <Input label="Código IBGE do município" placeholder="7 dígitos" inputMode="numeric" {...register('city_ibge')} />
        <Input label="UF" maxLength={2} placeholder="PE" {...register('state')} />
      </div>

      {message && (
        <p
          role="status"
          className={`mt-4 text-sm ${message.kind === 'ok' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-5">
        <Button type="submit" size="sm" loading={save.isPending}>
          Salvar dados fiscais
        </Button>
      </div>
    </form>
  )
}

function DefaultModal({
  category,
  existing,
  onClose,
}: {
  category: string
  existing: FiscalDefault | undefined
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const { register, handleSubmit } = useForm<FiscalFormValues>({ defaultValues: fiscalFormDefaults(existing) })

  const save = useMutation({
    mutationFn: (v: FiscalFormValues) => saveFiscalDefault(category, fiscalPayload(v)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fiscal'] })
      onClose()
    },
    onError: (err) => setError(cleanValidationMessage(getApiError(err))),
  })

  return (
    <Modal open onClose={onClose} title={`Padrão fiscal: ${category}`} maxWidth="max-w-2xl">
      <form
        onSubmit={handleSubmit((v) => {
          setError('')
          save.mutate(v)
        })}
        className="flex flex-col gap-4"
      >
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Vale para todos os produtos desta categoria que não tiverem o campo preenchido no próprio cadastro.
        </p>
        <FiscalFieldsForm register={register} />
        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" className="flex-1" loading={save.isPending}>
            Salvar padrão
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function DefaultsCard() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)
  const { data: categories = [] } = useQuery({ queryKey: ['categories', 'all'], queryFn: () => listCategories(false) })
  const { data: defaults = [] } = useQuery({ queryKey: ['fiscal', 'defaults'], queryFn: listFiscalDefaults })
  const { data: pending = [] } = useQuery({ queryKey: ['fiscal', 'pending'], queryFn: listPendingProducts })
  const byCategory = new Map(defaults.map((d) => [d.category, d]))

  const remove = useMutation({
    mutationFn: (id: string) => deleteFiscalDefault(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fiscal'] }),
  })

  return (
    <div className={cardClass}>
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">Padrão fiscal por categoria</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Os códigos vêm do seu contador. Cada produto herda o padrão da categoria e pode ter valores próprios no cadastro.
      </p>

      {pending.length > 0 && (
        <p className="mt-3 text-sm text-amber-800 dark:text-amber-300">
          {pending.length} produto{pending.length !== 1 ? 's' : ''} ainda sem dados fiscais completos (contando o padrão da categoria).
          Eles não emitem NFC-e até serem completados.
        </p>
      )}

      {categories.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Cadastre categorias na aba Categorias primeiro.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-700">
          {categories.map((c) => {
            const existing = byCategory.get(c.name)
            const summary = summarizeDefault(existing)
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{c.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{summary || 'Sem padrão definido'}</p>
                </div>
                <div className="flex gap-3 text-sm">
                  <button className="text-green-700 hover:underline dark:text-green-400" onClick={() => setEditing(c.name)}>
                    {existing ? 'Editar' : 'Definir'}
                  </button>
                  {existing && (
                    <button
                      className="text-red-600 hover:underline dark:text-red-400"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(existing.id)}
                    >
                      Remover
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {editing && <DefaultModal key={editing} category={editing} existing={byCategory.get(editing)} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** Aba "Fiscal" das Configurações (só administrador): dados da empresa e padrão fiscal por categoria. */
export function FiscalTab() {
  const { data: status } = useQuery({ queryKey: ['fiscal', 'status'], queryFn: getFiscalStatus })
  const { data: settings, isPending } = useQuery({ queryKey: ['fiscal', 'settings'], queryFn: getFiscalSettings })

  return (
    <div className="flex flex-col gap-5">
      {settings?.enabled && settings.environment === 'homologacao' && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          <strong>Ambiente de homologação:</strong> as notas emitidas não têm valor fiscal.
        </div>
      )}
      {status && !status.provider_configured && (
        <div role="alert" className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Este servidor ainda não tem provedor fiscal configurado. Mesmo com a emissão ligada aqui, nenhuma nota é emitida.
        </div>
      )}

      {isPending || !settings ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : (
        <CompanyCard key={settings.updated_at ?? 'novo'} settings={settings} />
      )}
      <DefaultsCard />
    </div>
  )
}
