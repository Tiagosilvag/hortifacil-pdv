import { Button } from '@/components/ui/Button'
import { useScaleSettings } from '@/stores/scale'
import { useScale } from './useScale'

const kg = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

/** Faixa no topo do PDV com o estado da balança. Não aparece se este caixa não tem balança configurada. */
export function ScaleIndicator() {
  const scale = useScale()
  const setEnabled = useScaleSettings((s) => s.setEnabled)

  if (scale.modelId === null) return null

  let text: string
  let tone: 'ok' | 'warn' | 'muted' = 'muted'
  if (!scale.enabled) {
    text = 'Balança desligada. Digite a quantidade dos itens em kg.'
  } else if (scale.status === 'connected') {
    const reading = scale.reading
    text = reading
      ? `Balança: ${kg.format(reading.weightKg)} kg${reading.stable ? '' : ' (oscilando)'}`
      : 'Balança conectada, aguardando leitura...'
    tone = 'ok'
  } else if (scale.status === 'connecting') {
    text = 'Conectando à balança...'
  } else {
    text = scale.message ?? 'Balança desconectada. Digite a quantidade dos itens em kg.'
    tone = 'warn'
  }

  const toneClass = {
    ok: 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300',
    warn: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
    muted: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  }[tone]

  const canConnect = scale.enabled && (scale.status === 'disconnected' || scale.status === 'error')

  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${toneClass}`}>
      <span className="font-medium tabular-nums">{text}</span>
      <div className="flex shrink-0 gap-2">
        {canConnect && (
          <Button size="sm" variant="secondary" onClick={() => void scale.connect()}>
            Conectar
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setEnabled(!scale.enabled)}>
          {scale.enabled ? 'Desligar' : 'Ligar'}
        </Button>
      </div>
    </div>
  )
}
