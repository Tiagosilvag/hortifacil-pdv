import { describe, expect, it } from 'vitest'
import { bytes, FakePort, FakeSerial, flush, testDriver } from './testing'
import { WebSerialTransport, type SerialPortInfo } from './webSerial'
import type { TransportEvent } from './types'

function collect(transport: WebSerialTransport) {
  const events: TransportEvent[] = []
  transport.subscribe((event) => events.push(event))
  return {
    events,
    statuses: () => events.flatMap((e) => (e.type === 'status' ? [e.status] : [])),
    readings: () => events.flatMap((e) => (e.type === 'reading' ? [e.reading.weightKg] : [])),
  }
}

const settings = { baudRate: 9600, dataBits: 8 as const, stopBits: 1 as const, parity: 'none' as const }

describe('WebSerialTransport', () => {
  it('abre a porta já autorizada sem perguntar e converte bytes em leituras', async () => {
    const port = new FakePort()
    const serial = new FakeSerial([port])
    const transport = new WebSerialTransport({ serial, settings, driver: testDriver() })
    const seen = collect(transport)

    await transport.connect(false)
    port.push('1.250;S\n0.500;I\n')
    await flush()

    expect(seen.statuses()).toEqual(['connecting', 'connected'])
    expect(seen.readings()).toEqual([1.25, 0.5])
    expect(seen.events.filter((e) => e.type === 'raw')).toHaveLength(1)
    await transport.disconnect()
  })

  it('emite só bytes crus quando não há driver (modo diagnóstico)', async () => {
    const port = new FakePort()
    const transport = new WebSerialTransport({ serial: new FakeSerial([port]), settings, driver: null })
    const seen = collect(transport)
    await transport.connect(false)
    port.push('qualquer coisa')
    await flush()
    expect(seen.readings()).toEqual([])
    expect(seen.events.some((e) => e.type === 'raw')).toBe(true)
    await transport.disconnect()
  })

  it('conta mensagens corrompidas como descartadas e segue lendo', async () => {
    const port = new FakePort()
    const transport = new WebSerialTransport({ serial: new FakeSerial([port]), settings, driver: testDriver() })
    const seen = collect(transport)
    await transport.connect(false)
    port.push('###\n2.000;S\n')
    await flush()
    expect(seen.events).toContainEqual({ type: 'discarded', count: 1 })
    expect(seen.readings()).toEqual([2])
    await transport.disconnect()
  })

  it('usa o filtro de estabilidade quando a balança não informa estável', async () => {
    const port = new FakePort()
    const driver = testDriver({
      createParser: () => ({ push: (chunk) => ({ frames: [{ weightKg: Number(new TextDecoder().decode(chunk)), stable: null }], discarded: 0 }) }),
    })
    const transport = new WebSerialTransport({ serial: new FakeSerial([port]), settings, driver, stabilityRequired: 2 })
    const flags: boolean[] = []
    transport.subscribe((e) => { if (e.type === 'reading') flags.push(e.reading.stable) })
    await transport.connect(false)
    for (const text of ['1.5', '1.5', '1.6']) { port.push(text); await flush() }
    expect(flags).toEqual([false, true, false])
    await transport.disconnect()
  })

  it('sem porta autorizada e sem clique do operador, não abre nada', async () => {
    const transport = new WebSerialTransport({ serial: new FakeSerial([]), settings, driver: testDriver() })
    const seen = collect(transport)
    await transport.connect(false)
    expect(seen.statuses()).toEqual(['connecting', 'disconnected'])
  })

  it('com clique do operador, pede a porta ao navegador e guarda a escolhida', async () => {
    const port = new FakePort({ usbVendorId: 7, usbProductId: 9 })
    let selected: SerialPortInfo | null = null
    const transport = new WebSerialTransport({
      serial: new FakeSerial([], port), settings, driver: testDriver(), onPortSelected: (info) => { selected = info },
    })
    await transport.connect(true)
    expect(port.opened).toBe(1)
    expect(selected).toEqual({ usbVendorId: 7, usbProductId: 9 })
    await transport.disconnect()
  })

  it('operador fecha a janela de escolha: volta a desconectada, sem erro', async () => {
    const transport = new WebSerialTransport({ serial: new FakeSerial([], 'cancel'), settings, driver: testDriver() })
    const seen = collect(transport)
    await transport.connect(true)
    expect(seen.statuses()).toEqual(['connecting', 'disconnected'])
    expect(seen.events).toContainEqual({ type: 'status', status: 'disconnected', message: 'Nenhuma porta selecionada.' })
  })

  it('escolhe a porta autorizada que bate com o vendor/product salvo', async () => {
    const other = new FakePort({ usbVendorId: 1, usbProductId: 1 })
    const mine = new FakePort({ usbVendorId: 5, usbProductId: 6 })
    const transport = new WebSerialTransport({
      serial: new FakeSerial([other, mine]), settings, driver: testDriver(), portFilter: { usbVendorId: 5, usbProductId: 6 },
    })
    await transport.connect(false)
    expect(other.opened).toBe(0)
    expect(mine.opened).toBe(1)
    await transport.disconnect()
  })

  it('cabo puxado: avisa "desconectada"; ao voltar, reconecta sozinho e retoma as leituras', async () => {
    const port = new FakePort()
    const serial = new FakeSerial([port])
    const transport = new WebSerialTransport({ serial, settings, driver: testDriver() })
    const seen = collect(transport)
    await transport.connect(false)
    port.push('1.000;S\n')
    await flush()

    port.unplug()
    await flush()
    expect(seen.statuses().at(-1)).toBe('disconnected')
    expect(seen.events).toContainEqual({ type: 'status', status: 'disconnected', message: 'Balança desconectada.' })

    serial.emitConnect() // cabo de volta
    await flush()
    port.push('2.000;S\n')
    await flush()
    expect(seen.statuses().at(-1)).toBe('connected')
    expect(seen.readings()).toEqual([1, 2])
    expect(port.opened).toBe(2)
    await transport.disconnect()
  })

  it('depois de disconnect() não reconecta sozinho quando o cabo volta', async () => {
    const port = new FakePort()
    const serial = new FakeSerial([port])
    const transport = new WebSerialTransport({ serial, settings, driver: testDriver() })
    await transport.connect(false)
    await transport.disconnect()
    serial.emitConnect()
    await flush()
    expect(port.opened).toBe(1)
    expect(port.closed).toBe(1)
  })

  it('protocolo "a pedido": envia o comando de solicitação periodicamente', async () => {
    const port = new FakePort()
    const driver = testDriver({ pollRequest: bytes('P'), pollIntervalMs: 10 })
    const transport = new WebSerialTransport({ serial: new FakeSerial([port]), settings, driver })
    await transport.connect(false)
    await new Promise((resolve) => setTimeout(resolve, 55))
    await transport.disconnect()
    expect(port.written.length).toBeGreaterThanOrEqual(3)
    expect(port.written.every((text) => text === 'P')).toBe(true)
  })

  it('erro ao abrir a porta (em uso) vira status "error" com mensagem em português', async () => {
    const port = new FakePort()
    port.open = async () => { throw Object.assign(new Error('busy'), { name: 'InvalidStateError' }) }
    const transport = new WebSerialTransport({ serial: new FakeSerial([port]), settings, driver: testDriver() })
    const seen = collect(transport)
    await transport.connect(false)
    const last = seen.events.at(-1)
    expect(last).toMatchObject({ type: 'status', status: 'error' })
    expect((last as { message?: string }).message).toContain('em uso')
  })

  it('dispose() solta o listener de conexão da porta', () => {
    const serial = new FakeSerial([])
    const transport = new WebSerialTransport({ serial, settings, driver: null })
    expect(serial.listeners.size).toBe(1)
    transport.dispose()
    expect(serial.listeners.size).toBe(0)
  })
})
