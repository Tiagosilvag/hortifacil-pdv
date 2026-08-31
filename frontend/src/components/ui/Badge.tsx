type Variant = 'green' | 'amber' | 'red' | 'slate' | 'blue' | 'emerald'

interface Props {
  variant?: Variant
  children: React.ReactNode
  className?: string
}

const classes: Record<Variant, string> = {
  green: 'bg-green-100 text-green-800 ring-green-200',
  emerald: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  amber: 'bg-amber-100 text-amber-800 ring-amber-200',
  red: 'bg-red-100 text-red-800 ring-red-200',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-blue-100 text-blue-800 ring-blue-200',
}

export function Badge({ variant = 'slate', children, className = '' }: Props) {
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset',
        classes[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
