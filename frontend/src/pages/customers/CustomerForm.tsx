import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createCustomer, updateCustomer } from '@/api/customers'
import { getApiError } from '@/api/client'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import type { Customer } from '@/types'

interface FormData {
  name: string
  phone: string
  document: string
  address: string
  customer_type: string
  credit_limit: string
  notes: string
  is_active: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  customer: Customer | null
}

export default function CustomerForm({ open, onClose, customer }: Props) {
  const qc = useQueryClient()
  const [apiError, setApiError] = useState('')
  const isEditing = customer !== null

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>()

  useEffect(() => {
    if (open) {
      setApiError('')
      reset({
        name: customer?.name ?? '',
        phone: customer?.phone ?? '',
        document: customer?.document ?? '',
        address: customer?.address ?? '',
        customer_type: customer?.customer_type ?? 'counter',
        credit_limit: customer?.credit_limit ? String(customer.credit_limit) : '',
        notes: customer?.notes ?? '',
        is_active: customer?.is_active ?? true,
      })
    }
  }, [open, customer, reset])

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const body = {
        name: data.name.trim(),
        phone: data.phone.trim() || undefined,
        document: data.document.trim() || undefined,
        address: data.address.trim() || undefined,
        customer_type: data.customer_type,
        credit_limit: data.credit_limit ? parseFloat(data.credit_limit) : 0,
        notes: data.notes.trim() || undefined,
        ...(isEditing ? { is_active: data.is_active } : {}),
      }
      return isEditing
        ? updateCustomer(customer!.id, body)
        : createCustomer(body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      onClose()
    },
    onError: (err) => setApiError(getApiError(err)),
  })

  const onSubmit = (data: FormData) => {
    setApiError('')
    mutation.mutate(data)
  }

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Editar Cliente' : 'Novo Cliente'}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Input
          label="Nome *"
          placeholder="Nome completo"
          error={errors.name?.message}
          {...register('name', {
            required: 'Nome obrigatório',
            minLength: { value: 2, message: 'Mínimo de 2 caracteres' },
            validate: (v) => v.trim().length >= 2 || 'Mínimo de 2 caracteres',
          })}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Telefone"
            placeholder="(00) 00000-0000"
            {...register('phone')}
          />
          <Input
            label="CPF / CNPJ"
            placeholder="000.000.000-00"
            {...register('document')}
          />
        </div>

        <Input
          label="Endereço"
          placeholder="Rua, número, bairro, cidade"
          {...register('address')}
        />

        <Select label="Tipo de cliente" {...register('customer_type')}>
          <option value="counter">Balcão</option>
          <option value="external">Externo</option>
          <option value="hotel">Hotel</option>
          <option value="inn">Pousada</option>
          <option value="wholesale">Atacado</option>
        </Select>

        <Input
          label="Limite de crédito (R$)"
          type="number"
          step="0.01"
          min="0"
          placeholder="0,00"
          hint="Deixe em branco ou 0 para sem limite de crédito (fiado livre)"
          error={errors.credit_limit?.message}
          {...register('credit_limit', {
            min: { value: 0, message: 'Limite não pode ser negativo' },
          })}
        />

        <Input
          label="Observações"
          placeholder="Anotações sobre o cliente..."
          {...register('notes')}
        />

        {isEditing && (
          <label className="flex items-center gap-3 cursor-pointer select-none py-1">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-green-600 focus:ring-green-500"
              {...register('is_active')}
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">Cliente ativo</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">(desmarque para inativar)</span>
          </label>
        )}

        {apiError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
            <p className="text-sm text-red-700 dark:text-red-400">{apiError}</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" className="flex-1" loading={mutation.isPending}>
            {isEditing ? 'Salvar alterações' : 'Criar cliente'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
