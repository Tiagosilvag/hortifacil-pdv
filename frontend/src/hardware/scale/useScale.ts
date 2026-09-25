import { useSyncExternalStore } from 'react'
import { useScaleSettings } from '@/stores/scale'
import { scaleController } from './service'

/** Estado da balança deste caixa para os componentes. */
export function useScale() {
  const snapshot = useSyncExternalStore(scaleController.subscribe, scaleController.getSnapshot)
  const modelId = useScaleSettings((s) => s.modelId)
  const enabled = useScaleSettings((s) => s.enabled)

  return {
    ...snapshot,
    modelId,
    enabled,
    /** true = o peso da balança pode ser usado na venda agora. */
    available: enabled && modelId !== null && snapshot.status === 'connected',
    /** Só chamar a partir de um clique do operador (a primeira autorização da porta exige isso). */
    connect: () => scaleController.connect(true),
    disconnect: () => scaleController.disconnect(),
    captureStable: () => scaleController.captureStable(),
  }
}
