import { describe, expect, it } from 'vitest'
import {
  captureFailureMessage,
  evaluateReading,
  roundKg,
  StabilityFilter,
  waitForStableWeight,
} from './reading'
import type { ScaleReading } from './types'

const reading = (overrides: Partial<ScaleReading> = {}): ScaleReading => ({
  weightKg: 1.25,
  stable: true,
  at: 1000,
  ...overrides,
})

describe('roundKg', () => {
  it('arredonda a gramas', () => {
    expect(roundKg(1.2344)).toBe(1.234)
    expect(roundKg(1.2346)).toBe(1.235)
  })

  it('somar duas pesagens do mesmo produto não acumula erro de ponto flutuante', () => {
    expect(0.1 + 0.2).not.toBe(0.3) // o problema que o arredondamento resolve
    expect(roundKg(0.1 + 0.2)).toBe(0.3)
    expect(roundKg(1.235 + 0.5)).toBe(1.735)
  })
})

describe('StabilityFilter', () => {
  it('só considera estável depois de N leituras iguais seguidas', () => {
    const filter = new StabilityFilter(3)
    expect([filter.push(1.2), filter.push(1.2), filter.push(1.2)]).toEqual([false, false, true])
  })

  it('reinicia a contagem quando o peso muda', () => {
    const filter = new StabilityFilter(3)
    filter.push(1.2)
    filter.push(1.2)
    expect(filter.push(1.3)).toBe(false)
    expect(filter.push(1.2)).toBe(false)
  })

  it('compara em gramas, ignorando ruído abaixo de 1 g', () => {
    const filter = new StabilityFilter(2)
    filter.push(1.2001)
    expect(filter.push(1.2004)).toBe(true)
  })
})

describe('evaluateReading', () => {
  it('aceita uma leitura estável, recente e positiva', () => {
    expect(evaluateReading(reading(), 1500)).toEqual({ ok: true, weightKg: 1.25 })
  })

  it('recusa quando não há leitura', () => {
    expect(evaluateReading(null, 1500)).toEqual({ ok: false, reason: 'no-reading' })
  })

  it('recusa leitura velha (nunca vende com peso velho)', () => {
    expect(evaluateReading(reading({ at: 1000 }), 3500)).toEqual({ ok: false, reason: 'stale' })
    expect(evaluateReading(reading({ at: 1000 }), 3000)).toEqual({ ok: true, weightKg: 1.25 })
  })

  it('recusa peso zero e negativo', () => {
    expect(evaluateReading(reading({ weightKg: 0 }), 1500)).toEqual({ ok: false, reason: 'empty' })
    expect(evaluateReading(reading({ weightKg: -0.02 }), 1500)).toEqual({ ok: false, reason: 'empty' })
  })

  it('recusa peso instável', () => {
    expect(evaluateReading(reading({ stable: false }), 1500)).toEqual({ ok: false, reason: 'unstable' })
  })

  it('leitura velha vence "instável" e balança vazia vence "instável"', () => {
    expect(evaluateReading(reading({ stable: false, at: 0 }), 5000).ok).toBe(false)
    expect(evaluateReading(reading({ stable: false, weightKg: 0 }), 1500)).toEqual({ ok: false, reason: 'empty' })
  })
})

describe('waitForStableWeight', () => {
  const clock = () => {
    let t = 1000
    return { now: () => t, sleep: async (ms: number) => { t += ms } }
  }

  it('devolve na hora quando já está estável', async () => {
    const { now, sleep } = clock()
    const result = await waitForStableWeight(() => reading({ at: now() }), { now, sleep })
    expect(result).toEqual({ ok: true, weightKg: 1.25 })
  })

  it('espera o peso estabilizar dentro do prazo', async () => {
    const { now, sleep } = clock()
    let calls = 0
    const getReading = () => reading({ at: now(), stable: ++calls >= 4 })
    const result = await waitForStableWeight(getReading, { now, sleep, timeoutMs: 2000, intervalMs: 100 })
    expect(result).toEqual({ ok: true, weightKg: 1.25 })
    expect(calls).toBe(4)
  })

  it('desiste depois do prazo e devolve "unstable"', async () => {
    const { now, sleep } = clock()
    const result = await waitForStableWeight(() => reading({ at: now(), stable: false }), {
      now, sleep, timeoutMs: 500, intervalMs: 100,
    })
    expect(result).toEqual({ ok: false, reason: 'unstable' })
  })

  it('não espera quando a balança está vazia', async () => {
    const { now, sleep } = clock()
    let calls = 0
    const result = await waitForStableWeight(() => { calls++; return reading({ at: now(), weightKg: 0 }) }, { now, sleep })
    expect(result).toEqual({ ok: false, reason: 'empty' })
    expect(calls).toBe(1)
  })
})

describe('captureFailureMessage', () => {
  it('tem mensagem em português para cada motivo', () => {
    expect(captureFailureMessage('empty')).toBe('Coloque o produto na balança.')
    expect(captureFailureMessage('unstable')).toContain('instável')
    expect(captureFailureMessage('stale')).toContain('cabo')
    expect(captureFailureMessage('no-reading')).toContain('cabo')
  })
})
