import { describe, expect, it } from 'vitest'
import { BurstDetector, type KeyResult } from './detector'

/** Digita `text` tecla a tecla, `gapMs` entre cada uma, a partir de `start`. Devolve o resultado de cada tecla e o instante final. */
function type(detector: BurstDetector, text: string, gapMs: number, start = 1000) {
  let at = start
  const results: KeyResult[] = []
  for (const key of text) {
    results.push(detector.handleKey(key, at))
    at += gapMs
  }
  return { results, end: at - gapMs }
}

describe('BurstDetector', () => {
  it('rajada rápida terminada em Enter vira uma leitura', () => {
    const detector = new BurstDetector()
    const { end } = type(detector, '7891234567895', 10)
    expect(detector.handleKey('Enter', end + 8)).toEqual({ kind: 'scan', code: '7891234567895' })
  })

  it('Tab também termina a leitura (alguns leitores mandam Tab)', () => {
    const detector = new BurstDetector()
    const { end } = type(detector, '7891234567895', 10)
    expect(detector.handleKey('Tab', end + 8)).toEqual({ kind: 'scan', code: '7891234567895' })
  })

  it('digitação humana (100 ms entre teclas) nunca vira leitura', () => {
    const detector = new BurstDetector()
    const { end } = type(detector, '7891234567895', 100)
    expect(detector.handleKey('Enter', end + 100)).toEqual({ kind: 'none' })
  })

  it('poucas teclas rápidas (menos de 6) não são leitura', () => {
    const detector = new BurstDetector()
    const { end } = type(detector, '12345', 10)
    expect(detector.handleKey('Enter', end + 8)).toEqual({ kind: 'none' })
  })

  it('um Enter muito depois da última tecla não conta como fim de rajada', () => {
    const detector = new BurstDetector()
    const { end } = type(detector, '7891234567895', 10)
    expect(detector.handleKey('Enter', end + 500)).toEqual({ kind: 'none' })
  })

  it('pausa no meio recomeça a contagem: só vale o que veio depois da pausa', () => {
    const detector = new BurstDetector()
    type(detector, '123', 10, 1000)
    const { end } = type(detector, '4567890', 10, 2000) // pausa de ~1 s
    expect(detector.handleKey('Enter', end + 8)).toEqual({ kind: 'scan', code: '4567890' })
  })

  it('Shift no meio da rajada (letras maiúsculas) não quebra a leitura', () => {
    const detector = new BurstDetector()
    let at = 1000
    for (const key of ['A', 'Shift', 'B', 'Shift', 'C', 'D', 'E', 'F']) {
      detector.handleKey(key, at)
      at += 10
    }
    expect(detector.handleKey('Enter', at)).toEqual({ kind: 'scan', code: 'ABCDEF' })
  })

  it('duas leituras seguidas dão dois códigos', () => {
    const detector = new BurstDetector()
    const first = type(detector, '7891234567895', 10, 1000)
    expect(detector.handleKey('Enter', first.end + 8)).toMatchObject({ kind: 'scan', code: '7891234567895' })
    const second = type(detector, '7899999999996', 10, first.end + 300)
    expect(detector.handleKey('Enter', second.end + 8)).toMatchObject({ kind: 'scan', code: '7899999999996' })
  })

  it('só a primeira tecla de cada rajada avisa que começou um buffer (para guardar o texto do campo)', () => {
    const detector = new BurstDetector()
    const { results } = type(detector, '789123', 10)
    expect(results.map((r) => r.kind === 'char' && r.startsBuffer)).toEqual([true, false, false, false, false, false])
  })

  it('rajada longa demais (mais de 64 caracteres) é descartada, não vira um código truncado', () => {
    const detector = new BurstDetector()
    const { end } = type(detector, '1'.repeat(70), 5)
    expect(detector.handleKey('Enter', end + 5)).toEqual({ kind: 'none' })
  })

  it('teclas que não são caractere (setas, Shift) não devolvem "char"', () => {
    const detector = new BurstDetector()
    expect(detector.handleKey('ArrowLeft', 1000)).toEqual({ kind: 'none' })
    expect(detector.handleKey('Shift', 1010)).toEqual({ kind: 'none' })
  })

  it('reset() esquece a rajada em andamento', () => {
    const detector = new BurstDetector()
    const { end } = type(detector, '7891234567895', 10)
    detector.reset()
    expect(detector.handleKey('Enter', end + 8)).toEqual({ kind: 'none' })
  })
})
