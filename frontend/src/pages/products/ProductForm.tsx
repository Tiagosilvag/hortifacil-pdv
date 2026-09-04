import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createProduct, updateProduct } from '@/api/products'
import { getApiError } from '@/api/client'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import type { Product } from '@/types'

interface FormData {
  name: string
  barcode: string
  unit_type: string
  price: string
  category: string
}

interface Props {
  open: boolean
  onClose: () => void
  product: Product | null
}

export default function ProductForm({ open, onClose, product }: Props) {
  const qc = useQueryClient()
  const [apiError, setApiError] = useState('')
  const isEditing = product !== null

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>()

  useEffect(() => {
    if (open) {
      setApiError('')
      reset({
        name: product?.name ?? '',
        barcode: product?.barcode ?? '',
        unit_type: product?.unit_type ?? 'unit',
        price: product?.price ? String(product.price) : '',
        category: product?.category ?? '',
      })
    }
  }, [open, product, reset])

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const body = {
        name: data.name,
        barcode: data.barcode || undefined,
        unit_type: data.unit_type,
        price: parseFloat(data.price),
        category: data.category || undefined,
      }
      return isEditing
        ? updateProduct(product!.id, body)
        : createProduct(body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      onClose()
    },
    onError: (err) => setApiError(getApiError(err)),
  })

  const onSubmit = (data: FormData) => {
    setApiError('')
    mutation.mutate(data)
  }

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Editar Produto' : 'Novo Produto'}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Input
          label="Nome *"
          placeholder="Ex: Banana Nanica"
          error={errors.name?.message}
          {...register('name', { required: 'Nome obrigatório' })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Unidade *"
            {...register('unit_type')}
          >
            <option value="unit">Unidade (un)</option>
            <option value="kg">Quilo (kg)</option>
            <option value="gram">Grama (g)</option>
            <option value="liter">Litro (L)</option>
            <option value="box">Caixa (cx)</option>
            <option value="bunch">Maço</option>
          </Select>
          <Input
            label="Preço (R$) *"
            type="number"
            step="0.01"
            min="0"
            placeholder="0,00"
            error={errors.price?.message}
            {...register('price', {
              required: 'Preço obrigatório',
              min: { value: 0, message: 'Preço deve ser positivo' },
            })}
          />
        </div>
        <Input
          label="Categoria"
          placeholder="Ex: Frutas, Legumes, Verduras..."
          {...register('category')}
        />
        <Input
          label="Código de barras"
          placeholder="EAN-13 ou outro código"
          {...register('barcode')}
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
            {isEditing ? 'Salvar' : 'Criar produto'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
