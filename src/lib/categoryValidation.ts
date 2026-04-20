interface Category {
  id: string
  parent_id: string | null
}

/**
 * Determina se a subcategoria deve ser limpa ao mudar a categoria pai.
 * Retorna false se as categorias ainda não carregaram (evita apagar durante o mount).
 */
export function shouldResetSubcategory(
  category1_id: string,
  category_id: string,
  categories: Category[]
): boolean {
  if (categories.length === 0) return false  // guard: categorias não carregadas ainda
  if (!category1_id) return false
  const subCategories = categories.filter(c => c.parent_id === category_id)
  return !subCategories.find(c => c.id === category1_id)
}
