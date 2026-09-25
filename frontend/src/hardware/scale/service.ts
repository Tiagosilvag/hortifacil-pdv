import { useScaleSettings } from '@/stores/scale'
import { ScaleController } from './controller'
import { FakeScaleTransport } from './fakeScale'
import { getModel, type ScaleModel, type ScaleModelId } from './models'
import { getBrowserSerial, WebSerialTransport, type SerialLike, type SerialPortInfo } from './webSerial'

/** Instâncias únicas do caixa: o controlador que o PDV lê e a balança simulada (desenvolvimento). */
export const scaleController = new ScaleController()
export const fakeScale = new FakeScaleTransport()

export interface ScaleSettingsState {
  modelId: ScaleModelId | null
  enabled: boolean
  portInfo: SerialPortInfo | null
}

export interface ScaleServiceDeps {
  controller: ScaleController
  fake: FakeScaleTransport
  getSerial: () => SerialLike | null
  findModel: (id: ScaleModelId | null) => ScaleModel | null
  onPortSelected?: (info: SerialPortInfo) => void
}

/**
 * Escolhe e liga o transporte de acordo com a configuração do caixa.
 * Devolve o transporte Web Serial criado (para quem precisar soltá-lo) ou null.
 */
export function applyScaleSettings(state: ScaleSettingsState, deps: ScaleServiceDeps): WebSerialTransport | null {
  const { controller, fake, getSerial, findModel, onPortSelected } = deps

  if (!state.enabled || state.modelId === null) {
    controller.setTransport(null)
    return null
  }
  const model = findModel(state.modelId)
  if (!model) {
    controller.setTransport(null, 'disconnected', 'Modelo de balança desconhecido.')
    return null
  }
  if (model.simulated) {
    controller.setTransport(fake)
    void controller.connect()
    return null
  }
  if (!model.driver) {
    controller.setTransport(null, 'disconnected', 'O suporte a este modelo ainda não está disponível.')
    return null
  }
  const serial = getSerial()
  if (!serial) {
    controller.setTransport(null, 'unsupported', 'Este navegador não lê a balança. Use o Chrome ou o Edge.')
    return null
  }
  const transport = new WebSerialTransport({
    serial,
    settings: model.driver.serial,
    driver: model.driver,
    portFilter: state.portInfo,
    onPortSelected,
  })
  controller.setTransport(transport)
  void controller.connect(false) // só reabre uma porta já autorizada; a primeira vez exige o clique do operador
  return transport
}

/** Liga o serviço à configuração persistida. Chamar uma vez, na inicialização do app; devolve a função que desliga. */
export function startScaleService(): () => void {
  let transport: WebSerialTransport | null = null

  const apply = () => {
    transport?.dispose()
    transport = applyScaleSettings(useScaleSettings.getState(), {
      controller: scaleController,
      fake: fakeScale,
      getSerial: getBrowserSerial,
      findModel: getModel,
      onPortSelected: (info) => useScaleSettings.getState().setPortInfo(info),
    })
  }

  apply()
  const unsubscribe = useScaleSettings.subscribe((state, previous) => {
    // A porta guardada muda sozinha ao conectar; só reagimos a troca de modelo ou de liga/desliga.
    if (state.modelId !== previous.modelId || state.enabled !== previous.enabled) apply()
  })

  return () => {
    unsubscribe()
    transport?.dispose()
    void scaleController.disconnect()
  }
}
