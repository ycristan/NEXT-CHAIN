// src/types/orders.ts

export type OrderRegion = 'IE' | 'GB-NIR'

export type OrderStatus =
  | 'open_prep'
  | 'open'
  | 'picking'
  | 'dispatch'
  | 'outstanding'
  | 'transit'
  | 'delivered'
  | 'cancelled'

export type OrderItemStatus =
  | 'pending'
  | 'picked'
  | 'outstanding'
  | 'back_order'
  | 'cancelled'

export type OutstandingReason =
  | 'out_of_stock'
  | 'outdated'
  | 'damaged'
  | 'other'

export interface ClientAccount {
  id: string
  company_name: string
  region: OrderRegion
  allow_avulso: boolean
  weekend_delivery: boolean
  holiday_delivery: boolean
  same_day_delivery: boolean
  custom_cutoff_time: string | null  // 'HH:MM' or null
  is_active: boolean
  created_at: string
}

export interface ClientAccountUser {
  user_id: string
  client_account_id: string
}

export interface ClientBuilding {
  id: string
  client_account_id: string
  name: string
  address: string
  contact_name: string | null
  contact_phone: string | null
  delivery_instructions: string | null
  is_active: boolean
  created_at: string
}

export interface ClientCatalogEntry {
  client_account_id: string
  brand_id: string
}

export interface BrandPrice {
  brand_id: string
  price_per_case: number
  price_per_unit: number | null
  currency: string
  valid_from: string
}

export interface CutoffConfig {
  id: 1
  cutoff_time: string  // 'HH:MM'
  timezone: string     // e.g. 'Europe/Dublin'
}

export interface PublicHoliday {
  id: string
  date: string  // 'YYYY-MM-DD'
  name: string
  region: OrderRegion
}

export interface Order {
  id: string
  order_number: string
  client_account_id: string
  building_id: string
  ordered_by: string
  status: OrderStatus
  desired_delivery_date: string   // 'YYYY-MM-DD'
  confirmed_delivery_date: string | null
  po_number: string | null
  notes: string | null
  total_amount: number
  created_at: string
  confirmed_at: string | null
  dispatched_at: string | null
  transit_at: string | null
  delivered_at: string | null
}

export interface OrderItem {
  id: string
  order_id: string
  brand_id: string
  quantity_cases: number
  quantity_units: number | null
  price_per_case: number
  price_per_unit: number | null
  subtotal: number
  status: OrderItemStatus
  outstanding_reason: OutstandingReason | null
  outstanding_notes: string | null
  created_at: string
}

// Cart state (client-side only, not persisted until checkout)
export interface CartItem {
  brand_id: string
  brand_code: string
  brand_name: string
  image_url: string | null
  price_per_case: number
  price_per_unit: number | null
  quantity_cases: number
  quantity_units: number | null
}

// Order with joined data for display
export interface OrderWithDetails extends Order {
  client_account: Pick<ClientAccount, 'company_name'>
  building: Pick<ClientBuilding, 'name' | 'address'>
  items: OrderItemWithBrand[]
}

export interface OrderItemWithBrand extends OrderItem {
  brand: {
    brand_code: string
    brand_name: string
  }
}
