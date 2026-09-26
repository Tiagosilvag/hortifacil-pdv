import { describe, expect, it } from 'vitest'
import { decideAutoPrint, printButtonLabel, type AutoPrintInput } from './autoPrint'

const base: AutoPrintInput = { printerEnabled: true, statusReady: true, emissionEnabled: false, settled: false, gaveUp: false }
const decide = (over: Partial<AutoPrintInput>) => decideAutoPrint({ ...base, ...over })

describe('impressão automática ao confirmar o pedido', () => {
  it('impressora do caixa desligada: nunca imprime sozinho', () => {
    expect(decide({ printerEnabled: false })).toBe('skip')
    expect(decide({ printerEnabled: false, emissionEnabled: true, settled: true })).toBe('skip')
  })

  it('espera o estado da emissão chegar antes de decidir', () => {
    expect(decide({ statusReady: false })).toBe('wait')
  })

  it('sem emissão fiscal imprime na hora, como sempre foi', () => {
    expect(decide({ emissionEnabled: false })).toBe('print')
  })

  it('com emissão fiscal espera a nota assentar e então imprime', () => {
    expect(decide({ emissionEnabled: true })).toBe('wait')
    expect(decide({ emissionEnabled: true, settled: true })).toBe('print')
  })

  it('se as consultas acabam sem a nota assentar, imprime mesmo assim (o cupom não fiscal não trava o caixa)', () => {
    expect(decide({ emissionEnabled: true, gaveUp: true })).toBe('print')
  })
})

describe('texto do botão de imprimir', () => {
  it('cupom fiscal só com a nota autorizada; "Reimprimir" na tela do pedido', () => {
    expect(printButtonLabel(false, false)).toBe('Imprimir cupom')
    expect(printButtonLabel(false, true)).toBe('Reimprimir cupom')
    expect(printButtonLabel(true, false)).toBe('Imprimir cupom fiscal')
    expect(printButtonLabel(true, true)).toBe('Reimprimir cupom fiscal')
  })
})
