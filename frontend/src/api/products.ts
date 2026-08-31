import { api } from './client'
import type { Product } from '@/types'

export interface ProductCreate {
  name: string
  barcode?: string
  unit_type: string
  price: number
  category?: string
}

export interface ProductListParams {
  search?: string
  include_inactive?: boolean
}

export async function listProducts(params?: ProductListParams): Promise<Product[]> {
  const { data } = await api.get<Product[]>('/products', { params })
  return data
}

export async function createProduct(body: ProductCreate): Promise<Product> {
  const { data } = await api.post<Product>('/products', body)
  return data
}

export async function updateProduct(id: string, body: Partial<ProductCreate> & { is_active?: boolean }): Promise<Product> {
  const { data } = await api.patch<Product>(`/products/${id}`, body)
  return data
}

export async function getProductByBarcode(barcode: string): Promise<Product> {
  const { data } = await api.get<Product>(`/products/barcode/${barcode}`)
  return data
}
