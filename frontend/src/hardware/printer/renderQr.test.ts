import { describe, expect, it } from 'vitest'
import { renderReceiptHtml } from './renderHtml'

const render = (data: string, widthMm: 58 | 80 = 80) => renderReceiptHtml({ blocks: [{ type: 'qrcode', data }] }, { widthMm })

describe('bloco de QR Code', () => {
  it('vira um SVG dentro da página, sem depender de rede nem de imagem externa', () => {
    const html = render('https://exemplo.invalid/nfce?p=123')
    expect(html).toContain('<div class="qr"><svg')
    expect(html).toContain('viewBox=')
    expect(html).not.toMatch(/<img|https:\/\/exemplo\.invalid\/nfce\?p=123/) // o texto da URL não aparece: só o desenho
  })

  it('textos diferentes geram desenhos diferentes', () => {
    expect(render('https://exemplo.invalid/a')).not.toBe(render('https://exemplo.invalid/b'))
  })

  it('o tamanho segue a largura da bobina', () => {
    expect(render('x', 80)).toContain('.qr svg { width: 40mm; height: 40mm; }')
    expect(render('x', 58)).toContain('.qr svg { width: 34mm; height: 34mm; }')
  })

  it('cabe uma URL de NFC-e de verdade (centenas de caracteres) com correção de erro M', () => {
    const url = `https://exemplo.invalid/nfce/qrcode?p=${'2'.repeat(44)}|2|1|1|${'A'.repeat(40)}`
    expect(() => render(url)).not.toThrow()
  })
})
