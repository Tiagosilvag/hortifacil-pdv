import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteCertificate,
  deleteCsc,
  deleteFiscalDefault,
  getFiscalSecrets,
  getFiscalSettings,
  getFiscalStatus,
  listFiscalDefaults,
  listPendingProducts,
  retryPendingNfce,
  saveCsc,
  saveFiscalDefault,
  saveFiscalSettings,
  uploadCertificate,
} from '@/api/fiscal'
import { listCategories } from '@/api/categories'
import { getApiError } from '@/api/client'
import { FiscalFieldsForm } from '@/components/fiscal/FiscalFieldsForm'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { FiscalDefault, FiscalEnvironment, FiscalMode, FiscalSecrets, FiscalSettings } from '@/types/fiscal'
import {
  certificateFileProblem,
  certificateSummary,
  certificateVariant,
  cleanValidationMessage,
  digitsOnly,
  fiscalFormDefaults,
  fiscalPayload,
  isProductionWord,
  modeNotice,
  modeOptions,
  summarizeDefault,
  type FiscalFormValues,
} from '@/utils/fiscal'
import { formatDate } from '@/utils/format'

const cardClass = 'rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800'

interface CompanyForm {
  enabled: boolean
  environment: 'homologacao' | 'producao'
  regime: 'normal' | 'simples'
  mode: FiscalMode
  series: string
  cancel_window_minutes: string
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
    mode: s.mode,
    series: String(s.series),
    cancel_window_minutes: String(s.cancel_window_minutes),
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

type Message = { kind: 'ok' | 'error'; text: string } | null

// A mensagem mora no FiscalTab: depois de salvar, o `updated_at` muda e este cartão remonta (o que apagaria um estado local).
function CompanyCard({ settings, message, setMessage }: { settings: FiscalSettings; message: Message; setMessage: (m: Message) => void }) {
  const qc = useQueryClient()
  const { register, handleSubmit, watch } = useForm<CompanyForm>({ defaultValues: companyDefaults(settings) })
  const { data: status } = useQuery({ queryKey: ['fiscal', 'status'], queryFn: getFiscalStatus })
  const mode = watch('mode')
  const notice = modeNotice(mode, status?.mode === mode && status.mode_available)
  // Passar de homologação para produção pede uma confirmação: guarda o formulário enquanto o modal está aberto.
  const [productionValues, setProductionValues] = useState<CompanyForm | null>(null)

  const save = useMutation({
    mutationFn: ({ values: v, confirmed }: { values: CompanyForm; confirmed: boolean }) =>
      saveFiscalSettings({
        enabled: v.enabled,
        environment: v.environment,
        regime: v.regime,
        mode: v.mode,
        series: Number(v.series) || 1,
        // Vazio deixa o servidor usar o padrão (30); 0 ou fora da faixa o servidor recusa com a mensagem certa.
        cancel_window_minutes: v.cancel_window_minutes.trim() === '' ? undefined : Number(v.cancel_window_minutes),
        production_confirmation: confirmed,
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
        if (v.environment === 'producao' && settings.environment !== 'producao') setProductionValues(v)
        else save.mutate({ values: v, confirmed: false })
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

      <div className="mt-4">
        <Select label="Modo de emissão" {...register('mode')}>
          {modeOptions(settings.mode, import.meta.env.DEV).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        {notice && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{notice}</p>}
      </div>

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
        <Input
          label="Prazo para cancelar a NFC-e (minutos)"
          type="number"
          min="1"
          max="1440"
          hint="Confirme com o contador: 30 minutos ou 24 horas (1440), conforme o estado."
          {...register('cancel_window_minutes')}
        />
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

      {productionValues && (
        <ProductionModal
          onCancel={() => setProductionValues(null)}
          onConfirm={() => {
            save.mutate({ values: productionValues, confirmed: true })
            setProductionValues(null)
          }}
        />
      )}
    </form>
  )
}

/** Confirmação para passar de homologação para produção: as notas passam a valer de verdade. */
function ProductionModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const [word, setWord] = useState('')
  const [accountant, setAccountant] = useState(false)
  const ready = isProductionWord(word) && accountant

  return (
    <Modal open onClose={onCancel} title="Ir para produção">
      <div className="flex flex-col gap-4 text-sm text-slate-700 dark:text-slate-300">
        <p>
          Em produção, cada nota emitida <strong>vale como nota fiscal de verdade</strong> e o cancelamento tem prazo. O sistema só
          libera se: o modo de emissão for real (SEFAZ direto) e estiver pronto, com o certificado digital da empresa dentro da
          validade e o CSC de produção cadastrados, houver ao menos uma venda de teste autorizada em homologação e a emissão
          estiver ligada com todos os dados da empresa. Se algo faltar, ele diz o quê.
        </p>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={accountant} onChange={(e) => setAccountant(e.target.checked)} className="mt-1" />
          <span>O contador validou o cupom emitido em homologação.</span>
        </label>
        {/* O modal fica dentro do <form> da empresa: Enter aqui não pode reenviar o formulário. */}
        <Input
          label='Digite "PRODUÇÃO" para confirmar'
          value={word}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
          }}
          autoComplete="off"
        />
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" variant="danger" className="flex-1" disabled={!ready} onClick={onConfirm}>
            Ir para produção
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Um CSC (ID e código gerados na SEFAZ) de um ambiente. O código nunca volta do servidor: só "cadastrado, ID 1". */
function CscRow({
  environment,
  label,
  status,
  disabled,
  onDone,
  onError,
}: {
  environment: FiscalEnvironment
  label: string
  status: FiscalSecrets['csc_hml']
  disabled: boolean
  onDone: (text: string) => void
  onError: (err: unknown) => void
}) {
  const [id, setId] = useState('')
  const [token, setToken] = useState('')
  const save = useMutation({
    mutationFn: () => saveCsc(environment, id, token),
    onSuccess: () => {
      setId('')
      setToken('')
      onDone(`${label} guardado.`)
    },
    onError,
  })
  const remove = useMutation({ mutationFn: () => deleteCsc(environment), onSuccess: () => onDone(`${label} removido.`), onError })

  return (
    <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</h3>
        {status.configured ? <Badge variant="green">Cadastrado (ID {status.id})</Badge> : <Badge variant="slate">Não cadastrado</Badge>}
        {status.configured && (
          <button
            className="text-sm text-red-600 hover:underline dark:text-red-400"
            aria-label={`Remover ${label}`}
            disabled={remove.isPending}
            onClick={() => window.confirm(`Remover o ${label}? A emissão nesse ambiente para de funcionar até cadastrar de novo.`) && remove.mutate()}
          >
            Remover
          </button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr_auto]">
        <Input id={`csc-${environment}-id`} label="ID do CSC" placeholder="Ex.: 1" inputMode="numeric" value={id} onChange={(e) => setId(e.target.value)} />
        <Input
          id={`csc-${environment}-token`}
          label="Código do CSC"
          type="password"
          autoComplete="new-password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <div className="flex items-end">
          <Button size="sm" variant="secondary" disabled={disabled || !id || !token} loading={save.isPending} onClick={() => save.mutate()}>
            {status.configured ? 'Trocar' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Cofre do modo direto: certificado digital A1 e CSC. Tudo é cifrado no servidor e nada secreto volta para esta tela. */
function SecretsCard() {
  const qc = useQueryClient()
  const { data: secrets, isError } = useQuery({ queryKey: ['fiscal', 'secrets'], queryFn: getFiscalSecrets })
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [fileKey, setFileKey] = useState(0)
  const [message, setMessage] = useState<Message>(null)

  const done = (text: string) => {
    setMessage({ kind: 'ok', text })
    qc.invalidateQueries({ queryKey: ['fiscal'] })
  }
  const fail = (err: unknown) => setMessage({ kind: 'error', text: cleanValidationMessage(getApiError(err)) })

  const upload = useMutation({
    mutationFn: () => uploadCertificate(file!, password),
    onSuccess: () => {
      setPassword('')
      setFile(null)
      setFileKey((k) => k + 1) // limpa o campo do arquivo
      done('Certificado guardado.')
    },
    onError: fail,
  })
  const removeCertificate = useMutation({ mutationFn: deleteCertificate, onSuccess: () => done('Certificado removido.'), onError: fail })

  if (isError) {
    return (
      <div role="alert" className={`${cardClass} text-sm text-red-700 dark:text-red-400`}>
        Não foi possível ler o que está cadastrado no cofre de segredos. Recarregue a página; se continuar, veja o servidor.
      </div>
    )
  }
  if (!secrets) return null
  const fileProblem = certificateFileProblem(file)
  const locked = !secrets.vault_available
  const summary = certificateSummary(secrets.certificate)

  return (
    <div className={cardClass}>
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">Certificado digital e CSC (SEFAZ direto)</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Guardados cifrados no servidor. Depois de enviados, nada disto volta para esta tela: só o que é público (titular, vencimento, ID do CSC).
      </p>

      {locked && (
        <div role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200">
          O servidor não tem a <strong>chave mestra</strong> dos segredos, então não dá para guardar certificado nem CSC. No Coolify, crie a variável{' '}
          <code>FISCAL_SECRET_KEY</code> com o valor gerado por{' '}
          <code>python -c &quot;import secrets,base64;print(base64.b64encode(secrets.token_bytes(32)).decode())&quot;</code> e reinicie o app.
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Certificado A1</h3>
        {summary ? <Badge variant={certificateVariant(secrets.certificate.level)}>{summary}</Badge> : <Badge variant="slate">Nenhum certificado cadastrado</Badge>}
        {secrets.certificate.configured && (
          <button
            className="text-sm text-red-600 hover:underline dark:text-red-400"
            aria-label="Remover certificado digital"
            disabled={removeCertificate.isPending}
            onClick={() =>
              window.confirm('Remover o certificado digital? A emissão pelo modo direto para de funcionar até cadastrar um novo.') && removeCertificate.mutate()
            }
          >
            Remover
          </button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div className="flex flex-col gap-1">
          <label htmlFor="certificate-file" className="text-sm font-medium text-slate-700 dark:text-slate-300">Arquivo do certificado (.pfx)</label>
          <input
            key={fileKey}
            id="certificate-file"
            type="file"
            accept=".pfx,.p12"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-slate-700 dark:text-slate-300"
          />
        </div>
        <Input label="Senha do certificado" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="flex items-end">
          <Button size="sm" variant="secondary" disabled={locked || !file || !password || !!fileProblem} loading={upload.isPending} onClick={() => upload.mutate()}>
            {secrets.certificate.configured ? 'Trocar' : 'Enviar'}
          </Button>
        </div>
      </div>

      {fileProblem && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {fileProblem}
        </p>
      )}

      <CscRow environment="homologacao" label="CSC de homologação" status={secrets.csc_hml} disabled={locked} onDone={done} onError={fail} />
      <CscRow environment="producao" label="CSC de produção" status={secrets.csc_prod} disabled={locked} onDone={done} onError={fail} />

      {message && (
        <p role="status" className={`mt-4 text-sm ${message.kind === 'ok' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}

/** Notas que ficaram pendentes por falha do provedor: o servidor reenvia sozinho; aqui dá para reenviar na hora. */
function PendingNotesCard() {
  const qc = useQueryClient()
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const retry = useMutation({
    mutationFn: retryPendingNfce,
    onSuccess: ({ attempted }) => {
      setMessage({ kind: 'ok', text: attempted === 0 ? 'Nenhuma nota pendente para reenviar.' : `${attempted} pedido${attempted !== 1 ? 's' : ''} reenviado${attempted !== 1 ? 's' : ''}.` })
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err) => setMessage({ kind: 'error', text: cleanValidationMessage(getApiError(err)) }),
  })

  return (
    <div className={cardClass}>
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">Notas pendentes</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Quando o provedor ou a SEFAZ ficam fora do ar, a venda fica salva e a nota pendente. O servidor reenvia sozinho, a cada poucos
        minutos, as pendentes das últimas 24 horas; aqui você pode reenviar agora.
      </p>
      {message && (
        <p role="status" className={`mt-3 text-sm ${message.kind === 'ok' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
          {message.text}
        </p>
      )}
      <div className="mt-4">
        <Button size="sm" variant="secondary" loading={retry.isPending} onClick={() => retry.mutate()}>
          Reenviar notas pendentes agora
        </Button>
      </div>
    </div>
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

  const [removeError, setRemoveError] = useState('')
  const remove = useMutation({
    mutationFn: (id: string) => deleteFiscalDefault(id),
    onSuccess: () => {
      setRemoveError('')
      qc.invalidateQueries({ queryKey: ['fiscal'] })
    },
    onError: (err) => setRemoveError(cleanValidationMessage(getApiError(err))),
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

      {removeError && <p className="mt-3 text-sm text-red-700 dark:text-red-400">{removeError}</p>}

      {editing && <DefaultModal key={editing} category={editing} existing={byCategory.get(editing)} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** Aba "Fiscal" das Configurações (só administrador): dados da empresa e padrão fiscal por categoria. */
export function FiscalTab() {
  const { data: status } = useQuery({ queryKey: ['fiscal', 'status'], queryFn: getFiscalStatus })
  const { data: settings, isPending } = useQuery({ queryKey: ['fiscal', 'settings'], queryFn: getFiscalSettings })
  const [companyMessage, setCompanyMessage] = useState<Message>(null)

  return (
    <div className="flex flex-col gap-5">
      {settings?.enabled && settings.environment === 'homologacao' && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200">
          <strong>Ambiente de homologação:</strong> as notas emitidas não têm valor fiscal.
        </div>
      )}
      {settings?.environment === 'producao' && (
        <div role="status" className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-900/20 dark:text-green-200">
          <strong>Ambiente de produção:</strong> as notas emitidas valem como nota fiscal de verdade.
          {settings.production_confirmed_by && settings.production_confirmed_at && (
            <> Confirmado por {settings.production_confirmed_by} em {formatDate(settings.production_confirmed_at)}.</>
          )}
        </div>
      )}
      {status && !status.provider_configured && status.mode !== 'none' && (
        <div role="alert" className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
          O modo de emissão escolhido ainda não emite notas neste servidor. Mesmo com a emissão ligada aqui, nenhuma nota é emitida.
        </div>
      )}

      {isPending || !settings ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : (
        <CompanyCard key={settings.updated_at ?? 'novo'} settings={settings} message={companyMessage} setMessage={setCompanyMessage} />
      )}
      {settings?.mode === 'sefaz_direto' && <SecretsCard />}
      <PendingNotesCard />
      <DefaultsCard />
    </div>
  )
}
