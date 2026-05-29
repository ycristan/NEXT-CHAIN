// src/test/deliveryCalendar.test.ts
import { describe, it, expect } from 'vitest'
import { getAvailableDeliveryDates } from '../lib/deliveryCalendar'
import type { ClientAccount, CutoffConfig, PublicHoliday } from '../types/orders'

const BASE_CONFIG: CutoffConfig = { id: 1, cutoff_time: '14:00', timezone: 'Europe/Dublin' }

const IE_ACCOUNT: ClientAccount = {
  id: 'acc-1', company_name: 'Test Co', region: 'IE',
  allow_avulso: false, weekend_delivery: false,
  holiday_delivery: false, same_day_delivery: false,
  custom_cutoff_time: null, is_active: true, created_at: ''
}

// 2026-06-01 is a Monday (no holidays)
const MONDAY_BEFORE_CUTOFF = new Date('2026-06-01T10:00:00') // 10:00 IE time, before 14:00
const MONDAY_AFTER_CUTOFF  = new Date('2026-06-01T16:00:00') // 16:00 IE time, after 14:00

describe('getAvailableDeliveryDates', () => {
  it('before cutoff on Monday → first available date is Tuesday', () => {
    const dates = getAvailableDeliveryDates(IE_ACCOUNT, BASE_CONFIG, [], MONDAY_BEFORE_CUTOFF)
    expect(dates[0]).toBe('2026-06-02') // Tuesday
  })

  it('after cutoff on Monday → first available date is Wednesday', () => {
    const dates = getAvailableDeliveryDates(IE_ACCOUNT, BASE_CONFIG, [], MONDAY_AFTER_CUTOFF)
    expect(dates[0]).toBe('2026-06-03') // Wednesday
  })

  it('skips weekends by default', () => {
    // Friday before cutoff → next weekday is Monday (skips Saturday + Sunday)
    const fridayBeforeCutoff = new Date('2026-06-05T10:00:00') // Friday
    const dates = getAvailableDeliveryDates(IE_ACCOUNT, BASE_CONFIG, [], fridayBeforeCutoff)
    expect(dates[0]).toBe('2026-06-08') // Monday
  })

  it('includes weekends when weekend_delivery is true', () => {
    const account = { ...IE_ACCOUNT, weekend_delivery: true }
    const fridayBeforeCutoff = new Date('2026-06-05T10:00:00')
    const dates = getAvailableDeliveryDates(account, BASE_CONFIG, [], fridayBeforeCutoff)
    expect(dates[0]).toBe('2026-06-06') // Saturday
  })

  it('skips IE public holidays', () => {
    // 2026-08-03 is August Bank Holiday (IE), Monday
    const holidays: PublicHoliday[] = [
      { id: '1', date: '2026-08-03', name: 'August Bank Holiday', region: 'IE' }
    ]
    const sundayBefore = new Date('2026-08-02T10:00:00') // Sunday before cutoff
    const account = { ...IE_ACCOUNT, weekend_delivery: false }
    const dates = getAvailableDeliveryDates(account, BASE_CONFIG, holidays, sundayBefore)
    // Sunday before cutoff → candidate is Monday; Monday is holiday → first is Tuesday
    expect(dates[0]).not.toBe('2026-08-03')
    expect(dates[0]).toBe('2026-08-04')
  })

  it('includes holidays when holiday_delivery is true', () => {
    const holidays: PublicHoliday[] = [
      { id: '1', date: '2026-08-03', name: 'August Bank Holiday', region: 'IE' }
    ]
    const account = { ...IE_ACCOUNT, holiday_delivery: true }
    const fridayBefore = new Date('2026-07-31T10:00:00') // Friday before cutoff
    const dates = getAvailableDeliveryDates(account, BASE_CONFIG, holidays, fridayBefore)
    expect(dates[0]).toBe('2026-08-03') // Monday (holiday, but allowed)
  })

  it('uses client custom_cutoff_time when set', () => {
    const account = { ...IE_ACCOUNT, custom_cutoff_time: '10:00' }
    // 11:00 is after custom cutoff of 10:00 → candidate is day after next weekday
    const mondayAt11 = new Date('2026-06-01T11:00:00')
    const dates = getAvailableDeliveryDates(account, BASE_CONFIG, [], mondayAt11)
    expect(dates[0]).toBe('2026-06-03') // Wednesday (skips Tuesday)
  })

  it('includes today when same_day_delivery is true and before cutoff', () => {
    const account = { ...IE_ACCOUNT, same_day_delivery: true }
    const dates = getAvailableDeliveryDates(account, BASE_CONFIG, [], MONDAY_BEFORE_CUTOFF)
    expect(dates[0]).toBe('2026-06-01') // today
  })

  it('does NOT include today when same_day_delivery is true but after cutoff', () => {
    const account = { ...IE_ACCOUNT, same_day_delivery: true }
    const dates = getAvailableDeliveryDates(account, BASE_CONFIG, [], MONDAY_AFTER_CUTOFF)
    expect(dates[0]).not.toBe('2026-06-01')
    expect(dates[0]).toBe('2026-06-03') // Wednesday
  })

  it('returns 14 dates', () => {
    const dates = getAvailableDeliveryDates(IE_ACCOUNT, BASE_CONFIG, [], MONDAY_BEFORE_CUTOFF)
    expect(dates.length).toBe(14)
  })

  it('only skips GB-NIR holidays for GB-NIR accounts, not IE holidays', () => {
    const nirAccount = { ...IE_ACCOUNT, region: 'GB-NIR' as const }
    const ieOnlyHoliday: PublicHoliday[] = [
      { id: '1', date: '2026-06-02', name: 'IE Only Holiday', region: 'IE' }
    ]
    const dates = getAvailableDeliveryDates(nirAccount, BASE_CONFIG, ieOnlyHoliday, MONDAY_BEFORE_CUTOFF)
    expect(dates[0]).toBe('2026-06-02') // Tuesday — NOT skipped for GB-NIR account
  })
})
