import { describe, expect, it } from 'vitest'
import { ScaleController } from './controller'
import { FakeScaleTransport } from './fakeScale'

function setup() {
  let t = 1000
  const now = () => t
  const controller = new ScaleController(now)
  const fake = new FakeScaleTransport(50, now)
  controller.setTransport(fake)
  return { controller, fake, advance: (ms: number) => { t += ms } }
}

describe('ScaleController', () => {
  it('começa desconectada e sem leitura', () => {
    const { controller } = setup()
    expect(controller.getSnapshot()).toEqual({ status: 'disconnected', message: null, reading: null, stale: false })
  })

  it('conecta, recebe o peso e devolve o peso estável', async () => {
    const { controller, fake } = setup()
    await controller.connect(true)
    fake.setWeight(1.2345)
    expect(controller.getSnapshot().status).toBe('connected')
    expect(await controller.captureStable()).toEqual({ ok: true, weightKg: 1.235 })
    await controller.disconnect()
  })

  it('não captura enquanto desconectada', async () => {
    const { controller, fake } = setup()
    fake.setWeight(2)
    expect(await controller.captureStable()).toEqual({ ok: false, reason: 'no-reading' })
  })

  it('balança vazia vira "empty"', async () => {
    const { controller, fake } = setup()
    await controller.connect()
    fake.setWeight(0)
    expect(await controller.captureStable()).toEqual({ ok: false, reason: 'empty' })
    await controller.disconnect()
  })

  it('espera o peso estabilizar dentro do prazo', async () => {
    const { controller, fake } = setup()
    await controller.connect()
    fake.setWeight(1.5, false)
    setTimeout(() => fake.setWeight(1.5, true), 120)
    const result = await controller.captureStable({ intervalMs: 20, timeoutMs: 1000 })
    expect(result).toEqual({ ok: true, weightKg: 1.5 })
    await controller.disconnect()
  })

  it('depois de desconectar, não captura mais e limpa a leitura', async () => {
    const { controller, fake } = setup()
    await controller.connect()
    fake.setWeight(1)
    await controller.disconnect()
    expect(controller.getSnapshot()).toEqual({ status: 'disconnected', message: null, reading: null, stale: false })
    expect(await controller.captureStable()).toEqual({ ok: false, reason: 'no-reading' })
  })

  it('leitura que ficou velha (o transporte parou de mandar) é recusada', async () => {
    const { controller, fake, advance } = setup()
    await controller.connect()
    fake.setWeight(1)
    await new Promise((resolve) => setTimeout(resolve, 0))
    advance(3000) // o relógio anda, mas nenhuma leitura nova chega
    expect(await controller.captureStable()).toEqual({ ok: false, reason: 'stale' })
    await controller.disconnect()
  })

  it('notifica quem assinou a cada mudança', async () => {
    const { controller, fake } = setup()
    let notifications = 0
    controller.subscribe(() => { notifications += 1 })
    await controller.connect()
    fake.setWeight(1)
    expect(notifications).toBeGreaterThanOrEqual(2)
    await controller.disconnect()
  })

  it('trocar de transporte desconecta o anterior e ignora os eventos dele', async () => {
    const { controller, fake } = setup()
    await controller.connect()
    const other = new FakeScaleTransport(50)
    controller.setTransport(other, 'disconnected', 'Outro modelo')
    expect(controller.getSnapshot()).toEqual({ status: 'disconnected', message: 'Outro modelo', reading: null, stale: false })
    fake.setWeight(9)
    expect(controller.getSnapshot().reading).toBeNull()
  })

  it('sem transporte, mantém o estado informado (ex.: navegador sem suporte)', () => {
    const controller = new ScaleController()
    controller.setTransport(null, 'unsupported', 'Use Chrome ou Edge')
    expect(controller.getSnapshot()).toEqual({ status: 'unsupported', message: 'Use Chrome ou Edge', reading: null, stale: false })
  })

  it('repassa os eventos crus para a área de diagnóstico', async () => {
    const { controller, fake } = setup()
    const seen: string[] = []
    controller.subscribeEvents((e) => seen.push(e.type))
    await controller.connect()
    fake.setWeight(1)
    expect(seen).toContain('status')
    expect(seen).toContain('reading')
    await controller.disconnect()
  })
})
