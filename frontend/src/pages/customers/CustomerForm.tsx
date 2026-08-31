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
  customer_type: string
  credit_limit: string
  notes: string
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
        customer_type: customer?.customer_type ?? 'counter',
        credit_limit: customer?.credit_limit ? String(customer.credit_limit) : '',
        notes: customer?.notes ?? '',
      })
    }
  }, [open, customer, reset])

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const body = {
        name: data.name,
        phone: data.phone || undefined,
        customer_type: data.customer_type,
        credit_limit: data.credit_limit ? parseFloat(data.credit_limit) : 0,
        notes: data.notes || undefined,
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
          {...register('name', { required: 'Nome obrigatório' })}
        />
        <Input
          label="Telefone"
          placeholder="(00) 00000-0000"
          {...register('phone')}
        />
        <Select
          label="Tipo de cliente"
          {...register('customer_type')}
        >
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
          placeholder="0,00 — deixe em branco para sem limite"
          hint="Deixe em branco ou 0 para sem limite de crédito"
          {...register('credit_limit')}
        />
        <Input
          label="Observações"
          placeholder="Anotações sobre o cliente..."
          {...register('notes')}
        />

        {apiError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="text-sm text-red-700">{apiError}</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" className="flex-1" loading={mutation.isPending}>
            {isEditing ? 'Salvar' : 'Criar cliente'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
