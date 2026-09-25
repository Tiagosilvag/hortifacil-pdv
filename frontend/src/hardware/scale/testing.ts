/** Portas seriais e driver falsos, só para testes. */
import type { FrameParser, ScaleDriver } from './types'
import type { SerialLike, SerialPortInfo, SerialPortLike } from './webSerial'

export const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 5))
export const bytes = (text: string) => new TextEncoder().encode(text)

export interface FakePortOptions {
  /** Atraso do open(), para simular a abertura em andamento. */
  openDelayMs?: number
  /** Como a porta real: abrir uma porta que já está aberta (ou abrindo) dá InvalidStateError. */
  strict?: boolean
}

export class FakePort implements SerialPortLike {
  readable: ReadableStream<Uint8Array> | null = null
  writable: WritableStream<Uint8Array> | null = null
  opened = 0
  closed = 0
  written: string[] = []
  state: 'closed' | 'opening' | 'open' = 'closed'
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null

  constructor(
    private readonly info: SerialPortInfo = { usbVendorId: 1, usbProductId: 2 },
    private readonly options: FakePortOptions = {},
  ) {}

  private newReadable(): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({ start: (controller) => { this.controller = controller } })
  }

  async open(): Promise<void> {
    if (this.options.strict && this.state !== 'closed') {
      throw Object.assign(new Error('porta já aberta'), { name: 'InvalidStateError' })
    }
    this.state = 'opening'
    if (this.options.openDelayMs) await new Promise((resolve) => setTimeout(resolve, this.options.openDelayMs))
    this.opened += 1
    this.readable = this.newReadable()
    this.writable = new WritableStream<Uint8Array>({ write: (chunk) => { this.written.push(new TextDecoder().decode(chunk)) } })
    this.state = 'open'
  }

  async close(): Promise<void> {
    this.closed += 1
    this.state = 'closed'
  }

  getInfo(): SerialPortInfo {
    return this.info
  }

  push(text: string): void {
    this.controller?.enqueue(bytes(text))
  }

  /** Simula o cabo sendo puxado: o fluxo de leitura termina. */
  unplug(): void {
    this.controller?.close()
  }

  /** Erro de leitura recuperável (ruído na linha): o fluxo atual falha e a porta ganha um fluxo novo, como na API real. */
  recoverableError(name: string): void {
    this.controller?.error(Object.assign(new Error(name), { name }))
    this.readable = this.newReadable()
  }

  /** Erro de leitura fatal (dispositivo removido): o fluxo falha e não é substituído. */
  fatalError(name: string): void {
    this.controller?.error(Object.assign(new Error(name), { name }))
  }
}

export class FakeSerial implements SerialLike {
  listeners = new Set<() => void>()
  constructor(public granted: FakePort[] = [], public requestable: FakePort | 'cancel' | null = null) {}
  async getPorts() { return this.granted }
  async requestPort() {
    if (this.requestable === 'cancel' || this.requestable === null) {
      throw Object.assign(new Error('cancelado'), { name: 'NotFoundError' })
    }
    return this.requestable
  }
  addEventListener(_type: 'connect' | 'disconnect', listener: () => void) { this.listeners.add(listener) }
  removeEventListener(_type: 'connect' | 'disconnect', listener: () => void) { this.listeners.delete(listener) }
  emitConnect() { this.listeners.forEach((l) => l()) }
}

/** Driver de teste: mensagens "PESO;S\n" (S = estável, I = instável); linhas inválidas são descartadas. */
export function testDriver(overrides: Partial<ScaleDriver> = {}): ScaleDriver {
  return {
    id: 'teste',
    label: 'Teste',
    serial: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
    createParser(): FrameParser {
      let buffer = ''
      return {
        push(chunk) {
          buffer += new TextDecoder().decode(chunk)
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          const frames = []
          let discarded = 0
          for (const line of lines) {
            const match = /^(\d+(?:\.\d+)?);([SI])$/.exec(line.trim())
            if (match) frames.push({ weightKg: Number(match[1]), stable: match[2] === 'S' })
            else discarded += 1
          }
          return { frames, discarded }
        },
      }
    },
    ...overrides,
  }
}
