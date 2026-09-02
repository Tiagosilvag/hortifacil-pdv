import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChartBarIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { getSalesReport } from '@/api/reports'
import { formatCurrency, formatDate } from '@/utils/format'

type Preset = '7d' | '30d' | 'month' | 'custom'

function getPresetDates(preset: Preset): { from: string; to: string } {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const toDate = fmt(today)

  if (preset === '7d') {
    const from = new Date(today)
    from.setDate(from.getDate() - 6)
    return { from: fmt(from), to: toDate }
  }
  if (preset === '30d') {
    const from = new Date(today)
    from.setDate(from.getDate() - 29)
    return { from: fmt(from), to: toDate }
  }
  if (preset === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1)
    return { from: fmt(from), to: toDate }
  }
  return { from: toDate, to: toDate }
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  debit_card: 'Débito',
  credit_card: 'Crédito',
  installment: 'Fiado',
}

const PAYMENT_COLORS: Record<string, { bar: string; text: string }> = {
  cash: { bar: 'bg-green-500 dark:bg-green-400', text: 'text-green-700 dark:text-green-400' },
  pix: { bar: 'bg-blue-500 dark:bg-blue-400', text: 'text-blue-700 dark:text-blue-400' },
  debit_card: { bar: 'bg-purple-500 dark:bg-purple-400', text: 'text-purple-700 dark:text-purple-400' },
  credit_card: { bar: 'bg-indigo-500 dark:bg-indigo-400', text: 'text-indigo-700 dark:text-indigo-400' },
  installment: { bar: 'bg-amber-500 dark:bg-amber-400', text: 'text-amber-700 dark:text-amber-400' },
}

export default function SalesReport() {
  const [preset, setPreset] = useState<Preset>('7d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const { from, to } = preset !== 'custom'
    ? getPresetDates(preset)
    : { from: customFrom, to: customTo }

  const enabled = !!from && !!to && from <= to

  const { data: report, isPending, isFetching, refetch } = useQuery({
    queryKey: ['sales-report', from, to],
    queryFn: () => getSalesReport(from, to),
    enabled,
  })

  const maxDayTotal = report
    ? Math.max(...report.by_day.map((d) => d.total), 1)
    : 1

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ChartBarIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Relatório de Vendas</h1>
      </div>

      {/* Period picker */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {([
            { value: '7d', label: 'Últimos 7 dias' },
            { value: '30d', label: 'Últimos 30 dias' },
            { value: 'month', label: 'Este mês' },
            { value: 'custom', label: 'Personalizado' },
          ] as { value: Preset; label: string }[]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPreset(value)}
              className={[
                'px-3 py-1.5 text-sm rounded-lg font-medium transition-colors',
                preset === value
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
          {isFetching && (
            <ArrowPathIcon className="w-4 h-4 text-slate-400 dark:text-slate-500 animate-spin ml-1" />
          )}
        </div>

        {preset === 'custom' && (
          <div className="flex items-center gap-3 mt-3">
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">De</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Até</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        )}

        {from && to && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            {formatDate(from)} → {formatDate(to)}
          </p>
        )}
      </div>

      {!enabled && (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <p>Selecione um período para ver o relatório</p>
        </div>
      )}

      {enabled && isPending && (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {enabled && report && (
        <div className="flex flex-col gap-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SummaryCard label="Receita total" value={formatCurrency(report.total_revenue)} accent="green" />
            <SummaryCard label="Pedidos" value={String(report.total_orders)} />
            <SummaryCard label="Ticket médio" value={report.total_orders > 0 ? formatCurrency(report.total_revenue / report.total_orders) : '—'} />
            <SummaryCard label="Cancelamentos" value={String(report.cancelled_orders)} accent="red" />
          </div>

          {/* Payment breakdown */}
          {Object.keys(report.by_payment).length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Por forma de pagamento</h2>
              <div className="flex flex-col gap-3">
                {Object.entries(report.by_payment)
                  .sort(([, a], [, b]) => b.revenue - a.revenue)
                  .map(([type, data]) => {
                    const pct = report.total_revenue > 0
                      ? (data.revenue / report.total_revenue) * 100
                      : 0
                    const colors = PAYMENT_COLORS[type] ?? { bar: 'bg-slate-400', text: 'text-slate-600 dark:text-slate-400' }
                    return (
                      <div key={type}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            {PAYMENT_LABELS[type] ?? type}
                          </span>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="text-slate-400 dark:text-slate-500">{data.count} pedido{data.count !== 1 ? 's' : ''}</span>
                            <span className={`font-semibold tabular-nums ${colors.text}`}>
                              {formatCurrency(data.revenue)}
                            </span>
                          </div>
                        </div>
                        <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${colors.bar} rounded-full transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* By day */}
          {report.by_day.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Por dia</h2>
              <div className="flex flex-col gap-2">
                {report.by_day.map((day) => {
                  const pct = (day.total / maxDayTotal) * 100
                  return (
                    <div key={day.date}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400 w-24 shrink-0">
                          {formatDate(day.date)}
                        </span>
                        <div className="flex-1 mx-3 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 dark:bg-green-400 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-sm">
                          <span className="text-slate-400 dark:text-slate-500 text-xs">{day.orders} pd.</span>
                          <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100 w-24 text-right">
                            {formatCurrency(day.total)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Total do período</span>
                <span className="font-bold text-green-700 dark:text-green-400 tabular-nums">
                  {formatCurrency(report.total_revenue)}
                </span>
              </div>
            </div>
          )}

          {report.total_orders === 0 && (
            <div className="text-center py-8 text-slate-400 dark:text-slate-500">
              <p>Nenhuma venda no período selecionado</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: 'green' | 'red'
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      <p className={[
        'text-xl font-bold tabular-nums',
        accent === 'green' ? 'text-green-700 dark:text-green-400' :
        accent === 'red' ? 'text-red-600 dark:text-red-400' :
        'text-slate-900 dark:text-slate-100',
      ].join(' ')}>
        {value}
      </p>
    </div>
  )
}
