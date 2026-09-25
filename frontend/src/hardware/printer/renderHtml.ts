import type { Receipt, ReceiptBlock } from './receipt'

export interface RenderOptions {
  widthMm: 58 | 80
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Margem lateral de cada largura: a área imprimível da bobina de 80 mm é ~72 mm e a de 58 mm é ~48 mm.
const SIDE_PADDING_MM: Record<58 | 80, number> = { 58: 5, 80: 4 }
const FONT_PX: Record<58 | 80, number> = { 58: 11, 80: 12 }

function renderBlock(block: ReceiptBlock): string {
  switch (block.type) {
    case 'text': {
      const classes = ['t', block.align ?? 'left', block.bold ? 'bold' : '', block.size === 'large' ? 'large' : '']
      return `<div class="${classes.filter(Boolean).join(' ')}">${escapeHtml(block.text)}</div>`
    }
    case 'row':
      return `<div class="row${block.bold ? ' bold' : ''}"><span class="l">${escapeHtml(block.left)}</span><span class="r">${escapeHtml(block.right)}</span></div>`
    case 'divider':
      return '<div class="divider"></div>'
    case 'blank':
      return '<div class="blank"></div>'
    case 'cut':
      return '' // no navegador quem corta o papel é o driver da impressora
  }
}

/**
 * Documento HTML do cupom na largura da bobina, sempre preto no branco (ignora o tema escuro do sistema).
 * As colunas usam flexbox: o alinhamento não depende da largura das letras, e nomes longos quebram em várias linhas.
 */
export function renderReceiptHtml(receipt: Receipt, { widthMm }: RenderOptions): string {
  const padding = SIDE_PADDING_MM[widthMm]
  const font = FONT_PX[widthMm]
  const css = `
@page { margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { width: ${widthMm}mm; padding: 0 ${padding}mm; box-sizing: border-box; font: ${font}px/1.35 Consolas, 'Courier New', monospace; }
body::after { content: ''; display: block; height: 8mm; }
.t { white-space: pre-wrap; overflow-wrap: anywhere; }
.left { text-align: left; }
.center { text-align: center; }
.right { text-align: right; }
.bold { font-weight: 700; }
.large { font-size: ${font + 3}px; }
.row { display: flex; justify-content: space-between; align-items: flex-start; gap: 2mm; }
.row .l { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.row .r { white-space: nowrap; text-align: right; }
.divider { border-top: 1px dashed #000; margin: 2mm 0; }
.blank { height: 3mm; }
`.trim()
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Cupom</title>
<style>
${css}
</style>
</head>
<body>
${receipt.blocks.map(renderBlock).filter(Boolean).join('\n')}
</body>
</html>`
}
