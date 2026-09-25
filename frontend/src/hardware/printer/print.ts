const CLEANUP_MS = 60_000

/**
 * Manda o HTML para a impressora padrão do Windows por um iframe oculto na própria página (sem abrir aba).
 * O navegador não informa se imprimiu; com o Chrome/Edge aberto com --kiosk-printing sai direto, sem janela.
 */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'

  let removed = false
  const cleanup = () => {
    if (removed) return
    removed = true
    frame.remove()
  }

  frame.onload = () => {
    const win = frame.contentWindow
    // Sem isto, um `load` do about:blank inicial imprimiria uma página em branco antes do cupom.
    if (win && win.location.href === 'about:blank') return
    if (!win) {
      cleanup()
      return
    }
    win.onafterprint = cleanup
    win.focus()
    win.print()
    setTimeout(cleanup, CLEANUP_MS) // se o navegador não avisar o fim da impressão
  }
  // srcdoc antes de entrar na página: no Chromium, um iframe sem src dispara `load` (do about:blank) ao ser inserido.
  frame.srcdoc = html
  document.body.appendChild(frame)
}
