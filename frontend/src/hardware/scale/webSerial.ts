import { roundKg, StabilityFilter } from './reading'
import type {
  FrameParser,
  ScaleDriver,
  ScaleStatus,
  ScaleTransport,
  SerialSettings,
  TransportEvent,
  TransportListener,
} from './types'

/** Subconjunto da Web Serial API que usamos (evita depender de tipos externos e permite testar com portas falsas). */
export interface SerialPortInfo {
  usbVendorId?: number
  usbProductId?: number
}

export interface SerialPortLike {
  open(options: { baudRate: number; dataBits?: number; stopBits?: number; parity?: 'none' | 'even' | 'odd' }): Promise<void>
  close(): Promise<void>
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  getInfo(): SerialPortInfo
}

export interface SerialLike {
  getPorts(): Promise<SerialPortLike[]>
  requestPort(): Promise<SerialPortLike>
  addEventListener(type: 'connect' | 'disconnect', listener: () => void): void
  removeEventListener(type: 'connect' | 'disconnect', listener: () => void): void
}

export function getBrowserSerial(): SerialLike | null {
  if (typeof navigator === 'undefined') return null
  const serial = (navigator as unknown as { serial?: SerialLike }).serial
  return serial ?? null
}

/** Erros de leitura que a Web Serial API trata como recuperáveis: o `port.readable` é trocado e dá para continuar. */
const RECOVERABLE_READ_ERRORS = new Set(['FramingError', 'ParityError', 'BreakError', 'BufferOverrunError'])

/**
 * Operações de abrir e fechar a mesma porta rodam uma de cada vez, mesmo vindas de transportes diferentes
 * (o StrictMode do React, ou trocar de modelo no meio da conexão, criam um transporte novo enquanto o antigo ainda abre).
 */
const portQueue = new WeakMap<object, Promise<unknown>>()

function queued<T>(port: object, task: () => Promise<T>): Promise<T> {
  const tail = portQueue.get(port) ?? Promise.resolve()
  const run = tail.then(task)
  portQueue.set(port, run.catch(() => undefined))
  return run
}

/** Abre a porta. Se a tentativa ficou obsoleta enquanto abria (alguém chamou disconnect), fecha de volta e devolve false. */
function openPort(port: SerialPortLike, settings: SerialSettings, isStale: () => boolean): Promise<boolean> {
  return queued(port, async () => {
    const { baudRate, dataBits, stopBits, parity } = settings
    await port.open({ baudRate, dataBits, stopBits, parity })
    if (isStale()) {
      try {
        await port.close()
      } catch {
        // já fechada
      }
      return false
    }
    return true
  })
}

export interface WebSerialOptions {
  serial: SerialLike
  settings: SerialSettings
  /** Sem driver, o transporte só emite bytes crus (modo diagnóstico). */
  driver: ScaleDriver | null
  /** Porta já autorizada anteriormente (vendor/product), para reconectar sem perguntar. */
  portFilter?: SerialPortInfo | null
  onPortSelected?: (info: SerialPortInfo) => void
  now?: () => number
  stabilityRequired?: number
}

function friendlyError(error: unknown): string {
  const name = (error as { name?: string } | null)?.name
  if (name === 'InvalidStateError' || name === 'NetworkError') {
    return 'Não foi possível abrir a porta. Ela pode estar em uso por outra aba ou programa.'
  }
  if (name === 'SecurityError') return 'O navegador bloqueou o acesso à porta serial.'
  return 'Não foi possível conectar à balança.'
}

export class WebSerialTransport implements ScaleTransport {
  private listeners = new Set<TransportListener>()
  private port: SerialPortLike | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private loop: Promise<void> = Promise.resolve()
  private opening: Promise<void> | null = null
  private openingGeneration = -1
  private wanted = false
  /** Muda a cada disconnect e a cada porta aberta; uma tentativa de conexão com número antigo é obsoleta. */
  private generation = 0
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private parser: FrameParser | null = null
  private readonly stability: StabilityFilter
  private readonly now: () => number

  constructor(private readonly options: WebSerialOptions) {
    this.now = options.now ?? Date.now
    this.stability = new StabilityFilter(options.stabilityRequired ?? 3)
    options.serial.addEventListener('connect', this.onPortConnect)
  }

  subscribe(listener: TransportListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async connect(interactive = false): Promise<void> {
    this.wanted = true
    if (this.port) return
    // Mesma tentativa ainda válida (connect duplo): reaproveita.
    if (this.opening && this.openingGeneration === this.generation) return this.opening

    // Tentativa anterior obsoleta (houve disconnect): a nova espera ela terminar de fechar a porta.
    const previous = this.opening
    this.openingGeneration = this.generation
    const attempt: Promise<void> = (async () => {
      await previous?.catch(() => undefined)
      if (!this.wanted || this.port) return
      await this.open(interactive)
    })().finally(() => {
      if (this.opening === attempt) this.opening = null
    })
    this.opening = attempt
    return attempt
  }

  async disconnect(): Promise<void> {
    this.wanted = false
    this.generation += 1
    await this.closePort()
    this.emitStatus('disconnected')
  }

  /** Solta o listener global. Chamar ao descartar o transporte. */
  dispose(): void {
    this.options.serial.removeEventListener('connect', this.onPortConnect)
  }

  async write(bytes: Uint8Array): Promise<void> {
    const writable = this.port?.writable
    if (!writable) return
    const writer = writable.getWriter()
    try {
      await writer.write(bytes)
    } finally {
      writer.releaseLock()
    }
  }

  private onPortConnect = (): void => {
    if (this.wanted && !this.port) void this.connect(false)
  }

  private async pickPort(interactive: boolean): Promise<SerialPortLike | null> {
    const { serial, portFilter } = this.options
    const granted = await serial.getPorts()
    const matches = (info: SerialPortInfo) =>
      !portFilter ||
      ((portFilter.usbVendorId === undefined || portFilter.usbVendorId === info.usbVendorId) &&
        (portFilter.usbProductId === undefined || portFilter.usbProductId === info.usbProductId))
    const known = granted.find((port) => matches(port.getInfo()))
    if (known) return known
    if (!interactive) return null
    try {
      return await serial.requestPort()
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'NotFoundError') return null // operador fechou a janela
      throw error
    }
  }

  private async open(interactive: boolean): Promise<void> {
    const token = this.generation
    const isStale = () => token !== this.generation || !this.wanted
    this.emitStatus('connecting')
    try {
      const port = await this.pickPort(interactive)
      if (isStale()) return
      if (!port) {
        this.emitStatus('disconnected', interactive ? 'Nenhuma porta selecionada.' : undefined)
        return
      }
      if (!(await openPort(port, this.options.settings, isStale))) return
      // Sem nenhum await daqui até o laço de leitura: a tentativa não fica obsoleta no meio.
      this.port = port
      this.parser = this.options.driver?.createParser() ?? null
      this.stability.reset()
      this.options.onPortSelected?.(port.getInfo())
      const generation = ++this.generation
      this.emitStatus('connected')
      this.loop = this.readLoop(port, generation)
      this.startPolling(generation)
    } catch (error) {
      if (isStale()) return
      this.emitStatus('error', friendlyError(error))
    }
  }

  private async readLoop(port: SerialPortLike, generation: number): Promise<void> {
    let keepReading = true
    while (keepReading) {
      keepReading = false
      const readable = port.readable
      if (!readable) break
      const reader = readable.getReader()
      this.reader = reader
      let failure: unknown = null
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          if (value && value.length > 0) this.handleBytes(value)
        }
      } catch (error) {
        failure = error
      } finally {
        reader.releaseLock()
        if (this.reader === reader) this.reader = null
      }
      const name = (failure as { name?: string } | null)?.name
      if (name && RECOVERABLE_READ_ERRORS.has(name) && generation === this.generation && this.wanted && port.readable) {
        this.emit({ type: 'read-error', name })
        keepReading = true // ruído na linha: a porta ganhou um fluxo novo, dá para continuar
      }
    }
    if (generation === this.generation && this.wanted) {
      await this.closePort(true) // não espera por si mesmo: este laço é o que está fechando a porta
      this.emitStatus('disconnected', 'Balança desconectada.')
    }
  }

  private handleBytes(bytes: Uint8Array): void {
    const at = this.now()
    this.emit({ type: 'raw', chunk: { bytes, at } })
    if (!this.parser) return
    const { frames, discarded } = this.parser.push(bytes)
    if (discarded > 0) this.emit({ type: 'discarded', count: discarded })
    for (const frame of frames) {
      const stable = frame.stable ?? this.stability.push(frame.weightKg)
      this.emit({ type: 'reading', reading: { weightKg: roundKg(frame.weightKg), stable, at } })
    }
  }

  private startPolling(generation: number): void {
    const { driver } = this.options
    if (!driver?.pollRequest) return
    const request = driver.pollRequest
    this.pollTimer = setInterval(() => {
      if (generation !== this.generation) return
      void this.write(request).catch(() => undefined)
    }, driver.pollIntervalMs ?? 300)
  }

  private async closePort(calledFromReadLoop = false): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
    const port = this.port
    this.port = null
    if (!port) return
    if (!calledFromReadLoop) {
      try {
        await this.reader?.cancel()
      } catch {
        // já encerrado
      }
      await this.loop
    }
    try {
      await queued(port, () => port.close())
    } catch {
      // porta já removida
    }
  }

  private emitStatus(status: ScaleStatus, message?: string): void {
    this.emit({ type: 'status', status, message })
  }

  private emit(event: TransportEvent): void {
    this.listeners.forEach((listener) => listener(event))
  }
}
