# Impressora Epson: cupom do pedido, configuração por caixa e integração no PDV — Plano de Implementação (B3a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Imprimir o cupom do pedido (comprovante não fiscal) na impressora Epson do caixa, pelo navegador e pelo driver do Windows, com configuração por caixa, página de teste e botões de imprimir e reimprimir, sem mudar o backend.

**Architecture:** O cupom é uma lista de blocos (`Receipt`) independente do meio de impressão. `buildOrderReceipt(order, config)` monta o cupom do pedido; `renderReceiptHtml` o transforma em HTML/CSS na largura da bobina; `printHtml` manda para a impressora padrão do Windows por um iframe oculto. A configuração (largura, imprimir ao confirmar, cabeçalho, rodapé) fica por caixa no navegador (Zustand). A aba "Impressora" em Configurações tem o botão "Imprimir teste". O PDV imprime ao confirmar e oferece "Imprimir cupom"; a tela do pedido oferece "Reimprimir cupom".

**Tech Stack:** React 18, TypeScript estrito, Vite 5.4, Zustand 4, Vitest 2.1.x (já instalado no projeto), `window.print()` via iframe.

**Spec:** `docs/superpowers/specs/2026-09-25-impressora-epson-design.md` (aprovada). Este plano cobre os itens 1 a 4 da ordem de entrega do §7; o **portão de hardware** (item 5: configurar a Epson em um caixa e testar) é feito pelo usuário e os ajustes de layout vêm depois, da impressão real.

## Global Constraints

- **Só frontend.** Nenhuma mudança no backend, no banco ou em endpoints. O cupom sai do pedido completo que o `createOrder` e o `getOrder` já devolvem.
- **Configuração por caixa, no navegador** (Zustand persistido, chave `pdv-printer`). Nada vai para o servidor.
- **Cupom NÃO fiscal:** sempre com "CUPOM NÃO FISCAL" em destaque. Pedido cancelado sai com "*** CANCELADO ***" antes disso.
- **Valores da API chegam como texto** (`Decimal` vira string em JSON): todo valor numérico do pedido passa por `Number()` antes de qualquer conta ou formatação.
- **Texto do usuário nunca vira HTML:** nome de produto, cliente, observação e cabeçalho passam por `escapeHtml`.
- **Imprimir nunca atrasa nem impede o registro do pedido:** a impressão roda depois do `setSuccess(true)` e qualquer falha vira `console.error`, nunca exceção.
- **Impressão por padrão desligada** (`enabled: false`), em bobina de **80 mm**; 58 mm é opção.
- **Preto no branco sempre**, ignorando o tema escuro do sistema. Sem QR Code e sem código de barras (entram no sub-projeto C).
- **TypeScript estrito:** `noUnusedLocals` e `noUnusedParameters` ligados; `npx tsc -b` precisa sair **sem nenhum erro** ao fim de toda tarefa.
- **Não instalar dependências novas.**
- **Fora do escopo:** comprovante de fiado com assinatura, recibo de recebimento de fiado, fechamento de caixa, ESC/POS e agente local, cupom fiscal (NFC-e).
- **Nada de deploy sem o "pode fazer o deploy" explícito do usuário** (regra do projeto). Este plano não aciona o Coolify.
- **Arquivos de outra pessoa na árvore:** `frontend/src/pages/orders/NewOrder.tsx` costuma ter uma **alteração não commitada do usuário** (estilo de hover nos botões de pagamento) e `.impeccable/config.json` também. Nunca use `git add .` nem `git add -A`; na Task 4 o `NewOrder.tsx` é tratado com `git stash` para não misturar as alterações.
- Commits terminam com a linha `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Ambiente: comandos para o Git Bash, na raiz do repositório, salvo indicação. Comandos do frontend rodam em `frontend/`.

## Review Focus

Falhas que a spec implica e que mais provavelmente vão afetar quem usa. Cada uma tem teste na tarefa dona.

1. **Nome de produto ou observação com caracteres de HTML** (`<`, `&`, aspas) não pode virar HTML nem quebrar o cupom. → `nome de produto com HTML não vira HTML` (Task 2).
2. **Valores como texto da API** (`"8.63"`) não podem virar `NaN` no cupom. → `valores que chegam como texto da API (Decimal) viram número` (Task 1).
3. **Reimpressão de pedido cancelado** deve sair claramente como cancelada, para não ser confundida com uma venda válida. → `pedido cancelado sai com CANCELADO antes de "CUPOM NÃO FISCAL"` (Task 1).
4. **Campos vazios** (cabeçalho, cliente, observação, código de produto de pedidos antigos) não deixam linhas em branco nem escrevem "undefined" ou "null". → `cabeçalho vazio não deixa linhas em branco no topo`, `item sem código de produto` e `observação só aparece quando existe` (Task 1).
5. **Falha ao imprimir** (sem impressora, iframe bloqueado) não pode derrubar o PDV nem o registro do pedido. → `nunca lança: o pedido já está salvo...` (Task 2) e o roteiro de verificação da Task 4.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `frontend/src/hardware/printer/receipt.ts` | Tipos do cupom: `Receipt` e `ReceiptBlock` (texto, linha de duas colunas, separador, espaço, corte) |
| `.../orderReceipt.ts` | `buildOrderReceipt`, `buildTestReceipt`, `formatQty`, `ReceiptConfig` (o layout do cupom) |
| `.../renderHtml.ts` | `renderReceiptHtml` e `escapeHtml`: cupom → documento HTML/CSS na largura da bobina |
| `.../print.ts` | `printHtml`: iframe oculto + `window.print()` |
| `.../printOrder.ts` | `printOrderReceipt`, `printTestPage`, `PrinterSettings` (nunca lançam) |
| `frontend/src/stores/printer.ts` | Configuração por caixa (`usePrinterSettings`, `DEFAULT_PRINTER_CONFIG`) |
| `frontend/src/pages/settings/PrinterTab.tsx` | Aba "Impressora" (campos, teste, instruções) |
| `Settings.tsx`, `NewOrder.tsx`, `OrderDetail.tsx` (modificar) | Ligar a aba; imprimir ao confirmar e "Imprimir cupom"; "Reimprimir cupom" |
| `docs/hardware/impressora-epson.md` | Roteiro de instalação da Epson por caixa e checklist do teste |

---

### Task 1: Estrutura do cupom e cupom do pedido

**Files:**
- Create: `frontend/src/hardware/printer/receipt.ts`
- Create: `frontend/src/hardware/printer/orderReceipt.ts`
- Test: `frontend/src/hardware/printer/orderReceipt.test.ts`

**Interfaces:**
- Consumes: `Order`, `OrderItem` de `@/types`; `formatCurrency`, `formatDate`, `formatPayment`, `formatUnit` de `@/utils/format`.
- Produces:
  - `receipt.ts`: `Align`, `ReceiptBlock` (`text {text, align?, bold?, size?}`, `row {left, right, bold?}`, `divider`, `blank`, `cut`), `Receipt {blocks}`
  - `orderReceipt.ts`: `ReceiptConfig {storeName, address, phone, footer}`; `formatQty(qty: number, unitType: string): string`; `buildOrderReceipt(order: Order, config: ReceiptConfig): Receipt`; `buildTestReceipt(config: ReceiptConfig, widthMm: 58 | 80): Receipt`

- [ ] **Step 1: Escrever o teste que falha**

Create `frontend/src/hardware/printer/orderReceipt.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import type { Order, OrderItem } from '@/types'
import { formatCurrency, formatDate } from '@/utils/format'
import { buildOrderReceipt, buildTestReceipt, formatQty, type ReceiptConfig } from './orderReceipt'
import type { Receipt } from './receipt'

const config: ReceiptConfig = {
  storeName: 'GALEGO HORTIFRUTI',
  address: 'Rua Exemplo, 100 - Centro',
  phone: '(81) 3333-4444',
  footer: 'Obrigado! Volte sempre.',
}

const item = (overrides: Partial<OrderItem> = {}): OrderItem => ({
  id: 'i1', product_id: 'p1', product_name: 'BANANA PRATA KG', product_code: 21, barcode: null,
  unit_type: 'kg', qty: 1.235, unit_price: 6.99, subtotal: 8.63, ...overrides,
})

const order = (overrides: Partial<Order> = {}): Order => ({
  id: 'o1', order_number: 42, customer_id: null, customer: null, total: 8.63, discount: 0,
  payment_type: 'cash', payment_splits: null, status: 'delivered', notes: null,
  invoice_number: null, invoice_series: null, invoice_key: null,
  created_by_name: 'Admin', created_at: '2026-09-25T15:30:00Z', items: [item()], ...overrides,
})

/** Uma linha de texto por bloco, para conferir o conteúdo sem depender do HTML. */
const lines = (receipt: Receipt): string[] =>
  receipt.blocks.flatMap((b) => {
    if (b.type === 'text') return [b.text]
    if (b.type === 'row') return [`${b.left} | ${b.right}`]
    return []
  })

describe('formatQty', () => {
  it('kg sempre com 3 casas; inteiros sem casas; fracionados sem zeros à direita', () => {
    expect(formatQty(1.235, 'kg')).toBe('1,235')
    expect(formatQty(2, 'kg')).toBe('2,000')
    expect(formatQty(3, 'unit')).toBe('3')
    expect(formatQty(2.5, 'unit')).toBe('2,5')
  })
})

describe('buildOrderReceipt', () => {
  it('cabeçalho do comércio centralizado, seguido de "CUPOM NÃO FISCAL"', () => {
    const { blocks } = buildOrderReceipt(order(), config)
    expect(blocks[0]).toEqual({ type: 'text', text: 'GALEGO HORTIFRUTI', align: 'center', bold: true, size: 'large' })
    expect(lines(buildOrderReceipt(order(), config)).slice(0, 4)).toEqual([
      'GALEGO HORTIFRUTI', 'Rua Exemplo, 100 - Centro', '(81) 3333-4444', 'CUPOM NÃO FISCAL',
    ])
    expect(blocks.find((b) => b.type === 'text' && b.text === 'CUPOM NÃO FISCAL')).toMatchObject({ align: 'center', bold: true })
  })

  it('cabeçalho vazio não deixa linhas em branco no topo', () => {
    const empty = { storeName: '', address: '  ', phone: '', footer: '' }
    expect(buildOrderReceipt(order(), empty).blocks[0]).toMatchObject({ type: 'text', text: 'CUPOM NÃO FISCAL' })
  })

  it('pedido, data, operador e cliente (só quando há cliente)', () => {
    const without = lines(buildOrderReceipt(order(), config))
    expect(without).toContain('Pedido nº | 42')
    expect(without).toContain(`Data | ${formatDate('2026-09-25T15:30:00Z')}`)
    expect(without).toContain('Operador | Admin')
    expect(without.some((l) => l.startsWith('Cliente'))).toBe(false)

    const customer = { id: 'c1', name: 'MARIA SILVA', is_blocked: false, balance_due: 0 } as unknown as Order['customer']
    expect(lines(buildOrderReceipt(order({ customer }), config))).toContain('Cliente | MARIA SILVA')
  })

  it('item: código e nome em uma linha, e "quantidade x preço" com o total na outra', () => {
    const out = lines(buildOrderReceipt(order(), config))
    expect(out).toContain('021 BANANA PRATA KG')
    expect(out).toContain(`1,235 kg x ${formatCurrency(6.99)} | ${formatCurrency(8.63)}`)
  })

  it('item sem código de produto (pedidos antigos) sai só com o nome; unidade não é kg', () => {
    const out = lines(buildOrderReceipt(order({ items: [item({ product_code: null, product_name: 'OVOS', unit_type: 'unit', qty: 3, unit_price: 12, subtotal: 36 })], total: 36 }), config))
    expect(out).toContain('OVOS')
    expect(out).toContain(`3 un x ${formatCurrency(12)} | ${formatCurrency(36)}`)
  })

  it('valores que chegam como texto da API (Decimal) viram número', () => {
    const asText = item({ qty: '1.235' as unknown as number, unit_price: '6.99' as unknown as number, subtotal: '8.63' as unknown as number })
    const out = lines(buildOrderReceipt(order({ items: [asText], total: '8.63' as unknown as number }), config))
    expect(out).toContain(`1,235 kg x ${formatCurrency(6.99)} | ${formatCurrency(8.63)}`)
    expect(out).toContain(`TOTAL | ${formatCurrency(8.63)}`)
  })

  it('desconto: mostra subtotal e desconto; sem desconto, só o TOTAL', () => {
    const noDiscount = lines(buildOrderReceipt(order(), config))
    expect(noDiscount.some((l) => l.startsWith('Subtotal') || l.startsWith('Desconto'))).toBe(false)

    const withDiscount = lines(buildOrderReceipt(order({ discount: 3, total: 5.63 }), config))
    expect(withDiscount).toContain(`Subtotal | ${formatCurrency(8.63)}`)
    expect(withDiscount).toContain(`Desconto | -${formatCurrency(3)}`)
    expect(withDiscount).toContain(`TOTAL | ${formatCurrency(5.63)}`)
  })

  it('TOTAL em negrito', () => {
    const total = buildOrderReceipt(order(), config).blocks.find((b) => b.type === 'row' && b.left === 'TOTAL')
    expect(total).toMatchObject({ bold: true })
  })

  it('pagamento único usa a forma do pedido; pagamento dividido lista cada parte', () => {
    expect(lines(buildOrderReceipt(order({ payment_type: 'pix' }), config))).toContain(`Pix | ${formatCurrency(8.63)}`)

    const split = order({
      payment_type: 'mixed', total: 30,
      payment_splits: [{ type: 'cash', amount: 20 }, { type: 'pix', amount: '10.00' as unknown as number }],
    })
    const out = lines(buildOrderReceipt(split, config))
    expect(out).toContain(`Dinheiro | ${formatCurrency(20)}`)
    expect(out).toContain(`Pix | ${formatCurrency(10)}`)
  })

  it('pedido cancelado sai com CANCELADO antes de "CUPOM NÃO FISCAL"', () => {
    const out = lines(buildOrderReceipt(order({ status: 'cancelled' }), config))
    expect(out.indexOf('*** CANCELADO ***')).toBeGreaterThan(-1)
    expect(out.indexOf('*** CANCELADO ***')).toBeLessThan(out.indexOf('CUPOM NÃO FISCAL'))
    expect(lines(buildOrderReceipt(order(), config))).not.toContain('*** CANCELADO ***')
  })

  it('observação só aparece quando existe', () => {
    expect(lines(buildOrderReceipt(order({ notes: 'Entregar à tarde' }), config))).toContain('Obs.: Entregar à tarde')
    expect(lines(buildOrderReceipt(order({ notes: '  ' }), config)).some((l) => l.startsWith('Obs.'))).toBe(false)
  })

  it('rodapé configurável e o cupom termina com o corte', () => {
    const { blocks } = buildOrderReceipt(order(), config)
    expect(lines({ blocks })).toContain('Obrigado! Volte sempre.')
    expect(blocks.at(-1)).toEqual({ type: 'cut' })
    expect(lines(buildOrderReceipt(order(), { ...config, footer: '' }))).not.toContain('Obrigado! Volte sempre.')
  })
})

describe('buildTestReceipt', () => {
  it('traz régua de largura, acentos e um nome longo para conferir a impressão', () => {
    const out = lines(buildTestReceipt(config, 80))
    expect(out).toContain('TESTE DE IMPRESSÃO')
    expect(out).toContain('Largura configurada: 80 mm')
    expect(out.some((l) => l.includes('ÁÉÍÓÚ') && l.includes('ãõç'))).toBe(true)
    expect(out.some((l) => l.length > 40 && /LONGO/.test(l))).toBe(true)
    expect(out.some((l) => /^(1234567890)+$/.test(l))).toBe(true)
  })

  it('a régua muda com a largura de 58 mm', () => {
    expect(lines(buildTestReceipt(config, 58))).toContain('Largura configurada: 58 mm')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd frontend && npx vitest run src/hardware/printer/orderReceipt.test.ts; cd ..
```
Expected: FAIL (`Failed to load url ./orderReceipt`).

- [ ] **Step 3: Implementar**

Create `frontend/src/hardware/printer/receipt.ts`:

```typescript
export type Align = 'left' | 'center' | 'right'

/**
 * O cupom como lista de blocos, independente de como vai ser impresso.
 * Hoje um renderizador HTML (renderHtml.ts) manda para a impressora do Windows;
 * um renderizador ESC/POS para um agente local poderia usar a mesma estrutura.
 * O cupom fiscal (sub-projeto C) acrescentará blocos de QR Code e de código de barras.
 */
export type ReceiptBlock =
  | { type: 'text'; text: string; align?: Align; bold?: boolean; size?: 'normal' | 'large' }
  /** Duas colunas: descrição à esquerda, valor à direita. */
  | { type: 'row'; left: string; right: string; bold?: boolean }
  | { type: 'divider' }
  | { type: 'blank' }
  /** Corte do papel. No navegador quem corta é o driver da impressora; só um renderizador ESC/POS usa este bloco. */
  | { type: 'cut' }

export interface Receipt {
  blocks: ReceiptBlock[]
}
```

Create `frontend/src/hardware/printer/orderReceipt.ts`:

```typescript
import type { Order, OrderItem } from '@/types'
import { formatCurrency, formatDate, formatPayment, formatUnit } from '@/utils/format'
import type { Receipt, ReceiptBlock } from './receipt'

/** Dados do comércio e rodapé. O sistema não tem cadastro do comércio: ficam na configuração da impressora de cada caixa. */
export interface ReceiptConfig {
  storeName: string
  address: string
  phone: string
  footer: string
}

/** Quantidade como no PDV: kg com 3 casas, inteiros sem casas, fracionados sem zeros à direita. */
export function formatQty(qty: number, unitType: string): string {
  const isKg = unitType === 'kg'
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: isKg ? 3 : 0,
    maximumFractionDigits: isKg || !Number.isInteger(qty) ? 3 : 0,
  }).format(qty)
}

const row = (left: string, right: string): ReceiptBlock => ({ type: 'row', left, right })

function headerBlocks(config: ReceiptConfig): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = []
  if (config.storeName.trim()) {
    blocks.push({ type: 'text', text: config.storeName.trim(), align: 'center', bold: true, size: 'large' })
  }
  for (const line of [config.address, config.phone]) {
    if (line.trim()) blocks.push({ type: 'text', text: line.trim(), align: 'center' })
  }
  if (blocks.length > 0) blocks.push({ type: 'blank' })
  return blocks
}

function footerBlocks(config: ReceiptConfig): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = [{ type: 'blank' }]
  if (config.footer.trim()) blocks.push({ type: 'text', text: config.footer.trim(), align: 'center' }, { type: 'blank' })
  blocks.push({ type: 'cut' })
  return blocks
}

function itemBlocks(item: OrderItem): ReceiptBlock[] {
  const code = item.product_code != null ? `${String(item.product_code).padStart(3, '0')} ` : ''
  const quantity = `${formatQty(Number(item.qty), item.unit_type)} ${formatUnit(item.unit_type)} x ${formatCurrency(Number(item.unit_price))}`
  return [
    { type: 'text', text: `${code}${item.product_name}`, bold: true },
    row(quantity, formatCurrency(Number(item.subtotal))),
  ]
}

function paymentLines(order: Order): { type: string; amount: number }[] {
  if (order.payment_splits && order.payment_splits.length > 0) {
    return order.payment_splits.map((split) => ({ type: split.type, amount: Number(split.amount) }))
  }
  return [{ type: order.payment_type, amount: Number(order.total) }]
}

/** Cupom do pedido (comprovante NÃO fiscal). Os valores da API chegam como texto (Decimal), então tudo passa por Number(). */
export function buildOrderReceipt(order: Order, config: ReceiptConfig): Receipt {
  const blocks: ReceiptBlock[] = headerBlocks(config)

  if (order.status === 'cancelled') {
    blocks.push({ type: 'text', text: '*** CANCELADO ***', align: 'center', bold: true, size: 'large' })
  }
  blocks.push({ type: 'text', text: 'CUPOM NÃO FISCAL', align: 'center', bold: true }, { type: 'divider' })

  blocks.push(row('Pedido nº', String(order.order_number)), row('Data', formatDate(order.created_at)), row('Operador', order.created_by_name))
  if (order.customer?.name) blocks.push(row('Cliente', order.customer.name))
  blocks.push({ type: 'divider' })

  for (const item of order.items) blocks.push(...itemBlocks(item))
  blocks.push({ type: 'divider' })

  const discount = Number(order.discount) || 0
  if (discount > 0) {
    const subtotal = order.items.reduce((sum, item) => sum + Number(item.subtotal), 0)
    blocks.push(row('Subtotal', formatCurrency(subtotal)), row('Desconto', `-${formatCurrency(discount)}`))
  }
  blocks.push({ type: 'row', left: 'TOTAL', right: formatCurrency(Number(order.total)), bold: true })

  blocks.push({ type: 'divider' }, { type: 'text', text: 'PAGAMENTO', bold: true })
  for (const payment of paymentLines(order)) blocks.push(row(formatPayment(payment.type), formatCurrency(payment.amount)))

  if (order.notes?.trim()) blocks.push({ type: 'divider' }, { type: 'text', text: `Obs.: ${order.notes.trim()}` })

  blocks.push(...footerBlocks(config))
  return { blocks }
}

/** Página de teste: régua de largura, acentos e um nome longo, para acertar o papel, o driver e a largura do caixa. */
export function buildTestReceipt(config: ReceiptConfig, widthMm: 58 | 80): Receipt {
  const blocks: ReceiptBlock[] = [
    ...headerBlocks(config),
    { type: 'text', text: 'TESTE DE IMPRESSÃO', align: 'center', bold: true },
    { type: 'divider' },
    { type: 'text', text: `Largura configurada: ${widthMm} mm` },
    { type: 'text', text: '1234567890'.repeat(5) },
    { type: 'text', text: 'Acentos: ÁÉÍÓÚ áéíóú ãõç ÂÊÔ' },
    { type: 'divider' },
    { type: 'text', text: 'PRODUTO COM UM NOME MUITO LONGO PARA CONFERIR A QUEBRA DE LINHA NO CUPOM', bold: true },
    row('1,235 kg x R$ 6,99', 'R$ 8,63'),
    { type: 'row', left: 'TOTAL', right: 'R$ 8,63', bold: true },
    ...footerBlocks(config),
  ]
  return { blocks }
}
```

- [ ] **Step 4: Rodar e ver passar, e checar os tipos**

```bash
cd frontend && npx vitest run && npx tsc -b; cd ..
```
Expected: `109 passed` (94 já existentes + 15 novos) e `tsc` sem saída (sem erros).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hardware/printer/receipt.ts frontend/src/hardware/printer/orderReceipt.ts frontend/src/hardware/printer/orderReceipt.test.ts
git commit -m "feat(impressora): estrutura do cupom e cupom do pedido"
```

---

### Task 2: Renderizador HTML e envio para imprimir

**Files:**
- Create: `frontend/src/hardware/printer/renderHtml.ts`
- Create: `frontend/src/hardware/printer/print.ts`
- Create: `frontend/src/hardware/printer/printOrder.ts`
- Test: `frontend/src/hardware/printer/renderHtml.test.ts`
- Test: `frontend/src/hardware/printer/printOrder.test.ts`

**Interfaces:**
- Consumes: `Receipt`, `ReceiptBlock` (Task 1); `buildOrderReceipt`, `buildTestReceipt`, `ReceiptConfig` (Task 1).
- Produces:
  - `renderHtml.ts`: `RenderOptions {widthMm: 58 | 80}`, `escapeHtml(text): string`, `renderReceiptHtml(receipt, options): string`
  - `print.ts`: `printHtml(html: string): void` (iframe oculto, `window.print()`, limpa depois)
  - `printOrder.ts`: `PrinterSettings extends ReceiptConfig {paperWidthMm: 58 | 80}`; `printOrderReceipt(order: Order, settings: PrinterSettings): void`; `printTestPage(settings: PrinterSettings): void` (ambos **nunca lançam**: falha vira `console.error`)

- [ ] **Step 1: Escrever os testes que falham**

Create `frontend/src/hardware/printer/renderHtml.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import type { Receipt } from './receipt'
import { escapeHtml, renderReceiptHtml } from './renderHtml'

const render = (receipt: Receipt, widthMm: 58 | 80 = 80) => renderReceiptHtml(receipt, { widthMm })

describe('escapeHtml', () => {
  it('escapa os caracteres que quebrariam o HTML', () => {
    expect(escapeHtml(`<b>"A" & 'B'</b>`)).toBe('&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;')
  })
})

describe('renderReceiptHtml', () => {
  it('gera um documento completo em UTF-8, em português', () => {
    const html = render({ blocks: [] })
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<html lang="pt-BR">')
    expect(html).toContain('<meta charset="utf-8">')
  })

  it('nome de produto com HTML não vira HTML (nada de injeção no cupom)', () => {
    const html = render({ blocks: [{ type: 'text', text: '<script>alert(1)</script> & Cia' }, { type: 'row', left: '<i>x</i>', right: '"y"' }] })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<i>x</i>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Cia')
    expect(html).toContain('&lt;i&gt;x&lt;/i&gt;')
    expect(html).toContain('&quot;y&quot;')
  })

  it('o cupom tem a largura da bobina escolhida (o papel vem do driver), a página sem margem, e é sempre preto no branco', () => {
    const at80 = render({ blocks: [] }, 80)
    expect(at80).toContain('@page { margin: 0; }')
    expect(at80).toContain('width: 80mm')
    const at58 = render({ blocks: [] }, 58)
        expect(at58).toContain('width: 58mm')
    expect(at80).toContain('background: #fff')
    expect(at80).toContain('color: #000')
  })

  it('texto: alinhamento, negrito e tamanho viram classes', () => {
    const html = render({ blocks: [{ type: 'text', text: 'X', align: 'center', bold: true, size: 'large' }, { type: 'text', text: 'Y' }] })
    expect(html).toContain('<div class="t center bold large">X</div>')
    expect(html).toContain('<div class="t left">Y</div>')
  })

  it('linha de duas colunas: descrição à esquerda e valor à direita, com negrito opcional', () => {
    const html = render({ blocks: [{ type: 'row', left: 'TOTAL', right: 'R$ 8,63', bold: true }, { type: 'row', left: 'a', right: 'b' }] })
    expect(html).toContain('<div class="row bold"><span class="l">TOTAL</span><span class="r">R$ 8,63</span></div>')
    expect(html).toContain('<div class="row"><span class="l">a</span><span class="r">b</span></div>')
  })

  it('separador e espaço em branco; o bloco de corte não imprime nada (quem corta é o driver)', () => {
    const html = render({ blocks: [{ type: 'divider' }, { type: 'blank' }, { type: 'cut' }] })
    expect(html).toContain('<div class="divider"></div>')
    expect(html).toContain('<div class="blank"></div>')
    expect(html).not.toContain('cut')
  })

  it('mantém a ordem dos blocos', () => {
    const html = render({ blocks: [{ type: 'text', text: 'PRIMEIRO' }, { type: 'text', text: 'SEGUNDO' }, { type: 'text', text: 'TERCEIRO' }] })
    expect(html.indexOf('PRIMEIRO')).toBeLessThan(html.indexOf('SEGUNDO'))
    expect(html.indexOf('SEGUNDO')).toBeLessThan(html.indexOf('TERCEIRO'))
  })

  it('deixa uma folga no fim do papel para o corte não pegar a última linha', () => {
    expect(render({ blocks: [] })).toContain('body::after')
  })
})
```

Create `frontend/src/hardware/printer/printOrder.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Order } from '@/types'
import { printOrderReceipt, printTestPage, type PrinterSettings } from './printOrder'

const settings: PrinterSettings = { storeName: 'LOJA', address: '', phone: '', footer: '', paperWidthMm: 80 }

const order = {
  id: 'o1', order_number: 1, customer_id: null, customer: null, total: 1, discount: 0, payment_type: 'cash',
  payment_splits: null, status: 'delivered', notes: null, invoice_number: null, invoice_series: null,
  invoice_key: null, created_by_name: 'Admin', created_at: '2026-09-25T15:30:00Z', items: [],
} as unknown as Order

describe('falha ao imprimir', () => {
  afterEach(() => vi.restoreAllMocks())

  it('nunca lança: o pedido já está salvo e a impressão não pode derrubar o PDV (aqui não existe `document`, então imprimir falha)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(typeof document).toBe('undefined') // o ambiente de teste não tem DOM
    expect(() => printOrderReceipt(order, settings)).not.toThrow()
    expect(() => printTestPage(settings)).not.toThrow()
    expect(error).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd frontend && npx vitest run src/hardware/printer/renderHtml.test.ts src/hardware/printer/printOrder.test.ts; cd ..
```
Expected: FAIL (`Failed to load url ./renderHtml` e `./printOrder`).

- [ ] **Step 3: Implementar**

Create `frontend/src/hardware/printer/renderHtml.ts`:

```typescript
import type { Receipt, ReceiptBlock } from './receipt'

export interface RenderOptions {
  widthMm: 58 | 80
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Margem lateral de cada largura: a área imprimível da bobina de 80 mm é ~72 mm e a de 58 mm é ~48 mm.
const SIDE_PADDING_MM: Record<58 | 80, number> = { 58: 5, 80: 4 }
const FONT_PX: Record<58 | 80, number> = { 58: 11, 80: 12 }

function renderBlock(block: ReceiptBlock): string {
  switch (block.type) {
    case 'text': {
      const classes = ['t', block.align ?? 'left', block.bold ? 'bold' : '', block.size === 'large' ? 'large' : '']
      return `<div class="${classes.filter(Boolean).join(' ')}">${escapeHtml(block.text)}</div>`
    }
    case 'row':
      return `<div class="row${block.bold ? ' bold' : ''}"><span class="l">${escapeHtml(block.left)}</span><span class="r">${escapeHtml(block.right)}</span></div>`
    case 'divider':
      return '<div class="divider"></div>'
    case 'blank':
      return '<div class="blank"></div>'
    case 'cut':
      return '' // no navegador quem corta o papel é o driver da impressora
  }
}

/**
 * Documento HTML do cupom na largura da bobina, sempre preto no branco (ignora o tema escuro do sistema).
 * As colunas usam flexbox: o alinhamento não depende da largura das letras, e nomes longos quebram em várias linhas.
 */
export function renderReceiptHtml(receipt: Receipt, { widthMm }: RenderOptions): string {
  const padding = SIDE_PADDING_MM[widthMm]
  const font = FONT_PX[widthMm]
  const css = `
@page { margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { width: ${widthMm}mm; padding: 0 ${padding}mm; box-sizing: border-box; font: ${font}px/1.35 Consolas, 'Courier New', monospace; }
body::after { content: ''; display: block; height: 8mm; }
.t { white-space: pre-wrap; overflow-wrap: anywhere; }
.left { text-align: left; }
.center { text-align: center; }
.right { text-align: right; }
.bold { font-weight: 700; }
.large { font-size: ${font + 3}px; }
.row { display: flex; justify-content: space-between; align-items: flex-start; gap: 2mm; }
.row .l { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.row .r { white-space: nowrap; text-align: right; }
.divider { border-top: 1px dashed #000; margin: 2mm 0; }
.blank { height: 3mm; }
`.trim()
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Cupom</title>
<style>
${css}
</style>
</head>
<body>
${receipt.blocks.map(renderBlock).filter(Boolean).join('\n')}
</body>
</html>`
}
```

Create `frontend/src/hardware/printer/print.ts`:

```typescript
const CLEANUP_MS = 60_000

/**
 * Manda o HTML para a impressora padrão do Windows por um iframe oculto na própria página (sem abrir aba).
 * O navegador não informa se imprimiu; com o Chrome/Edge aberto com --kiosk-printing sai direto, sem janela.
 */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'

  let removed = false
  const cleanup = () => {
    if (removed) return
    removed = true
    frame.remove()
  }

  frame.onload = () => {
    const win = frame.contentWindow
    // Sem isto, um `load` do about:blank inicial imprimiria uma página em branco antes do cupom.
    if (win && win.location.href === 'about:blank') return
    if (!win) {
      cleanup()
      return
    }
    win.onafterprint = cleanup
    win.focus()
    win.print()
    setTimeout(cleanup, CLEANUP_MS) // se o navegador não avisar o fim da impressão
  }
  // srcdoc antes de entrar na página: no Chromium, um iframe sem src dispara `load` (do about:blank) ao ser inserido.
  frame.srcdoc = html
  document.body.appendChild(frame)
}
```

Create `frontend/src/hardware/printer/printOrder.ts`:

```typescript
import type { Order } from '@/types'
import { buildOrderReceipt, buildTestReceipt, type ReceiptConfig } from './orderReceipt'
import { printHtml } from './print'
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

/** Página de teste para acertar o papel, o driver e a largura do caixa. */
export function printTestPage(settings: PrinterSettings): void {
  safely(() => printHtml(renderReceiptHtml(buildTestReceipt(settings, settings.paperWidthMm), { widthMm: settings.paperWidthMm })))
}
```

- [ ] **Step 4: Rodar e ver passar, e checar os tipos**

```bash
cd frontend && npx vitest run && npx tsc -b; cd ..
```
Expected: `119 passed` (109 + 9 do renderizador + 1 da falha de impressão) e `tsc` sem erros.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hardware/printer/renderHtml.ts frontend/src/hardware/printer/print.ts frontend/src/hardware/printer/printOrder.ts frontend/src/hardware/printer/renderHtml.test.ts frontend/src/hardware/printer/printOrder.test.ts
git commit -m "feat(impressora): renderizador HTML do cupom e envio para a impressora do Windows"
```

---

### Task 3: Configuração por caixa e aba "Impressora"

**Files:**
- Create: `frontend/src/stores/printer.ts`
- Create: `frontend/src/pages/settings/PrinterTab.tsx`
- Modify: `frontend/src/pages/settings/Settings.tsx`
- Test: `frontend/src/stores/printer.test.ts`

**Interfaces:**
- Consumes: `printTestPage`, `PrinterSettings` (Task 2).
- Produces: `PrinterConfig {enabled, paperWidthMm, storeName, address, phone, footer}`, `DEFAULT_PRINTER_CONFIG`, `usePrinterSettings` (Zustand persistido em `pdv-printer`, com `update(patch)`); componente `PrinterTab`. O estado do store serve direto como `PrinterSettings` (tem `storeName`, `address`, `phone`, `footer` e `paperWidthMm`).

- [ ] **Step 1: Escrever o teste que falha**

Create `frontend/src/stores/printer.test.ts`:

```typescript
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
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd frontend && npx vitest run src/stores/printer.test.ts; cd ..
```
Expected: FAIL (`Failed to load url ./printer`).

- [ ] **Step 3: Implementar**

Create `frontend/src/stores/printer.ts`:

```typescript
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
```

Create `frontend/src/pages/settings/PrinterTab.tsx`:

```tsx
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
```

- [ ] **Step 4: Ligar a aba nas Configurações**

Salve o script abaixo **fora do repositório** (por exemplo `%TEMP%/apply_edits.py`) e rode-o **da raiz do repositório**. Ele troca cada trecho antigo pelo novo, aceita arquivos LF ou CRLF e **para** se algum trecho não aparecer exatamente uma vez:

```python
import sys
from pathlib import Path

EDITS = {
  "frontend/src/pages/settings/Settings.tsx": [
    [
      "Tipo das abas",
      "type Tab = 'users' | 'categories' | 'scale'\n",
      "type Tab = 'users' | 'categories' | 'scale' | 'printer'\n"
    ],
    [
      "Importar a aba",
      "import { ScaleTab } from './ScaleTab'\n",
      "import { ScaleTab } from './ScaleTab'\nimport { PrinterTab } from './PrinterTab'\n"
    ],
    [
      "Botão da aba",
      "        <button className={tabClass('scale')} onClick={() => setActiveTab('scale')}>\n          Balança\n        </button>\n",
      "        <button className={tabClass('scale')} onClick={() => setActiveTab('scale')}>\n          Balança\n        </button>\n        <button className={tabClass('printer')} onClick={() => setActiveTab('printer')}>\n          Impressora\n        </button>\n"
    ],
    [
      "Renderizar a aba",
      "      {activeTab === 'scale' && <ScaleTab />}\n",
      "      {activeTab === 'scale' && <ScaleTab />}\n      {activeTab === 'printer' && <PrinterTab />}\n"
    ]
  ]
}

for rel, edits in EDITS.items():
    path = Path(rel)
    text = path.read_text(encoding="utf-8", newline="")
    crlf = "\r\n" in text
    text = text.replace("\r\n", "\n")
    for label, old, new in edits:
        count = text.count(old)
        if count != 1:
            sys.exit(f"{rel}: '{label}' casou {count} vezes (esperado 1)")
        text = text.replace(old, new)
    path.write_text(text.replace("\n", "\r\n") if crlf else text, encoding="utf-8", newline="")
    print(f"ok {rel}")
```

```bash
python apply_edits.py
```
Expected: `ok frontend/src/pages/settings/Settings.tsx`.

- [ ] **Step 5: Checar tipos, testes e build**

```bash
cd frontend && npx tsc -b && npx vitest run && npx vite build; cd ..
```
Expected: `tsc` sem saída; `122 passed` (119 + 3); `vite build` termina com `built in`.

- [ ] **Step 6: Verificar no navegador (aba e teste de impressão, sem imprimir de verdade)**

Suba o app em desenvolvimento (`cd frontend && npm run dev`) e entre como **administrador** (sem backend local, ponha um login falso no `localStorage`: chave `hortifacil-auth` com `{"state":{"token":"t","user":{"id":"u","name":"Admin","email":"a@a","role":"admin","is_active":true,"allowed_modules":null,"can_create_products":true,"can_edit_products":true,"created_at":"2026-01-01T00:00:00Z"}},"version":0}`). Antes de clicar em qualquer botão de imprimir, **capture o HTML em vez de imprimir**, colando no console:

```js
window.__printed = []
Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', { configurable: true, set(html) { window.__printed.push(html) }, get() { return '' } })
```

1. Configurações > aba **Impressora** aparece ao lado de "Balança". Preencha nome, endereço, telefone; escolha 58 mm e volte para 80 mm.
2. Clique em **Imprimir teste**. `window.__printed.length` deve ser `1` e o HTML conter `TESTE DE IMPRESSÃO`, `Largura configurada: 80 mm`, o nome que você digitou e `@page { margin: 0; }` (a largura do papel vem do driver).
3. Recarregue a página: os campos preenchidos continuam (a configuração persistiu em `pdv-printer`).
4. Veja o cupom: `const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;top:10px;right:10px;width:340px;height:560px;background:#fff;z-index:9999'; f.setAttribute('srcdoc-view', ''); document.body.appendChild(f); f.contentDocument.open(); f.contentDocument.write(window.__printed[0]); f.contentDocument.close()`. A régua `1234567890…` deve caber na largura sem cortar, os acentos devem sair certos e o nome longo deve quebrar em linhas.

Expected: os 4 comportamentos acima. Se algum divergir, corrija antes do commit.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/stores/printer.ts frontend/src/pages/settings/PrinterTab.tsx frontend/src/pages/settings/Settings.tsx frontend/src/stores/printer.test.ts
git commit -m "feat(impressora): configuração por caixa e aba Impressora com teste de impressão"
```

---

### Task 4: Imprimir ao confirmar, "Imprimir cupom" e "Reimprimir cupom"

**Files:**
- Modify: `frontend/src/pages/orders/NewOrder.tsx`
- Modify: `frontend/src/pages/orders/OrderDetail.tsx`

**Interfaces:**
- Consumes: `printOrderReceipt` (Task 2); `usePrinterSettings` (Task 3); `Order` de `@/types`.
- Produces: no PDV, o pedido confirmado é impresso sozinho quando `enabled`, e a tela "Pedido registrado" ganha o botão **Imprimir cupom**; na tela do pedido, o botão **Reimprimir cupom**.

- [ ] **Step 1: Guardar a alteração do usuário no `NewOrder.tsx` (não misturar nos commits)**

```bash
git stash push -m "wip-usuario-NewOrder" -- frontend/src/pages/orders/NewOrder.tsx
git diff --stat -- frontend/src/pages/orders/NewOrder.tsx
git stash list
```
Expected: o `git diff --stat` **não** mostra nada e o `stash list` mostra `stash@{0}: On <branch>: wip-usuario-NewOrder`. Se o arquivo não tinha alteração pendente, o `stash push` diz `No local changes to save`; nesse caso pule o Step 6.

- [ ] **Step 2: Aplicar as edições**

Salve como `apply_edits.py` (fora do repositório) e rode da raiz. As edições: no `NewOrder.tsx`, o ícone e os imports; `lastOrder` passa a guardar o pedido completo; o `onSuccess` imprime quando `enabled` (depois de `setSuccess(true)`); a tela de sucesso ganha **Imprimir cupom**. No `OrderDetail.tsx`, o botão **Reimprimir cupom** abaixo da data.

```python
import sys
from pathlib import Path

EDITS = {
  "frontend/src/pages/orders/NewOrder.tsx": [
    [
      "Ícone de impressora",
      "  TrashIcon,\n} from '@heroicons/react/24/outline'\n",
      "  TrashIcon,\n  PrinterIcon,\n} from '@heroicons/react/24/outline'\n"
    ],
    [
      "Tipo Order",
      "import type { Customer, Product } from '@/types'\n",
      "import type { Customer, Order, Product } from '@/types'\n"
    ],
    [
      "Importar a impressão",
      "import { addItem, changeQty } from './cart'\n",
      "import { printOrderReceipt } from '@/hardware/printer/printOrder'\nimport { usePrinterSettings } from '@/stores/printer'\nimport { addItem, changeQty } from './cart'\n"
    ],
    [
      "Guardar o pedido completo",
      "useState<{ number: number; total: number } | null>(null)",
      "useState<{ number: number; total: number; order: Order } | null>(null)"
    ],
    [
      "Imprimir ao confirmar",
      "    onSuccess: (order) => {\n      setLastOrder({ number: order.order_number, total: Number(order.total) })\n      setSuccess(true)\n    },\n",
      "    onSuccess: (order) => {\n      setLastOrder({ number: order.order_number, total: Number(order.total), order })\n      setSuccess(true)\n      // O pedido já está salvo: imprimir nunca atrasa nem impede o registro.\n      const printer = usePrinterSettings.getState()\n      if (printer.enabled) printOrderReceipt(order, printer)\n    },\n"
    ],
    [
      "Botão Imprimir cupom na tela de sucesso",
      "          <div className=\"flex gap-3\">\n            <Button variant=\"secondary\" className=\"flex-1\" onClick={() => navigate(-1)}>\n",
      "          <Button\n            variant=\"secondary\"\n            className=\"w-full mb-3\"\n            onClick={() => printOrderReceipt(lastOrder.order, usePrinterSettings.getState())}\n          >\n            <PrinterIcon className=\"w-4 h-4 mr-1.5\" />\n            Imprimir cupom\n          </Button>\n          <div className=\"flex gap-3\">\n            <Button variant=\"secondary\" className=\"flex-1\" onClick={() => navigate(-1)}>\n"
    ]
  ],
  "frontend/src/pages/orders/OrderDetail.tsx": [
    [
      "Ícone de impressora",
      "  ReceiptPercentIcon,\n} from '@heroicons/react/24/outline'\n",
      "  ReceiptPercentIcon,\n  PrinterIcon,\n} from '@heroicons/react/24/outline'\n"
    ],
    [
      "Importar a impressão",
      "import { useAuthStore } from '@/stores/auth'\n",
      "import { useAuthStore } from '@/stores/auth'\nimport { usePrinterSettings } from '@/stores/printer'\nimport { printOrderReceipt } from '@/hardware/printer/printOrder'\n"
    ],
    [
      "Botão Reimprimir",
      "          <p className=\"text-sm text-slate-500 dark:text-slate-400 mt-1\">\n            {formatDate(order.created_at)} — {order.created_by_name}\n          </p>\n",
      "          <p className=\"text-sm text-slate-500 dark:text-slate-400 mt-1\">\n            {formatDate(order.created_at)} — {order.created_by_name}\n          </p>\n          <Button\n            variant=\"secondary\"\n            size=\"sm\"\n            className=\"mt-3\"\n            onClick={() => printOrderReceipt(order, usePrinterSettings.getState())}\n          >\n            <PrinterIcon className=\"w-4 h-4 mr-1.5\" />\n            Reimprimir cupom\n          </Button>\n"
    ]
  ]
}

for rel, edits in EDITS.items():
    path = Path(rel)
    text = path.read_text(encoding="utf-8", newline="")
    crlf = "\r\n" in text
    text = text.replace("\r\n", "\n")
    for label, old, new in edits:
        count = text.count(old)
        if count != 1:
            sys.exit(f"{rel}: '{label}' casou {count} vezes (esperado 1)")
        text = text.replace(old, new)
    path.write_text(text.replace("\n", "\r\n") if crlf else text, encoding="utf-8", newline="")
    print(f"ok {rel}")
```

```bash
python apply_edits.py
```
Expected: `ok frontend/src/pages/orders/NewOrder.tsx` e `ok frontend/src/pages/orders/OrderDetail.tsx`.

- [ ] **Step 3: Checar tipos, testes e build**

```bash
cd frontend && npx tsc -b && npx vitest run && npx vite build; cd ..
```
Expected: `tsc` sem saída; `122 passed`; `built in`.

- [ ] **Step 4: Verificar o fluxo no navegador (capturando o HTML, sem imprimir)**

Como no Step 6 da Task 3: app em desenvolvimento, login falso de administrador e a captura do HTML no console (`window.__printed`). Sem backend, simule a API dentro da página (substitua `XMLHttpRequest` por uma classe que devolve JSON): `POST /orders` devolve um pedido completo (número 42, `created_by_name`, um item de 1,235 kg de BANANA a 6,99, `total: "8.63"`, `payment_type: "cash"`, `items` com `product_name`, `product_code`, `unit_type`, `qty`, `unit_price`, `subtotal` **como texto**), e `GET /orders/<id>` devolve o mesmo pedido.

1. Com a impressão **desligada** (padrão): confirme um pedido em **Novo Pedido**. A tela "Pedido registrado" aparece e `window.__printed.length` é `0`.
2. Clique em **Imprimir cupom** nessa tela: `__printed.length` vira `1`, e o HTML contém `CUPOM NÃO FISCAL`, `Pedido nº`, `42`, `BANANA` e `1,235 kg`.
3. Em Configurações > Impressora, marque **Imprimir o cupom ao confirmar o pedido**; confirme outro pedido: imprime **uma vez**, sozinho, e a tela de sucesso aparece normalmente.
4. Abra `/orders/<id>`: o botão **Reimprimir cupom** aparece abaixo da data e, ao clicar, `__printed` ganha o cupom do pedido. Com o pedido em status cancelado, o HTML contém `*** CANCELADO ***`.
5. **Falha de impressão:** no console, `Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', { configurable: true, set() { throw new Error('sem impressora') } })`, e confirme um pedido com a impressão ligada. A tela "Pedido registrado" aparece do mesmo jeito (o pedido foi salvo) e o console mostra `Falha ao enviar o cupom para a impressora`, sem tela quebrada.
6. Veja o cupom de um pedido renderizado (como no Step 6 da Task 3): itens em duas linhas, total em negrito, pagamento, sem linhas em branco sobrando.

Expected: os 6 comportamentos. Se algum divergir, corrija antes do commit.

- [ ] **Step 5: Commit só das alterações da impressora**

```bash
git add frontend/src/pages/orders/NewOrder.tsx frontend/src/pages/orders/OrderDetail.tsx
git commit -m "feat(impressora): imprimir ao confirmar o pedido, Imprimir cupom e Reimprimir cupom"
```
Confirme antes do commit que `git diff --cached -- frontend/src/pages/orders/NewOrder.tsx` **não** contém o estilo de hover do usuário (`hover:text-green-700 dark:hover:text-green-400`).

- [ ] **Step 6: Devolver a alteração do usuário**

```bash
git stash pop
git status --short
git stash list
```
Expected: o `stash pop` devolve a alteração dele (`git status` mostra ` M frontend/src/pages/orders/NewOrder.tsx` e ` M .impeccable/config.json`) e o `stash list` fica vazio. Se o `stash pop` acusar conflito, resolva mantendo **as duas** alterações.

---

### Task 5: Roteiro de instalação da Epson e entrega

**Files:**
- Create: `docs/hardware/impressora-epson.md`

**Interfaces:**
- Consumes: a aba "Impressora" e o botão "Imprimir teste" (Task 3).
- Produces: o procedimento que o usuário segue para configurar a Epson em cada caixa e o checklist do teste; é a entrada do ajuste de layout com a impressão real.

- [ ] **Step 1: Criar o roteiro**

Create `docs/hardware/impressora-epson.md`:

````markdown
# Impressora Epson: configuração por caixa

O HortiFácil imprime o cupom pelo navegador, usando o driver da Epson instalado no Windows. Faça uma vez em cada caixa.

## 1. No Windows

1. **Driver da Epson instalado** e a impressora aparecendo em *Impressoras e scanners*. O modelo está na etiqueta embaixo da impressora.
2. **Impressora padrão:** selecione a Epson e escolha *Definir como padrão*. No Windows 11, desligue antes *Permitir que o Windows gerencie minha impressora padrão*.
3. **Papel do driver em bobina de 80 mm.** Em *Preferências de impressão*, escolha o tamanho de papel de bobina de 80 mm (o nome varia conforme o modelo e o driver). Papel errado faz o cupom sair reduzido ou cortado.
4. **Corte e gaveta.** Nas opções do driver escolha cortar o papel ao fim de cada documento e, se houver gaveta de dinheiro, abrir a gaveta ao imprimir. Os nomes das opções variam conforme o driver. Atenção: a gaveta abre em **todo** trabalho de impressão, inclusive teste e reimpressão.

## 2. Impressão silenciosa (sem a janela de impressão)

Sem este passo o navegador abre a janela de impressão a cada cupom (funciona, mas é mais lento).

1. Clique com o botão direito no atalho do **Chrome** (ou do **Edge**) que o caixa usa, e abra *Propriedades*.
2. No campo *Destino*, no **final** da linha e depois das aspas, acrescente um espaço e `--kiosk-printing`.
3. Feche todas as janelas do navegador e abra de novo **por esse atalho**.

Com essa opção, **qualquer** impressão desse navegador sai direto na impressora padrão. Use um atalho só para o caixa.

## 3. No HortiFácil (como administrador)

1. **Configurações > Impressora:** preencha nome do comércio, endereço, telefone e rodapé; escolha a largura do papel (80 mm); marque **Imprimir o cupom ao confirmar o pedido**.
2. Clique em **Imprimir teste**.

## 4. Checklist do teste

- [ ] A régua `1234567890…` cabe na largura, sem cortar nas bordas (se sair pequena, o papel do driver está errado; se cortar, a largura ou as margens do driver estão erradas).
- [ ] Os acentos saem certos (`ÁÉÍÓÚ áéíóú ãõç`).
- [ ] O nome longo do produto quebra em várias linhas.
- [ ] O papel é cortado **depois** do cupom, sem cortar a última linha.
- [ ] A gaveta abre (se houver).
- [ ] Sem janela de impressão (impressão silenciosa).
- [ ] Um **pedido de verdade**: confirme um pedido de teste; o cupom sai sozinho com os itens, o total e o pagamento certos.
- [ ] **Reimprimir cupom** na tela do pedido funciona; num pedido cancelado, sai "CANCELADO".
- [ ] (Opcional) Troque para **58 mm** na aba Impressora e no driver, e repita o teste.

## 5. O que enviar de volta

O modelo exato da Epson, uma **foto do cupom de teste** e de um cupom de pedido, e qualquer item do checklist que não passou. Com isso eu ajusto o layout para a impressão real.
````

- [ ] **Step 2: Commit**

```bash
git add docs/hardware/impressora-epson.md
git commit -m "docs(impressora): roteiro de configuração da Epson por caixa"
```

- [ ] **Step 3: Entregar ao usuário e parar (portão de hardware)**

Apresente o resumo: o cupom do pedido está pronto e testado sem impressora (imprimir ao confirmar, Imprimir cupom, Reimprimir cupom, aba Impressora com teste), o impacto (nada sai na impressora até o caixa ser configurado e o "imprimir ao confirmar" ser marcado) e o que falta: o usuário configura a Epson seguindo `docs/hardware/impressora-epson.md` e envia a foto do cupom de teste. Depois **pare**: os ajustes de layout vêm da impressão real. Não acione o deploy do Coolify sem o "pode fazer o deploy" explícito do usuário.
