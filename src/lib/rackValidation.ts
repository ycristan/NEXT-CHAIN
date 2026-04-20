export interface RackFormValues {
  name: string
  rackTypeId: string
  columns: string
  rows: string
  soloPos: string
  comboPos: string
  existingNames: string[]
}

export interface RackFormErrors {
  name?: string
  rackTypeId?: string
  columns?: string
  rows?: string
  soloPos?: string
  comboPos?: string
}

export function validateRackForm(values: RackFormValues): RackFormErrors {
  const e: RackFormErrors = {}
  const n = values.name.trim()

  if (!n) {
    e.name = 'Required.'
  } else if (!/^\d{1,2}$/.test(n)) {
    e.name = 'Must be 1-2 digits (e.g. 1, 40, 99).'
  } else if (values.existingNames.includes(n)) {
    e.name = `Rack "${n}" already exists.`
  }

  if (!values.rackTypeId) {
    e.rackTypeId = 'Required.'
  }

  const c = parseInt(values.columns)
  if (!values.columns || isNaN(c) || c < 1) e.columns = 'Must be ≥ 1.'
  else if (c > 26) e.columns = 'Max 26 columns (A–Z).'

  const r = parseInt(values.rows)
  if (!values.rows || isNaN(r) || r < 1) e.rows = 'Must be ≥ 1.'
  else if (r > 99) e.rows = 'Max 99 rows.'

  if (values.soloPos && (isNaN(parseInt(values.soloPos)) || parseInt(values.soloPos) < 1))
    e.soloPos = 'Must be a positive number.'
  if (values.comboPos && (isNaN(parseInt(values.comboPos)) || parseInt(values.comboPos) < 1))
    e.comboPos = 'Must be a positive number.'

  return e
}
