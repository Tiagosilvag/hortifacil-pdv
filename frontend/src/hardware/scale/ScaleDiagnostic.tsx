import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { formatRawLine, parseHex, toHex } from './format'
import { BAUD_RATES, SERIAL_PRESETS } from './models'
import type { ScaleStatus, SerialSettings } from './types'
import { getBrowserSerial, WebSerialTransport } from './webSerial'

const MAX_LINES = 200
const selectClass =
  'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100'

const STATUS_TEXT: Record<ScaleStatus, string> = {
  unsupported: 'Este navegador não lê porta serial. Use o Chrome ou o Edge.',
  disconnected: 'Desconectado',
  connecting: 'Conectando...',
  connected: 'Conectado: escutando a porta',
  error: 'Erro',
}

/**
 * Ferramenta de descoberta: mostra os bytes crus que a balança manda, sem interpretar.
 * Serve para capturar o protocolo real de cada modelo (hexadecimal e ASCII) e para diagnosticar o cabo.
 */
export function ScaleDiagnostic({ disabled }: { disabled: boolean }) {
  const [presetId, setPresetId] = useState(SERIAL_PRESETS[0].id)
  const [settings, setSettings] = useState<SerialSettings>(SERIAL_PRESETS[0].settings)
  const [status, setStatus] = useState<ScaleStatus>('disconnected')
  const [message, setMessage] = useState<string | null>(null)
  const [lines, setLines] = useState<string[]>([])
  const [totalBytes, setTotalBytes] = useState(0)
  const [hexInput, setHexInput] = useState('')
  const [hexError, setHexError] = useState(false)
  const [copied, setCopied] = useState(false)
  const transportRef = useRef<WebSerialTransport | null>(null)

  const addLine = (line: string) => setLines((prev) => [...prev, line].slice(-MAX_LINES))

  useEffect(() => {
    return () => {
      const transport = transportRef.current
      if (transport) {
        void transport.disconnect()
        transport.dispose()
      }
    }
  }, [])

  const choosePreset = (id: string) => {
    setPresetId(id)
    const preset = SERIAL_PRESETS.find((p) => p.id === id)
    if (preset) setSettings(preset.settings)
  }

  const connect = async () => {
    const serial = getBrowserSerial()
    if (!serial) {
      setStatus('unsupported')
      return
    }
    transportRef.current?.dispose()
    const transport = new WebSerialTransport({ serial, settings, driver: null })
    transportRef.current = transport
    transport.subscribe((event) => {
      if (event.type === 'status') {
        setStatus(event.status)
        setMessage(event.message ?? null)
      } else if (event.type === 'raw') {
        setTotalBytes((n) => n + event.chunk.bytes.length)
        addLine(formatRawLine(event.chunk))
      }
    })
    await transport.connect(true)
  }

  const disconnect = async () => {
    await transportRef.current?.disconnect()
  }

  const send = async () => {
    const bytes = parseHex(hexInput)
    if (!bytes) {
      setHexError(true)
      return
    }
    setHexError(false)
    addLine(`${new Date().toLocaleTimeString('pt-BR')}  >> ${toHex(bytes)}`)
    await transportRef.current?.write(bytes)
  }

  const copyLog = async () => {
    await navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const live = status === 'connected' || status === 'connecting'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <h3 className="font-semibold text-slate-900 dark:text-slate-100">Testar balança (diagnóstico)</h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Mostra os bytes que chegam da porta, sem interpretar. Use para capturar o protocolo de cada balança. Depois de
        conectar, coloque um peso conhecido e copie o log.
      </p>

      {disabled && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          A balança já está conectada acima e ocupa a porta. Desconecte-a para testar aqui.
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <label className="col-span-2 text-xs font-medium text-slate-600 dark:text-slate-300 sm:col-span-5">
          Ponto de partida
          <select className={`${selectClass} mt-1`} value={presetId} onChange={(e) => choosePreset(e.target.value)} disabled={live}>
            {SERIAL_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Velocidade
          <select className={`${selectClass} mt-1`} value={settings.baudRate} disabled={live}
            onChange={(e) => setSettings({ ...settings, baudRate: Number(e.target.value) })}>
            {BAUD_RATES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Bits de dados
          <select className={`${selectClass} mt-1`} value={settings.dataBits} disabled={live}
            onChange={(e) => setSettings({ ...settings, dataBits: Number(e.target.value) as 7 | 8 })}>
            <option value={7}>7</option>
            <option value={8}>8</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Stop bits
          <select className={`${selectClass} mt-1`} value={settings.stopBits} disabled={live}
            onChange={(e) => setSettings({ ...settings, stopBits: Number(e.target.value) as 1 | 2 })}>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Paridade
          <select className={`${selectClass} mt-1`} value={settings.parity} disabled={live}
            onChange={(e) => setSettings({ ...settings, parity: e.target.value as SerialSettings['parity'] })}>
            <option value="none">Nenhuma</option>
            <option value="even">Par</option>
            <option value="odd">Ímpar</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {live ? (
          <Button size="sm" variant="secondary" onClick={() => void disconnect()}>Desconectar</Button>
        ) : (
          <Button size="sm" onClick={() => void connect()} disabled={disabled}>Conectar e escutar</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => { setLines([]); setTotalBytes(0) }}>Limpar</Button>
        <Button size="sm" variant="ghost" onClick={() => void copyLog()} disabled={lines.length === 0}>
          {copied ? 'Copiado!' : 'Copiar log'}
        </Button>
        <span className="text-sm text-slate-600 dark:text-slate-300">
          {STATUS_TEXT[status]}
          {message ? `: ${message}` : ''} · {totalBytes} bytes
        </span>
      </div>

      <div className="mt-3 flex items-start gap-2">
        <div className="flex-1">
          <input
            value={hexInput}
            onChange={(e) => { setHexInput(e.target.value); setHexError(false) }}
            placeholder="Comando em hexadecimal, ex.: 05 ou 05 0D"
            className={`${selectClass} font-mono`}
          />
          {hexError && <p className="mt-1 text-xs text-red-600">Hexadecimal inválido (pares de dígitos 0-9 e A-F).</p>}
        </div>
        <Button size="sm" variant="secondary" onClick={() => void send()} disabled={status !== 'connected'}>Enviar</Button>
      </div>

      <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-green-300">
        {lines.length === 0 ? 'Nenhum dado recebido ainda.' : lines.join('\n')}
      </pre>
    </div>
  )
}
