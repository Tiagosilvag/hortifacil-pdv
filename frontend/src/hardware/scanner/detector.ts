export interface BurstConfig {
  /** Intervalo máximo entre duas teclas de uma mesma leitura. Leitor: poucos ms. Pessoa digitando: 100 ms ou mais. */
  maxGapMs: number
  /** Menos caracteres que isso nunca é leitura (evita confundir digitação rápida com leitor). */
  minLength: number
  /** Mais caracteres que isso é descartado (lixo, não um código de barras). */
  maxLength: number
}

export const DEFAULT_BURST_CONFIG: BurstConfig = { maxGapMs: 50, minLength: 6, maxLength: 64 }

export type KeyResult =
  /** Caractere acumulado. `startsBuffer` = primeira tecla de uma rajada nova (hora de guardar o texto do campo). */
  | { kind: 'char'; startsBuffer: boolean }
  /** Terminador (Enter/Tab) depois de uma rajada válida: `code` é o que o leitor leu. */
  | { kind: 'scan'; code: string }
  /** Tecla irrelevante, ou terminador sem rajada. */
  | { kind: 'none' }

const TERMINATORS = new Set(['Enter', 'Tab'])

/**
 * Reconhece a leitura de um leitor de código de barras que "digita" como um teclado:
 * o código inteiro chega em poucos milissegundos e termina em Enter (ou Tab).
 * Função pura de teclas e horários; quem liga ao DOM é `useBarcodeScanner`.
 */
export class BurstDetector {
  private buffer = ''
  private lastAt = 0
  private overflowed = false

  constructor(private readonly config: BurstConfig = DEFAULT_BURST_CONFIG) {}

  handleKey(key: string, at: number): KeyResult {
    if (TERMINATORS.has(key)) {
      const code = this.buffer
      const valid = !this.overflowed && code.length >= this.config.minLength && at - this.lastAt <= this.config.maxGapMs
      this.reset()
      return valid ? { kind: 'scan', code } : { kind: 'none' }
    }
    if (key.length !== 1) return { kind: 'none' } // Shift, Control, setas... não interrompem a rajada

    let startsBuffer = false
    if (this.buffer === '' || at - this.lastAt > this.config.maxGapMs) {
      this.buffer = ''
      this.overflowed = false
      startsBuffer = true
    }
    if (this.buffer.length < this.config.maxLength) this.buffer += key
    else this.overflowed = true
    this.lastAt = at
    return { kind: 'char', startsBuffer }
  }

  reset(): void {
    this.buffer = ''
    this.overflowed = false
  }
}
