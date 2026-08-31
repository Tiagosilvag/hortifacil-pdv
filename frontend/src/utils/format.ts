export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDate(isoString: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoString))
}

export function formatDateShort(isoString: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(isoString))
}

const UNIT_LABELS: Record<string, string> = {
  unit: 'un',
  kg: 'kg',
  gram: 'g',
  liter: 'L',
  box: 'cx',
  bunch: 'maço',
}

export function formatUnit(unit: string): string {
  return UNIT_LABELS[unit] ?? unit
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  installment: 'Fiado',
}

export function formatPayment(type: string): string {
  return PAYMENT_LABELS[type] ?? type
}

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  counter: 'Balcão',
  external: 'Externo',
  hotel: 'Hotel',
  inn: 'Pousada',
  wholesale: 'Atacado',
}

export function formatCustomerType(type: string): string {
  return CUSTOMER_TYPE_LABELS[type] ?? type
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Aberto',
  partial: 'Parcial',
  paid: 'Pago',
  overdue: 'Vencido',
  pending: 'Pendente',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
}

export function formatStatus(status: string): string {
  return STATUS_LABELS[status] ?? status
}
