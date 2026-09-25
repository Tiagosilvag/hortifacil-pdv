import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScaleController } from './controller'
import type { ScaleReading, ScaleTransport, TransportEvent, TransportListener } from './types'

/** Transporte manual: só emite o que o teste manda. Simula um cabo RS-232 solto: o adaptador USB continua "conectado". */
class ManualTransport implements ScaleTransport {
  private listeners = new Set<TransportListener>()
  subscribe(listener: TransportListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  async connect() { this.emit({ type: 'status', status: 'connected' }) }
  async disconnect() { this.emit({ type: 'status', status: 'disconnected' }) }
  send(weightKg: number, stable = true) {
    const reading: ScaleReading = { weightKg, stable, at: Date.now() }
    this.emit({ type: 'reading', reading })
  }
  private emit(event: TransportEvent) { this.listeners.forEach((l) => l(event)) }
}

describe('ScaleController: leitura velha (cabo solto, adaptador conectado)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const setup = () => {
    const controller = new ScaleController()
    const transport = new ManualTransport()
    controller.setTransport(transport)
    return { controller, transport }
  }

  it('recebendo leituras, nunca fica velha', async () => {
    const { controller, transport } = setup()
    await controller.connect()
    for (let i = 0; i < 5; i += 1) {
      transport.send(1.5)
      vi.advanceTimersByTime(1000)
    }
    expect(controller.getSnapshot().stale).toBe(false)
  })

  it('sem nenhuma leitura por mais de 2 s depois de conectar, marca "sem sinal"', async () => {
    const { controller } = setup()
    await controller.connect()
    expect(controller.getSnapshot().stale).toBe(false)
    vi.advanceTimersByTime(2100)
    expect(controller.getSnapshot().stale).toBe(true)
    expect(controller.getSnapshot().status).toBe('connected')
  })

  it('a balança para de mandar: o último peso fica marcado como velho, e uma leitura nova volta ao normal', async () => {
    const { controller, transport } = setup()
    await controller.connect()
    transport.send(2)
    vi.advanceTimersByTime(1900)
    expect(controller.getSnapshot().stale).toBe(false)
    vi.advanceTimersByTime(300)
    expect(controller.getSnapshot().stale).toBe(true)
    expect(await controller.captureStable()).toMatchObject({ ok: false })

    transport.send(2)
    expect(controller.getSnapshot().stale).toBe(false)
  })

  it('desconectar limpa o alarme: não fica "sem sinal" depois', async () => {
    const { controller, transport } = setup()
    await controller.connect()
    transport.send(1)
    await controller.disconnect()
    vi.advanceTimersByTime(5000)
    expect(controller.getSnapshot()).toEqual({ status: 'disconnected', message: null, reading: null, stale: false })
  })

  it('trocar de transporte limpa o alarme', async () => {
    const { controller } = setup()
    await controller.connect()
    controller.setTransport(null)
    vi.advanceTimersByTime(5000)
    expect(controller.getSnapshot().stale).toBe(false)
  })
})
