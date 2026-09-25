import { roundKg } from './reading'
import type { ScaleTransport, TransportEvent, TransportListener } from './types'

/** Balança simulada: um transporte que gera leituras a partir de `setWeight`. Serve para desenvolver e demonstrar o PDV sem hardware. */
export class FakeScaleTransport implements ScaleTransport {
  private listeners = new Set<TransportListener>()
  private timer: ReturnType<typeof setInterval> | null = null
  private weightKg = 0
  private stable = true

  constructor(
    private readonly intervalMs = 200,
    private readonly now: () => number = Date.now,
  ) {}

  subscribe(listener: TransportListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async connect(): Promise<void> {
    if (this.timer) return
    this.emit({ type: 'status', status: 'connected' })
    this.timer = setInterval(() => this.emitReading(), this.intervalMs)
    this.emitReading()
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.emit({ type: 'status', status: 'disconnected' })
  }

  setWeight(weightKg: number, stable = true): void {
    this.weightKg = roundKg(weightKg)
    this.stable = stable
    if (this.timer) this.emitReading()
  }

  private emitReading(): void {
    this.emit({ type: 'reading', reading: { weightKg: this.weightKg, stable: this.stable, at: this.now() } })
  }

  private emit(event: TransportEvent): void {
    this.listeners.forEach((listener) => listener(event))
  }
}
