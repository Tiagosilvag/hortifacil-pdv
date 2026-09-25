import { describe, expect, it } from 'vitest'
import { ScaleController } from './controller'
import { FakeScaleTransport } from './fakeScale'
import type { ScaleModel } from './models'
import { applyScaleSettings, type ScaleServiceDeps } from './service'
import { FakePort, FakeSerial, flush, testDriver } from './testing'

const withDriver: ScaleModel = { id: 'toledo-prix-3-plus', label: 'Com driver', driver: testDriver() }
const withoutDriver: ScaleModel = { id: 'urano-us-pop-s', label: 'Sem driver', driver: null }
const simulated: ScaleModel = { id: 'simulated', label: 'Simulada', driver: null, simulated: true }

function setup(serial: FakeSerial | null) {
  const controller = new ScaleController()
  const fake = new FakeScaleTransport(50)
  const models = [withDriver, withoutDriver, simulated]
  const deps: ScaleServiceDeps = {
    controller,
    fake,
    getSerial: () => serial,
    findModel: (id) => models.find((m) => m.id === id) ?? null,
  }
  return { controller, fake, deps }
}

const state = (modelId: ScaleModel['id'] | null, enabled = true) => ({ modelId, enabled, portInfo: null })

describe('applyScaleSettings', () => {
  it('sem modelo escolhido: nada conectado', () => {
    const { controller, deps } = setup(new FakeSerial())
    expect(applyScaleSettings(state(null), deps)).toBeNull()
    expect(controller.getSnapshot().status).toBe('disconnected')
  })

  it('desligada pelo operador: nada conectado, mesmo com modelo', () => {
    const { controller, deps } = setup(new FakeSerial([new FakePort()]))
    expect(applyScaleSettings(state('toledo-prix-3-plus', false), deps)).toBeNull()
    expect(controller.getSnapshot().status).toBe('disconnected')
  })

  it('modelo sem driver: avisa que ainda não há suporte e não tenta conectar', () => {
    const { controller, deps } = setup(new FakeSerial())
    expect(applyScaleSettings(state('urano-us-pop-s'), deps)).toBeNull()
    expect(controller.getSnapshot()).toMatchObject({ status: 'disconnected' })
    expect(controller.getSnapshot().message).toContain('ainda não está disponível')
  })

  it('navegador sem Web Serial: status "unsupported" com mensagem', () => {
    const { controller, deps } = setup(null)
    expect(applyScaleSettings(state('toledo-prix-3-plus'), deps)).toBeNull()
    expect(controller.getSnapshot().status).toBe('unsupported')
    expect(controller.getSnapshot().message).toContain('Chrome')
  })

  it('balança simulada: conecta na hora', async () => {
    const { controller, fake, deps } = setup(null)
    applyScaleSettings(state('simulated'), deps)
    await flush()
    fake.setWeight(1.5)
    expect(controller.getSnapshot().status).toBe('connected')
    expect(await controller.captureStable()).toEqual({ ok: true, weightKg: 1.5 })
    await controller.disconnect()
  })

  it('modelo com driver e porta já autorizada: conecta sozinho, sem clique', async () => {
    const port = new FakePort()
    const { controller, deps } = setup(new FakeSerial([port]))
    const transport = applyScaleSettings(state('toledo-prix-3-plus'), deps)
    await flush()
    expect(transport).not.toBeNull()
    expect(port.opened).toBe(1)
    expect(controller.getSnapshot().status).toBe('connected')
    port.push('1.250;S\n')
    await flush()
    expect(controller.getSnapshot().reading?.weightKg).toBe(1.25)
    await controller.disconnect()
    transport?.dispose()
  })

  it('modelo com driver e nenhuma porta autorizada: fica desconectada até o operador clicar em Conectar', async () => {
    const port = new FakePort()
    const serial = new FakeSerial([], port)
    const { controller, deps } = setup(serial)
    const transport = applyScaleSettings(state('toledo-prix-3-plus'), deps)
    await flush()
    expect(controller.getSnapshot().status).toBe('disconnected')
    await controller.connect(true) // clique do operador
    expect(controller.getSnapshot().status).toBe('connected')
    await controller.disconnect()
    transport?.dispose()
  })

  it('trocar de modelo desconecta o transporte anterior', async () => {
    const port = new FakePort()
    const { controller, deps } = setup(new FakeSerial([port]))
    const transport = applyScaleSettings(state('toledo-prix-3-plus'), deps)
    await flush()
    transport?.dispose()
    applyScaleSettings(state('urano-us-pop-s'), deps)
    await flush()
    expect(port.closed).toBe(1)
    expect(controller.getSnapshot().status).toBe('disconnected')
  })
})
