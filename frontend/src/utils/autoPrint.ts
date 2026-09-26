export type AutoPrintDecision = 'skip' | 'wait' | 'print'

export interface AutoPrintInput {
  /** "Imprimir o cupom ao confirmar o pedido" está ligado neste caixa. */
  printerEnabled: boolean
  /** O estado da emissão fiscal (GET /fiscal/status) já respondeu (ou falhou: aí conta como emissão desligada). */
  statusReady: boolean
  emissionEnabled: boolean
  /** A NFC-e do pedido já assentou (autorizada, rejeitada, ou com um motivo gravado). */
  settled: boolean
  /** Acabaram as consultas e a nota não assentou (provedor lento). */
  gaveUp: boolean
}

/**
 * Quando imprimir sozinho ao confirmar o pedido. Sem emissão fiscal, imprime na hora (como sempre foi). Com emissão, espera
 * a nota assentar para o cupom sair com o documento certo (fiscal se autorizada, não fiscal nos demais casos) e imprime
 * assim que ela assenta, ou quando as consultas acabam.
 */
export function decideAutoPrint(input: AutoPrintInput): AutoPrintDecision {
  if (!input.printerEnabled) return 'skip'
  if (!input.statusReady) return 'wait'
  if (!input.emissionEnabled) return 'print'
  return input.settled || input.gaveUp ? 'print' : 'wait'
}

/** Texto do botão de imprimir: o cupom fiscal quando a nota está autorizada, senão o cupom do pedido. */
export function printButtonLabel(fiscal: boolean, reprint: boolean): string {
  const base = fiscal ? 'cupom fiscal' : 'cupom'
  return `${reprint ? 'Reimprimir' : 'Imprimir'} ${base}`
}
