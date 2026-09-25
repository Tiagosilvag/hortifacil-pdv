import { Button } from '@/components/ui/Button'
import { useState } from 'react'
import { isModelUsable, selectableModels, type ScaleModelId } from '@/hardware/scale/models'
import { ScaleDiagnostic } from '@/hardware/scale/ScaleDiagnostic'
import { fakeScale } from '@/hardware/scale/service'
import { useScale } from '@/hardware/scale/useScale'
import { useScaleSettings } from '@/stores/scale'

const kg = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

/** Aba "Balança" das Configurações: a configuração vale só para este computador/navegador. */
export function ScaleTab() {
  const scale = useScale()
  const { modelId, enabled, setModel, setEnabled } = useScaleSettings()
  const [simWeight, setSimWeight] = useState(0)
  const [simStable, setSimStable] = useState(true)
  const models = selectableModels(import.meta.env.DEV)

  const changeSim = (weight: number, stable: boolean) => {
    setSimWeight(weight)
    setSimStable(stable)
    fakeScale.setWeight(weight, stable)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Balança deste caixa</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Esta configuração vale só para este computador e este navegador (Chrome ou Edge). Cada caixa tem a sua.
        </p>

        <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Modelo
          <select
            value={modelId ?? ''}
            onChange={(e) => setModel(e.target.value === '' ? null : (e.target.value as ScaleModelId))}
            className="mt-1 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          >
            <option value="">Nenhuma (digitar o peso)</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}{isModelUsable(model) ? '' : ' (em breve)'}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Usar a balança nas vendas deste caixa
        </label>

        {modelId !== null && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => void scale.connect()} disabled={!enabled || scale.status === 'connected' || scale.status === 'connecting'}>
              Conectar balança
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void scale.disconnect()} disabled={scale.status !== 'connected'}>
              Desconectar
            </Button>
            <span className="text-sm text-slate-600 dark:text-slate-300">
              {scale.status === 'connected' && scale.reading
                ? `Lendo: ${kg.format(scale.reading.weightKg)} kg (${scale.reading.stable ? 'estável' : 'oscilando'})`
                : scale.message ?? (scale.status === 'connected' ? 'Conectada' : 'Desconectada')}
            </span>
          </div>
        )}

        {modelId === 'simulated' && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/40">
            <label className="block text-sm text-slate-700 dark:text-slate-300">
              Peso simulado: <span className="font-mono tabular-nums">{kg.format(simWeight)} kg</span>
              <input type="range" min={0} max={15} step={0.005} value={simWeight}
                onChange={(e) => changeSim(Number(e.target.value), simStable)} className="mt-1 w-full" />
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={simStable} onChange={(e) => changeSim(simWeight, e.target.checked)} />
              Peso estável
            </label>
          </div>
        )}
      </div>

      <ScaleDiagnostic disabled={scale.status === 'connected'} />
    </div>
  )
}
