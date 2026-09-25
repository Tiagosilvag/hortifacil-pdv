import type { ScaleDriver, SerialSettings } from './types'

export type ScaleModelId = 'toledo-prix-3-plus' | 'urano-us-pop-s' | 'simulated'

export interface ScaleModel {
  id: ScaleModelId
  label: string
  /** null = protocolo ainda não implementado (depende da captura em bancada). */
  driver: ScaleDriver | null
  simulated?: boolean
}

/** Os drivers de Toledo e Urano entram depois da captura com as balanças reais (plano B1b). */
export const SCALE_MODELS: ScaleModel[] = [
  { id: 'toledo-prix-3-plus', label: 'Toledo Prix 3 Plus', driver: null },
  { id: 'urano-us-pop-s', label: 'Urano US 15/5 POP-S', driver: null },
  { id: 'simulated', label: 'Balança simulada (teste)', driver: null, simulated: true },
]

export function getModel(id: ScaleModelId | null): ScaleModel | null {
  return SCALE_MODELS.find((model) => model.id === id) ?? null
}

/** A balança simulada só aparece em desenvolvimento. */
export function selectableModels(isDev: boolean): ScaleModel[] {
  return SCALE_MODELS.filter((model) => !model.simulated || isDev)
}

/** true = dá para usar o modelo na venda (tem driver ou é a simulada). */
export function isModelUsable(model: ScaleModel): boolean {
  return model.driver !== null || model.simulated === true
}

export const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]

export interface SerialPreset {
  id: string
  label: string
  settings: SerialSettings
}

/** Pontos de partida para a captura em bancada; os valores da Toledo ainda precisam ser confirmados. */
export const SERIAL_PRESETS: SerialPreset[] = [
  { id: 'urano', label: 'Urano POP-S (9600, 8, 2 stop, sem paridade)', settings: { baudRate: 9600, dataBits: 8, stopBits: 2, parity: 'none' } },
  { id: 'toledo', label: 'Toledo Prix (2400, 8, 1 stop, sem paridade; a confirmar)', settings: { baudRate: 2400, dataBits: 8, stopBits: 1, parity: 'none' } },
]
