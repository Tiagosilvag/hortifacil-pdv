import { useEffect, useRef } from 'react'
import { BurstDetector, DEFAULT_BURST_CONFIG, type BurstConfig } from './detector'

type TextField = HTMLInputElement | HTMLTextAreaElement

interface FieldSnapshot {
  element: TextField
  value: string
}

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'file', 'color'])

function textField(target: EventTarget | null): TextField | null {
  if (target instanceof HTMLTextAreaElement) return target
  if (target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type)) return target
  return null
}

/** Devolve ao campo o texto que ele tinha antes de a rajada do leitor cair nele (React só percebe pelo evento `input`). */
function restore({ element, value }: FieldSnapshot): void {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Leitor de código de barras que "digita" como um teclado: reconhece a rajada rápida terminada em Enter/Tab
 * em qualquer parte da página e chama `onScan(código)`. O texto que o leitor digitou num campo é desfeito,
 * e o Enter/Tab da leitura não aciona botões nem envia formulários.
 */
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true, config: BurstConfig = DEFAULT_BURST_CONFIG): void {
  const latest = useRef(onScan)
  useEffect(() => {
    latest.current = onScan
  })

  useEffect(() => {
    if (!enabled) return
    const detector = new BurstDetector(config)
    let snapshot: FieldSnapshot | null = null

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
      const result = detector.handleKey(event.key, event.timeStamp)
      if (result.kind === 'char' && result.startsBuffer) {
        const field = textField(event.target)
        snapshot = field ? { element: field, value: field.value } : null
      } else if (result.kind === 'scan') {
        event.preventDefault()
        event.stopPropagation()
        if (snapshot) restore(snapshot)
        snapshot = null
        latest.current(result.code)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [enabled, config])
}
