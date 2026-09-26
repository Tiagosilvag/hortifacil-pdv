import { useQuery } from '@tanstack/react-query'
import { PrinterIcon } from '@heroicons/react/24/outline'
import { getFiscalStatus } from '@/api/fiscal'
import { Button } from '@/components/ui/Button'
import { canPrintFiscal, type FiscalPrintInfo } from '@/hardware/printer/fiscalReceipt'
import { printOrderDocument } from '@/hardware/printer/printOrder'
import { usePrinterSettings } from '@/stores/printer'
import type { Order } from '@/types'
import { printButtonLabel } from '@/utils/autoPrint'

interface Props {
  order: Order
  /** Na tela do pedido o botão diz "Reimprimir". */
  reprint?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/** Botão de imprimir o cupom do pedido: fiscal se a NFC-e está autorizada, senão o cupom não fiscal. */
export function PrintReceiptButton({ order, reprint = false, size, className }: Props) {
  const { data: status } = useQuery({ queryKey: ['fiscal', 'status'], queryFn: getFiscalStatus, staleTime: 60_000 })
  const fiscal: FiscalPrintInfo | null = status?.issuer ? { issuer: status.issuer, environment: status.environment } : null
  const isFiscal = !!fiscal && canPrintFiscal(order)

  return (
    <Button
      variant="secondary"
      size={size}
      className={className}
      onClick={() => printOrderDocument(order, usePrinterSettings.getState(), fiscal)}
    >
      <PrinterIcon className="w-4 h-4 mr-1.5" />
      {printButtonLabel(isFiscal, reprint)}
    </Button>
  )
}
