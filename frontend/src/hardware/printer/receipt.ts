export type Align = 'left' | 'center' | 'right'

/**
 * O cupom como lista de blocos, independente de como vai ser impresso.
 * Hoje um renderizador HTML (renderHtml.ts) manda para a impressora do Windows;
 * um renderizador ESC/POS para um agente local poderia usar a mesma estrutura.
 * O cupom fiscal usa o bloco de QR Code; código de barras não é usado (a NFC-e não pede).
 */
export type ReceiptBlock =
  | { type: 'text'; text: string; align?: Align; bold?: boolean; size?: 'normal' | 'large' }
  /** Duas colunas: descrição à esquerda, valor à direita. */
  | { type: 'row'; left: string; right: string; bold?: boolean }
  | { type: 'divider' }
  | { type: 'blank' }
  /** Corte do papel. No navegador quem corta é o driver da impressora; só um renderizador ESC/POS usa este bloco. */
  | { type: 'cut' }
  /** QR Code do cupom fiscal: o renderizador desenha a partir do texto (a URL de consulta devolvida pelo provedor). */
  | { type: 'qrcode'; data: string }

export interface Receipt {
  blocks: ReceiptBlock[]
}
