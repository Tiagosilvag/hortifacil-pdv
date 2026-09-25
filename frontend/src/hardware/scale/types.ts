/** Leitura de peso da balança. */
export interface ScaleReading {
  /** Peso líquido em kg, arredondado a gramas. */
  weightKg: number
  /** true = a balança (ou o filtro de estabilidade) considera o peso estável. */
  stable: boolean
  /** Date.now() do instante em que a leitura chegou. */
  at: number
}

export type ScaleStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected' | 'error'

export interface RawChunk {
  bytes: Uint8Array
  at: number
}

export type TransportEvent =
  | { type: 'status'; status: ScaleStatus; message?: string }
  | { type: 'reading'; reading: ScaleReading }
  | { type: 'raw'; chunk: RawChunk }
  | { type: 'discarded'; count: number }
  /** Erro de leitura recuperável da porta (ruído, velocidade errada); a leitura continua. */
  | { type: 'read-error'; name: string }

export type TransportListener = (event: TransportEvent) => void

/** Contrato entre o PDV e qualquer forma de falar com a balança (Web Serial hoje, agente local depois). */
export interface ScaleTransport {
  /** `interactive = true` só quando vem de um clique do operador (a primeira autorização da porta exige isso). */
  connect(interactive?: boolean): Promise<void>
  disconnect(): Promise<void>
  subscribe(listener: TransportListener): () => void
  /** Envia bytes à balança (comando de solicitação). Ausente em transportes que não escrevem. */
  write?(bytes: Uint8Array): Promise<void>
}

export interface SerialSettings {
  baudRate: number
  dataBits: 7 | 8
  stopBits: 1 | 2
  parity: 'none' | 'even' | 'odd'
}

export interface ParsedFrame {
  weightKg: number
  /** null = a balança não informa estabilidade; o filtro decide. */
  stable: boolean | null
}

export interface ParseResult {
  frames: ParsedFrame[]
  /** Quantidade de mensagens descartadas por estarem corrompidas. */
  discarded: number
}

export interface FrameParser {
  push(bytes: Uint8Array): ParseResult
}

/** Protocolo de uma balança. Um driver por modelo (Toledo e Urano entram depois da captura em bancada). */
export interface ScaleDriver {
  id: string
  label: string
  serial: SerialSettings
  /** Presente quando a balança só envia o peso a pedido. */
  pollRequest?: Uint8Array
  pollIntervalMs?: number
  createParser(): FrameParser
}
