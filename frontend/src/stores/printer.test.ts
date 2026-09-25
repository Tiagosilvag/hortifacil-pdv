import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PRINTER_CONFIG, usePrinterSettings } from './printer'

describe('configuração da impressora', () => {
  beforeEach(() => {
    usePrinterSettings.setState({ ...DEFAULT_PRINTER_CONFIG })
  })

  it('por padrão não imprime sozinho (só depois de o caixa ser configurado), em bobina de 80 mm', () => {
    const state = usePrinterSettings.getState()
    expect(state.enabled).toBe(false)
    expect(state.paperWidthMm).toBe(80)
    expect(state.storeName).toBe('')
    expect(state.footer).toBe('Obrigado! Volte sempre.')
  })

  it('update() muda só o que foi informado', () => {
    usePrinterSettings.getState().update({ enabled: true, storeName: 'GALEGO HORTIFRUTI' })
    const state = usePrinterSettings.getState()
    expect(state).toMatchObject({ enabled: true, storeName: 'GALEGO HORTIFRUTI', paperWidthMm: 80, footer: 'Obrigado! Volte sempre.' })
  })

  it('serve direto como configuração do cupom (nome, endereço, telefone, rodapé e largura)', () => {
    const { storeName, address, phone, footer, paperWidthMm } = usePrinterSettings.getState()
    expect({ storeName, address, phone, footer, paperWidthMm }).toEqual({
      storeName: '', address: '', phone: '', footer: 'Obrigado! Volte sempre.', paperWidthMm: 80,
    })
  })
})
