import type { Order } from '@/types'
import { buildFiscalReceipt, canPrintFiscal, type FiscalPrintInfo } from './fiscalReceipt'
import { buildOrderReceipt, buildTestReceipt, type ReceiptConfig } from './orderReceipt'
import { printHtml } from './print'
import type { Receipt } from './receipt'
import { renderReceiptHtml } from './renderHtml'

export interface PrinterSettings extends ReceiptConfig {
  paperWidthMm: 58 | 80
}

/** Imprimir é sempre um "extra": qualquer falha vira log, nunca uma exceção que derrube a tela ou o registro do pedido. */
function safely(print: () => void): void {
  try {
    print()
  } catch (error) {
    console.error('Falha ao enviar o cupom para a impressora', error)
  }
}

/** Cupom do pedido para a impressora do caixa. Roda depois de o pedido estar salvo: nunca atrasa nem impede o registro. */
export function printOrderReceipt(order: Order, settings: PrinterSettings): void {
  safely(() => printHtml(renderReceiptHtml(buildOrderReceipt(order, settings), { widthMm: settings.paperWidthMm })))
}

/**
 * O documento certo para o pedido: cupom fiscal quando a NFC-e está autorizada (e temos os dados da empresa), senão o
 * cupom não fiscal. Sem os dados da empresa não sai um cupom fiscal incompleto.
 */
export function buildDocumentReceipt(order: Order, settings: PrinterSettings, fiscal: FiscalPrintInfo | null): Receipt {
  if (fiscal && canPrintFiscal(order)) return buildFiscalReceipt(order, fiscal, settings.footer)
  return buildOrderReceipt(order, settings)
}

/** Imprime o cupom do pedido (fiscal ou não fiscal). Nunca lança, como as demais impressões. */
export function printOrderDocument(order: Order, settings: PrinterSettings, fiscal: FiscalPrintInfo | null): void {
  safely(() => printHtml(renderReceiptHtml(buildDocumentReceipt(order, settings, fiscal), { widthMm: settings.paperWidthMm })))
}

/** Página de teste para acertar o papel, o driver e a largura do caixa. */
export function printTestPage(settings: PrinterSettings): void {
  safely(() => printHtml(renderReceiptHtml(buildTestReceipt(settings, settings.paperWidthMm), { widthMm: settings.paperWidthMm })))
}
