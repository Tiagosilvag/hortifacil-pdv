import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Configuração da impressora deste caixa. Fica no navegador (não vai para o banco). */
export interface PrinterConfig {
  /** Imprimir o cupom sozinho ao confirmar o pedido. */
  enabled: boolean
  paperWidthMm: 58 | 80
  storeName: string
  address: string
  phone: string
  footer: string
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  enabled: false, // só liga depois de o caixa ser configurado: sem impressora, ninguém quer janela de impressão
  paperWidthMm: 80,
  storeName: '',
  address: '',
  phone: '',
  footer: 'Obrigado! Volte sempre.',
}

interface PrinterStore extends PrinterConfig {
  update: (patch: Partial<PrinterConfig>) => void
}

export const usePrinterSettings = create<PrinterStore>()(
  persist(
    (set) => ({
      ...DEFAULT_PRINTER_CONFIG,
      update: (patch) => set(patch),
    }),
    { name: 'pdv-printer' },
  ),
)
