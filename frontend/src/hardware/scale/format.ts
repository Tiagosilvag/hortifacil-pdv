import type { RawChunk } from './types'

/** [0x31, 0x2e] -> "31 2e" */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ')
}

/** Caracteres imprimíveis como estão; CR/LF/STX/ETX visíveis; o resto vira ".". */
export function toAscii(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => {
    if (byte === 0x0d) return '\\r'
    if (byte === 0x0a) return '\\n'
    if (byte === 0x02) return '<STX>'
    if (byte === 0x03) return '<ETX>'
    return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.'
  }).join('')
}

/** "05 0d" ou "050d" -> bytes; texto inválido -> null. */
export function parseHex(text: string): Uint8Array | null {
  const compact = text.replace(/\s+/g, '')
  if (compact.length === 0 || compact.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(compact)) return null
  const bytes = new Uint8Array(compact.length / 2)
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(compact.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

function clock(at: number): string {
  const d = new Date(at)
  const pad = (n: number, size = 2) => String(n).padStart(size, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

/** Uma linha do log de diagnóstico: hora, hexadecimal e ASCII. */
export function formatRawLine(chunk: RawChunk): string {
  return `${clock(chunk.at)}  ${toHex(chunk.bytes)}  |${toAscii(chunk.bytes)}|`
}

/** Limite do log do diagnóstico: uma captura de 10 s a 2400 bps passa de mil linhas. */
export const LOG_MAX_LINES = 5000

/** Acrescenta uma linha ao log; passando do limite, descarta as mais antigas e informa quantas (nunca em silêncio). */
export function appendLog(lines: string[], line: string, max: number = LOG_MAX_LINES): { lines: string[]; dropped: number } {
  const next = [...lines, line]
  const dropped = Math.max(0, next.length - max)
  return { lines: dropped > 0 ? next.slice(dropped) : next, dropped }
}
