export type Align = 'left' | 'center' | 'right'

/**
 * O cupom como lista de blocos, independente de como vai ser impresso.
 * Hoje um renderizador HTML (renderHtml.ts) manda para a impressora do Windows;
 * um renderizador ESC/POS para um agente local poderia usar a mesma estrutura.
 * O cupom fiscal (sub-projeto C) acrescentará blocos de QR Code e de código de barras.
 */
export type ReceiptBlock =
  | { type: 'text'; text: string; align?: Align; bold?: boolean; size?: 'normal' | 'large' }
  /** Duas colunas: descrição à esquerda, valor à direita. */
  | { type: 'row'; left: string; right: string; bold?: boolean }
  | { type: 'divider' }
  | { type: 'blank' }
  /** Corte do papel. No navegador quem corta é o driver da impressora; só um renderizador ESC/POS usa este bloco. */
  | { type: 'cut' }

export interface Receipt {
  blocks: ReceiptBlock[]
}
