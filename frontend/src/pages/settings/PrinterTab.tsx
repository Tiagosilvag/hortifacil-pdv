import { Button } from '@/components/ui/Button'
import { printTestPage } from '@/hardware/printer/printOrder'
import { usePrinterSettings } from '@/stores/printer'

const inputClass =
  'mt-1 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100'

/** Aba "Impressora" das Configurações: a configuração vale só para este computador e este navegador. */
export function PrinterTab() {
  const config = usePrinterSettings()
  const { update } = config

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Impressora deste caixa</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Esta configuração vale só para este computador e este navegador. A impressora é a impressora padrão do Windows.
        </p>

        <label className="mt-4 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={config.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
          Imprimir o cupom ao confirmar o pedido
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Largura do papel
          <select
            value={config.paperWidthMm}
            onChange={(e) => update({ paperWidthMm: Number(e.target.value) === 58 ? 58 : 80 })}
            className={inputClass}
          >
            <option value={80}>80 mm (bobina padrão)</option>
            <option value={58}>58 mm</option>
          </select>
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Nome do comércio (cabeçalho do cupom)
          <input value={config.storeName} onChange={(e) => update({ storeName: e.target.value })} className={inputClass} />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Endereço
          <input value={config.address} onChange={(e) => update({ address: e.target.value })} className={inputClass} />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Telefone
          <input value={config.phone} onChange={(e) => update({ phone: e.target.value })} className={inputClass} />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Rodapé
          <input value={config.footer} onChange={(e) => update({ footer: e.target.value })} className={inputClass} />
        </label>

        <div className="mt-5">
          <Button size="sm" onClick={() => printTestPage(usePrinterSettings.getState())}>
            Imprimir teste
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">Como configurar o caixa (uma vez)</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Deixe a Epson como <strong>impressora padrão</strong> do Windows e o papel do driver em <strong>bobina de 80 mm</strong>.</li>
          <li>
            Para imprimir <strong>sem abrir a janela</strong> de impressão, abra o Chrome ou o Edge deste caixa com{' '}
            <code>--kiosk-printing</code> no atalho.
          </li>
          <li>O corte do papel e a abertura da gaveta são opções do <strong>driver</strong> da Epson.</li>
          <li>Clique em <strong>Imprimir teste</strong> e confira largura, acentos e o corte.</li>
        </ol>
        <p className="mt-2">
          O navegador não sabe se o cupom saiu: se faltar papel, use <strong>Imprimir cupom</strong> ou <strong>Reimprimir cupom</strong> depois.
        </p>
      </div>
    </div>
  )
}
