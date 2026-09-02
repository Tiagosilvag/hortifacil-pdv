import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSalesReport } from '@/api/reports'
import { formatCurrency, formatPayment } from '@/utils/format'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function monthStart(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const PRESETS = [
  { label: 'Hoje', from: today, to: today },
  { label: 'Este mês', from: monthStart, to: today },
] as const

export default function SalesReport() {
  const [dateFrom, setDateFrom] = useState(monthStart())
  const [dateTo, setDateTo] = useState(today())
  const [submitted, setSubmitted] = useState<{ from: string; to: string } | null>({
    from: monthStart(),
    to: today(),
  })

  const { data: report, isPending, isError } = useQuery({
    queryKey: ['reports', 'sales', submitted?.from, submitted?.to],
    queryFn: () => getSalesReport(submitted!.from, submitted!.to),
    enabled: !!submitted,
  })

  function applyPreset(from: () => string, to: () => string) {
    const f = from()
    const t = to()
    setDateFrom(f)
    setDateTo(t)
    setSubmitted({ from: f, to: t })
  }

  function handleSearch() {
    setSubmitted({ from: dateFrom, to: dateTo })
  }

  const maxDay = report?.by_day.reduce((m, d) => Math.max(m, Number(d.total)), 0) ?? 0

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Relatório de Vendas</h1>
        <p className="text-sm text-slate-500 mt-0.5">Análise de vendas por período</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">De</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Até</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-green-700 text-white text-sm font-medium rounded-lg hover:bg-green-800 transition-colors"
          >
            Buscar
          </button>
          <div className="flex gap-2 ml-auto">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.from, p.to)}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:border-slate-400 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isPending && (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          Erro ao carregar relatório. Verifique as datas e tente novamente.
        </div>
      )}

      {report && !isPending && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <SummaryCard label="Total de Vendas" value={formatCurrency(report.total)} accent="green" />
            <SummaryCard label="Nº de Pedidos" value={String(report.count)} />
            <SummaryCard label="Ticket Médio" value={formatCurrency(report.avg_ticket)} />
            <SummaryCard label="Cancelados" value={String(report.cancelled_count)} accent={report.cancelled_count > 0 ? 'red' : undefined} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* By payment */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Por forma de pagamento</h2>
              {report.by_payment.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">Sem dados</p>
              ) : (
                <div className="space-y-2">
                  {report.by_payment
                    .sort((a, b) => Number(b.total) - Number(a.total))
                    .map((p) => {
                      const pct = report.total > 0 ? (Number(p.total) / Number(report.total)) * 100 : 0
                      return (
                        <div key={p.payment_type}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs text-slate-600">{formatPayment(p.payment_type)}</span>
                            <span className="text-xs tabular-nums text-slate-900 font-medium">
                              {formatCurrency(p.total)} <span className="text-slate-400">({p.count})</span>
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5">
                            <div
                              className="bg-green-600 h-1.5 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>

            {/* By day */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Por dia</h2>
              {report.by_day.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">Sem dados</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {report.by_day.map((d) => {
                    const pct = maxDay > 0 ? (Number(d.total) / maxDay) * 100 : 0
                    const dateLabel = new Intl.DateTimeFormat('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                    }).format(new Date(d.day + 'T12:00:00'))
                    return (
                      <div key={d.day}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs text-slate-500">{dateLabel}</span>
                          <span className="text-xs tabular-nums text-slate-900 font-medium">
                            {formatCurrency(d.total)} <span className="text-slate-400">({d.count})</span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div
                            className="bg-green-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
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
  const valueClass =
    accent === 'green'
      ? 'text-green-700'
      : accent === 'red'
      ? 'text-red-600'
      : 'text-slate-900'

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  )
}
