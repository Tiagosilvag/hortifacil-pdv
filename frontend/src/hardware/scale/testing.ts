/** Portas seriais e driver falsos, só para testes. */
import type { FrameParser, ScaleDriver } from './types'
import type { SerialLike, SerialPortInfo, SerialPortLike } from './webSerial'

export const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 5))
export const bytes = (text: string) => new TextEncoder().encode(text)

export class FakePort implements SerialPortLike {
  readable: ReadableStream<Uint8Array> | null = null
  writable: WritableStream<Uint8Array> | null = null
  opened = 0
  closed = 0
  written: string[] = []
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null

  constructor(private readonly info: SerialPortInfo = { usbVendorId: 1, usbProductId: 2 }) {}

  async open(): Promise<void> {
    this.opened += 1
    this.readable = new ReadableStream<Uint8Array>({ start: (controller) => { this.controller = controller } })
    this.writable = new WritableStream<Uint8Array>({ write: (chunk) => { this.written.push(new TextDecoder().decode(chunk)) } })
  }

  async close(): Promise<void> {
    this.closed += 1
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

