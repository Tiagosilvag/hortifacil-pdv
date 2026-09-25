import { describe, expect, it } from 'vitest'
import type { Receipt } from './receipt'
import { escapeHtml, renderReceiptHtml } from './renderHtml'

const render = (receipt: Receipt, widthMm: 58 | 80 = 80) => renderReceiptHtml(receipt, { widthMm })

describe('escapeHtml', () => {
  it('escapa os caracteres que quebrariam o HTML', () => {
    expect(escapeHtml(`<b>"A" & 'B'</b>`)).toBe('&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;')
  })
})

describe('renderReceiptHtml', () => {
  it('gera um documento completo em UTF-8, em português', () => {
    const html = render({ blocks: [] })
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<html lang="pt-BR">')
    expect(html).toContain('<meta charset="utf-8">')
  })

  it('nome de produto com HTML não vira HTML (nada de injeção no cupom)', () => {
    const html = render({ blocks: [{ type: 'text', text: '<script>alert(1)</script> & Cia' }, { type: 'row', left: '<i>x</i>', right: '"y"' }] })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<i>x</i>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Cia')
    expect(html).toContain('&lt;i&gt;x&lt;/i&gt;')
    expect(html).toContain('&quot;y&quot;')
  })

  it('a página tem a largura da bobina escolhida, sem margem, e é sempre preto no branco', () => {
    const at80 = render({ blocks: [] }, 80)
    expect(at80).toContain('@page { size: 80mm auto; margin: 0; }')
    expect(at80).toContain('width: 80mm')
    const at58 = render({ blocks: [] }, 58)
    expect(at58).toContain('@page { size: 58mm auto; margin: 0; }')
    expect(at58).toContain('width: 58mm')
    expect(at80).toContain('background: #fff')
    expect(at80).toContain('color: #000')
  })

  it('texto: alinhamento, negrito e tamanho viram classes', () => {
    const html = render({ blocks: [{ type: 'text', text: 'X', align: 'center', bold: true, size: 'large' }, { type: 'text', text: 'Y' }] })
    expect(html).toContain('<div class="t center bold large">X</div>')
    expect(html).toContain('<div class="t left">Y</div>')
  })

  it('linha de duas colunas: descrição à esquerda e valor à direita, com negrito opcional', () => {
    const html = render({ blocks: [{ type: 'row', left: 'TOTAL', right: 'R$ 8,63', bold: true }, { type: 'row', left: 'a', right: 'b' }] })
    expect(html).toContain('<div class="row bold"><span class="l">TOTAL</span><span class="r">R$ 8,63</span></div>')
    expect(html).toContain('<div class="row"><span class="l">a</span><span class="r">b</span></div>')
  })

  it('separador e espaço em branco; o bloco de corte não imprime nada (quem corta é o driver)', () => {
    const html = render({ blocks: [{ type: 'divider' }, { type: 'blank' }, { type: 'cut' }] })
    expect(html).toContain('<div class="divider"></div>')
    expect(html).toContain('<div class="blank"></div>')
    expect(html).not.toContain('cut')
  })

  it('mantém a ordem dos blocos', () => {
    const html = render({ blocks: [{ type: 'text', text: 'PRIMEIRO' }, { type: 'text', text: 'SEGUNDO' }, { type: 'text', text: 'TERCEIRO' }] })
    expect(html.indexOf('PRIMEIRO')).toBeLessThan(html.indexOf('SEGUNDO'))
    expect(html.indexOf('SEGUNDO')).toBeLessThan(html.indexOf('TERCEIRO'))
  })

  it('deixa uma folga no fim do papel para o corte não pegar a última linha', () => {
    expect(render({ blocks: [] })).toContain('body::after')
  })
})
