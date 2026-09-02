type Variant = 'green' | 'amber' | 'red' | 'slate' | 'blue' | 'emerald'

interface Props {
  variant?: Variant
  children: React.ReactNode
  className?: string
}

const classes: Record<Variant, string> = {
  green: 'bg-green-100 text-green-800 ring-green-200 dark:bg-green-900/50 dark:text-green-300 dark:ring-green-700',
  emerald: 'bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:ring-emerald-700',
  amber: 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:ring-amber-700',
  red: 'bg-red-100 text-red-800 ring-red-200 dark:bg-red-900/50 dark:text-red-300 dark:ring-red-700',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600',
  blue: 'bg-blue-100 text-blue-800 ring-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:ring-blue-700',
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
