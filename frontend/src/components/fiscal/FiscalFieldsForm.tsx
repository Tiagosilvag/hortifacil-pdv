import type { UseFormRegister } from 'react-hook-form'
import { Input, Select } from '@/components/ui/Input'
import { ORIGEM_OPTIONS } from '@/utils/fiscal'

interface Props {
  // Serve para qualquer formulário que tenha os campos fiscais (produto e padrão da categoria).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
  /** Ex.: "Vazio = usa o padrão da categoria". Aparece no NCM, o primeiro campo. */
  emptyHint?: string
}

/** Os oito campos fiscais, compartilhados pelo cadastro de produto e pelo padrão por categoria. */
export function FiscalFieldsForm({ register, emptyHint }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Input label="NCM" placeholder="8 dígitos" inputMode="numeric" hint={emptyHint} {...register('ncm')} />
      <Input label="CEST" placeholder="7 dígitos (só com substituição tributária)" inputMode="numeric" {...register('cest')} />
      <Select label="Origem" {...register('origem')}>
        <option value="">—</option>
        {ORIGEM_OPTIONS.map((o) => (
          <option key={o.value} value={String(o.value)}>{o.label}</option>
        ))}
      </Select>
      <Input label="CFOP" placeholder="Ex.: 5102 (começa com 5)" inputMode="numeric" {...register('cfop')} />
      <Input label="CST do ICMS" placeholder="2 dígitos, ex.: 00, 41, 60" inputMode="numeric" {...register('cst_icms')} />
      <Input
        label="Alíquota do ICMS (%)"
        placeholder="Só quando o CST cobra imposto"
        inputMode="decimal"
        {...register('aliquota_icms')}
      />
      <Input label="CST do PIS" placeholder="2 dígitos" inputMode="numeric" {...register('cst_pis')} />
      <Input label="CST do COFINS" placeholder="2 dígitos" inputMode="numeric" {...register('cst_cofins')} />
      <Input
        label="CST do IBS/CBS"
        placeholder="3 dígitos"
        inputMode="numeric"
        hint="Reforma tributária: os valores vêm do contador"
        {...register('cst_ibs_cbs')}
      />
      <Input label="Classificação tributária (cClassTrib)" placeholder="6 dígitos" inputMode="numeric" {...register('c_class_trib')} />
      <Input label="Alíquota do IBS (%)" placeholder="Ex.: 0,1" inputMode="decimal" {...register('aliquota_ibs')} />
      <Input label="Alíquota da CBS (%)" placeholder="Ex.: 0,9" inputMode="decimal" {...register('aliquota_cbs')} />
    </div>
  )
}
