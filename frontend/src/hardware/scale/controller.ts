import { waitForStableWeight, type CaptureResult, type WaitOptions } from './reading'
import type { ScaleReading, ScaleStatus, ScaleTransport, TransportEvent } from './types'

export interface ScaleSnapshot {
  status: ScaleStatus
  message: string | null
  reading: ScaleReading | null
}

type Listener = () => void
type EventListener = (event: TransportEvent) => void

const INITIAL: ScaleSnapshot = { status: 'disconnected', message: null, reading: null }

/**
 * Estado da balança do caixa, independente do React (o hook usa `subscribe`/`getSnapshot`).
 * Troca de transporte é segura: o anterior é desconectado e desassinado.
 */
export class ScaleController {
  private snapshot: ScaleSnapshot = INITIAL
  private listeners = new Set<Listener>()
  private eventListeners = new Set<EventListener>()
  private transport: ScaleTransport | null = null
  private unsubscribe: (() => void) | null = null

  constructor(private readonly now: () => number = Date.now) {}

  getSnapshot = (): ScaleSnapshot => this.snapshot

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Todos os eventos do transporte (inclusive bytes crus); usado pela área "Testar balança". */
  subscribeEvents(listener: EventListener): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  /** Define o transporte ativo. `status`/`message` descrevem o estado quando não há transporte. */
  setTransport(transport: ScaleTransport | null, status: ScaleStatus = 'disconnected', message: string | null = null): void {
    const previous = this.transport
    this.unsubscribe?.()
    this.unsubscribe = null
    this.transport = transport
    if (previous && previous !== transport) void previous.disconnect().catch(() => undefined)
    this.update({ status, message, reading: null })
    if (transport) this.unsubscribe = transport.subscribe((event) => this.handle(event))
  }

  async connect(interactive = false): Promise<void> {
    await this.transport?.connect(interactive)
  }

  async disconnect(): Promise<void> {
    await this.transport?.disconnect()
  }

  /** Peso estável para a venda: espera até 2 s e nunca devolve peso velho, zero ou instável. */
  captureStable(options: WaitOptions = {}): Promise<CaptureResult> {
    if (this.snapshot.status !== 'connected') {
      return Promise.resolve({ ok: false, reason: 'no-reading' })
    }
    return waitForStableWeight(() => this.snapshot.reading, { now: this.now, ...options })
  }

  private handle(event: TransportEvent): void {
    if (event.type === 'status') {
      this.update({
        status: event.status,
        message: event.message ?? null,
        reading: event.status === 'connected' ? this.snapshot.reading : null,
      })
    } else if (event.type === 'reading') {
      this.update({ reading: event.reading })
    }
    this.eventListeners.forEach((listener) => listener(event))
  }

  private update(patch: Partial<ScaleSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((listener) => listener())
  }
}
