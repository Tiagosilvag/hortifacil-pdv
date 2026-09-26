import type { UseFormRegister } from 'react-hook-form'
import { Input, Select } from '@/components/ui/Input'
import { ORIGEM_OPTIONS, type FiscalFormValues } from '@/utils/fiscal'

interface Props {
  // Serve para qualquer formulário que tenha os campos fiscais (produto e padrão da categoria).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
  /** Ex.: "Vazio = usa o padrão da categoria". Aparece no NCM, o primeiro campo. */
  emptyHint?: string
  errors?: Partial<Record<keyof FiscalFormValues, { message?: string }>>
}

/** Os oito campos fiscais, compartilhados pelo cadastro de produto e pelo padrão por categoria. */
export function FiscalFieldsForm({ register, emptyHint, errors }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Input label="NCM" placeholder="8 dígitos" inputMode="numeric" hint={emptyHint} error={errors?.ncm?.message} {...register('ncm')} />
      <Input label="CEST" placeholder="7 dígitos (só com substituição tributária)" inputMode="numeric" error={errors?.cest?.message} {...register('cest')} />
      <Select label="Origem" error={errors?.origem?.message} {...register('origem')}>
        <option value="">—</option>
        {ORIGEM_OPTIONS.map((o) => (
          <option key={o.value} value={String(o.value)}>{o.label}</option>
        ))}
      </Select>
      <Input label="CFOP" placeholder="Ex.: 5102 (começa com 5)" inputMode="numeric" error={errors?.cfop?.message} {...register('cfop')} />
      <Input label="CST do ICMS" placeholder="2 dígitos, ex.: 00, 41, 60" inputMode="numeric" error={errors?.cst_icms?.message} {...register('cst_icms')} />
      <Input
        label="Alíquota do ICMS (%)"
        placeholder="Só quando o CST cobra imposto"
        inputMode="decimal"
        error={errors?.aliquota_icms?.message}
        {...register('aliquota_icms')}
      />
      <Input label="CST do PIS" placeholder="2 dígitos" inputMode="numeric" error={errors?.cst_pis?.message} {...register('cst_pis')} />
      <Input label="CST do COFINS" placeholder="2 dígitos" inputMode="numeric" error={errors?.cst_cofins?.message} {...register('cst_cofins')} />
    </div>
  )
}
