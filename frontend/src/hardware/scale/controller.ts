import { MAX_READING_AGE_MS, waitForStableWeight, type CaptureResult, type WaitOptions } from './reading'
import type { ScaleReading, ScaleStatus, ScaleTransport, TransportEvent } from './types'

export interface ScaleSnapshot {
  status: ScaleStatus
  message: string | null
  reading: ScaleReading | null
  /** true = conectada, mas sem nenhum dado há mais de 2 s (cabo solto entre a balança e o adaptador, balança desligada). */
  stale: boolean
}

type Listener = () => void
type EventListener = (event: TransportEvent) => void

const INITIAL: ScaleSnapshot = { status: 'disconnected', message: null, reading: null, stale: false }

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
  private staleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly now: () => number = Date.now,
    private readonly staleAfterMs: number = MAX_READING_AGE_MS,
  ) {}

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
    this.clearWatchdog()
    this.transport = transport
    if (previous && previous !== transport) void previous.disconnect().catch(() => undefined)
    this.update({ status, message, reading: null, stale: false })
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
      const connected = event.status === 'connected'
      if (connected) this.armWatchdog()
      else this.clearWatchdog()
      this.update({
        status: event.status,
        message: event.message ?? null,
        reading: connected ? this.snapshot.reading : null,
        stale: false,
      })
    } else if (event.type === 'reading') {
      this.armWatchdog()
      this.update({ reading: event.reading, stale: false })
    }
    this.eventListeners.forEach((listener) => listener(event))
  }

  /** Cada leitura (ou a conexão) reinicia o relógio; se ele estourar, a balança está "sem sinal". */
  private armWatchdog(): void {
    this.clearWatchdog()
    this.staleTimer = setTimeout(() => {
      this.staleTimer = null
      this.update({ stale: true })
    }, this.staleAfterMs)
  }

  private clearWatchdog(): void {
    if (this.staleTimer) clearTimeout(this.staleTimer)
    this.staleTimer = null
  }

  private update(patch: Partial<ScaleSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((listener) => listener())
  }
}
