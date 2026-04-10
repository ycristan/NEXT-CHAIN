export type UserRole = 'admin' | 'manager' | 'operator' | 'viewer'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  avatar_url?: string
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  name: string
  description?: string
  created_at: string
}

export interface Supplier {
  id: string
  name: string
  contact_name?: string
  email?: string
  phone?: string
  address?: string
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  sku: string
  name: string
  description?: string
  category_id?: string
  category?: Category
  supplier_id?: string
  supplier?: Supplier
  unit: string
  unit_cost: number
  min_stock: number
  current_stock: number
  location?: string
  image_url?: string
  active: boolean
  created_at: string
  updated_at: string
}

export type MovementType = 'entry' | 'exit' | 'adjustment' | 'transfer'

export interface StockMovement {
  id: string
  product_id: string
  product?: Product
  type: MovementType
  quantity: number
  unit_cost?: number
  reason?: string
  reference_number?: string
  created_by: string
  profile?: Profile
  created_at: string
}

export interface DashboardStats {
  total_products: number
  low_stock_count: number
  out_of_stock_count: number
  total_value: number
  movements_today: number
}
