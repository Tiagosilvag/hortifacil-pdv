import { useEffect, useRef } from 'react'
import { Badge } from '@/components/ui/Badge'
import { printOrderDocument } from '@/hardware/printer/printOrder'
import { usePrinterSettings } from '@/stores/printer'
import type { Order } from '@/types'
import { decideAutoPrint } from '@/utils/autoPrint'
import { describeFiscal } from '@/utils/fiscal'
import { PrintReceiptButton } from './PrintReceiptButton'
import { useOrderFiscal } from './useOrderFiscal'

/**
 * Bloco da tela "Pedido registrado": estado da NFC-e, impressão automática (se o caixa a liga) e o botão de imprimir.
 * Com emissão fiscal a impressão automática espera a nota assentar, para o cupom sair com o documento certo; o caixa
 * nunca fica esperando, porque os botões da tela continuam livres o tempo todo.
 */
export function OrderFiscalPanel({ order }: { order: Order }) {
  const fiscal = useOrderFiscal(order)
  const printerEnabled = usePrinterSettings((state) => state.enabled)
  const printed = useRef(false)

  const decision = decideAutoPrint({
    printerEnabled,
    statusReady: fiscal.statusReady,
    emissionEnabled: fiscal.emissionEnabled,
    settled: fiscal.settled,
    gaveUp: fiscal.gaveUp,
  })

  useEffect(() => {
    if (decision !== 'print' || printed.current) return
    printed.current = true // uma vez só por pedido, mesmo que a tela renderize de novo
    printOrderDocument(fiscal.latest, usePrinterSettings.getState(), fiscal.fiscalInfo)
  }, [decision, fiscal.latest, fiscal.fiscalInfo])

  const summary = fiscal.gaveUp
    ? { label: 'NFC-e ainda em andamento', variant: 'amber' as const, detail: 'Confira o estado no detalhe do pedido.' }
    : describeFiscal(fiscal.latest, fiscal.emissionEnabled)
  const showStatus = fiscal.emissionEnabled || summary.label !== 'Sem NFC-e' // emissão desligada: a tela fica como sempre foi

  return (
    <div className="mb-3">
      {showStatus && (
        <div className="mb-6 flex flex-col items-center gap-1" aria-live="polite">
          <Badge variant={summary.variant}>{summary.label}</Badge>
          {summary.detail && <p className="text-xs text-slate-500 dark:text-slate-400">{summary.detail}</p>}
        </div>
      )}
      <PrintReceiptButton order={fiscal.latest} className="w-full" />
    </div>
  )
}
