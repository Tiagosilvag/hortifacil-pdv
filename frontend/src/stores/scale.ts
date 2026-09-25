import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ScaleModelId } from '@/hardware/scale/models'
import type { SerialPortInfo } from '@/hardware/scale/webSerial'

/** Configuração da balança deste caixa. Fica no navegador (não vai para o banco). */
interface ScaleSettingsStore {
  modelId: ScaleModelId | null
  enabled: boolean
  portInfo: SerialPortInfo | null
  setModel: (modelId: ScaleModelId | null) => void
  setEnabled: (enabled: boolean) => void
  setPortInfo: (portInfo: SerialPortInfo | null) => void
}

export const useScaleSettings = create<ScaleSettingsStore>()(
  persist(
    (set) => ({
      modelId: null,
      enabled: true,
      portInfo: null,
      // Outro modelo pode usar outra porta: esquece a porta guardada.
      setModel: (modelId) => set({ modelId, portInfo: null }),
      setEnabled: (enabled) => set({ enabled }),
      setPortInfo: (portInfo) => set({ portInfo }),
    }),
    { name: 'pdv-scale' },
  ),
)
