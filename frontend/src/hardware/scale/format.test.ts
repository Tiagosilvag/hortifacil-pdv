import { describe, expect, it } from 'vitest'
import { appendLog, formatRawLine, parseHex, toAscii, toHex } from './format'
import { getModel, isModelUsable, selectableModels } from './models'

const bytes = (...values: number[]) => new Uint8Array(values)

describe('toHex', () => {
  it('escreve em hexadecimal com dois dígitos', () => {
    expect(toHex(bytes(0x31, 0x2e, 0x05))).toBe('31 2e 05')
    expect(toHex(bytes())).toBe('')
  })
})

describe('toAscii', () => {
  it('mostra imprimíveis, CR/LF/STX/ETX e troca o resto por ponto', () => {
    expect(toAscii(bytes(0x02, 0x31, 0x2e, 0x32, 0x0d, 0x0a, 0x03, 0x00, 0xff))).toBe('<STX>1.2\\r\\n<ETX>..')
  })
})

describe('parseHex', () => {
  it('aceita com ou sem espaços e maiúsculas', () => {
    expect(Array.from(parseHex('05 0D')!)).toEqual([0x05, 0x0d])
    expect(Array.from(parseHex('050d')!)).toEqual([0x05, 0x0d])
  })

  it('recusa texto inválido, vazio ou de tamanho ímpar', () => {
    expect(parseHex('')).toBeNull()
    expect(parseHex('0')).toBeNull()
    expect(parseHex('zz')).toBeNull()
    expect(parseHex('05 0')).toBeNull()
  })
})

describe('formatRawLine', () => {
  it('junta hora, hexadecimal e ASCII', () => {
    const at = new Date(2026, 8, 25, 9, 5, 7, 42).getTime()
    expect(formatRawLine({ bytes: bytes(0x31, 0x0d), at })).toBe('09:05:07.042  31 0d  |1\\r|')
  })
})

describe('modelos', () => {
  it('a simulada só aparece em desenvolvimento', () => {
    expect(selectableModels(false).map((m) => m.id)).toEqual(['toledo-prix-3-plus', 'urano-us-pop-s'])
    expect(selectableModels(true).map((m) => m.id)).toContain('simulated')
  })

  it('Toledo e Urano ainda não são utilizáveis (sem driver); a simulada é', () => {
    expect(isModelUsable(getModel('toledo-prix-3-plus')!)).toBe(false)
    expect(isModelUsable(getModel('urano-us-pop-s')!)).toBe(false)
    expect(isModelUsable(getModel('simulated')!)).toBe(true)
  })

  it('getModel devolve null para id desconhecido ou nulo', () => {
    expect(getModel(null)).toBeNull()
  })
})

describe('appendLog', () => {
  it('acrescenta enquanto cabe, sem descartar nada', () => {
    expect(appendLog(['a', 'b'], 'c', 5)).toEqual({ lines: ['a', 'b', 'c'], dropped: 0 })
  })

  it('passando do limite descarta as mais antigas e informa quantas', () => {
    expect(appendLog(['a', 'b', 'c'], 'd', 3)).toEqual({ lines: ['b', 'c', 'd'], dropped: 1 })
  })

  it('não altera a lista original', () => {
    const original = ['a', 'b']
    appendLog(original, 'c', 2)
    expect(original).toEqual(['a', 'b'])
  })

  it('o limite padrão comporta uma captura longa (milhares de linhas)', () => {
    let lines: string[] = []
    let dropped = 0
    for (let i = 0; i < 3000; i += 1) {
      const next = appendLog(lines, `linha ${i}`)
      lines = next.lines
      dropped += next.dropped
    }
    expect(dropped).toBe(0)
    expect(lines).toHaveLength(3000)
  })
})
