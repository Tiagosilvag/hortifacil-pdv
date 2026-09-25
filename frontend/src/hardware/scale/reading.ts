import type { ScaleReading } from './types'

export const MAX_READING_AGE_MS = 2000
export const STABLE_WAIT_MS = 2000

/** Arredonda a gramas (3 casas), o que cabe no `qty` do banco. */
export function roundKg(weightKg: number): number {
  return Math.round(weightKg * 1000) / 1000
}

/** Para balanças que não informam estabilidade: estável = mesmo peso N vezes seguidas. */
export class StabilityFilter {
  private last: number | null = null
  private equalCount = 0

  constructor(private readonly required = 3) {}

  push(weightKg: number): boolean {
    const weight = roundKg(weightKg)
    if (this.last !== null && weight === this.last) {
      this.equalCount += 1
    } else {
      this.last = weight
      this.equalCount = 1
    }
    return this.equalCount >= this.required
  }

  reset(): void {
    this.last = null
    this.equalCount = 0
  }
}

export type CaptureFailure = 'no-reading' | 'stale' | 'empty' | 'unstable'
export type CaptureResult = { ok: true; weightKg: number } | { ok: false; reason: CaptureFailure }

/** Decide se uma leitura pode virar a quantidade de um item. Nunca usa peso velho, zero, negativo ou instável. */
export function evaluateReading(
  reading: ScaleReading | null,
  now: number,
  maxAgeMs: number = MAX_READING_AGE_MS,
): CaptureResult {
  if (!reading) return { ok: false, reason: 'no-reading' }
  if (now - reading.at > maxAgeMs) return { ok: false, reason: 'stale' }
  if (reading.weightKg <= 0) return { ok: false, reason: 'empty' }
  if (!reading.stable) return { ok: false, reason: 'unstable' }
  return { ok: true, weightKg: roundKg(reading.weightKg) }
}

export interface WaitOptions {
  timeoutMs?: number
  intervalMs?: number
  maxAgeMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Espera o peso estabilizar (até `timeoutMs`). Só o caso "instável" merece espera; os demais são definitivos. */
export async function waitForStableWeight(
  getReading: () => ScaleReading | null,
  options: WaitOptions = {},
): Promise<CaptureResult> {
  const {
    timeoutMs = STABLE_WAIT_MS,
    intervalMs = 100,
    maxAgeMs = MAX_READING_AGE_MS,
    now = Date.now,
    sleep = defaultSleep,
  } = options
  const deadline = now() + timeoutMs
  let result = evaluateReading(getReading(), now(), maxAgeMs)
  while (!result.ok && result.reason === 'unstable' && now() < deadline) {
    await sleep(intervalMs)
    result = evaluateReading(getReading(), now(), maxAgeMs)
  }
  return result
}

export function captureFailureMessage(reason: CaptureFailure): string {
  switch (reason) {
    case 'empty':
      return 'Coloque o produto na balança.'
    case 'unstable':
      return 'Peso instável. Aguarde a balança estabilizar.'
    case 'stale':
    case 'no-reading':
      return 'Sem leitura da balança. Confira o cabo ou desligue a balança para digitar a quantidade.'
  }
}
