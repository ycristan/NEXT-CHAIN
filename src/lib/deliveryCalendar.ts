// src/lib/deliveryCalendar.ts
import type { ClientAccount, CutoffConfig, PublicHoliday } from '../types/orders'

/**
 * Returns up to 14 available delivery dates (as 'YYYY-MM-DD' strings)
 * based on the client account's delivery rules, global cutoff config,
 * and public holiday calendar.
 */
export function getAvailableDeliveryDates(
  account: ClientAccount,
  config: CutoffConfig,
  holidays: PublicHoliday[],
  now: Date = new Date()
): string[] {
  const cutoffTime = account.custom_cutoff_time ?? config.cutoff_time  // 'HH:MM'
  const [cutoffH, cutoffM] = cutoffTime.split(':').map(Number)

  // Determine cutoff datetime for today in the configured timezone
  // We approximate by using local time comparison (good enough for IE/UK same offset)
  const todayDate = toDateString(now)
  const cutoffDate = new Date(now)
  cutoffDate.setHours(cutoffH, cutoffM, 0, 0)

  const isBeforeCutoff = now < cutoffDate

  // Calculate first candidate date
  // Before cutoff → +1 day; After cutoff → +2 days
  const daysToAdd = isBeforeCutoff ? 1 : 2
  const candidate = addDays(now, daysToAdd)

  const holidaySet = new Set(
    holidays
      .filter(h => h.region === account.region)
      .map(h => h.date)
  )

  const results: string[] = []

  // If same-day delivery and before cutoff, include today
  if (account.same_day_delivery && isBeforeCutoff) {
    results.push(todayDate)
  }

  // Walk forward collecting up to 14 available dates
  let current = candidate
  let maxDaysToSearch = 60  // safety limit
  while (results.length < 14 && maxDaysToSearch > 0) {
    maxDaysToSearch--
    const dateStr = toDateString(current)
    const dow = current.getDay() // 0=Sun, 6=Sat

    const isWeekend = dow === 0 || dow === 6
    const isHoliday = holidaySet.has(dateStr)

    const isAvailable =
      (!isWeekend || account.weekend_delivery) &&
      (!isHoliday || account.holiday_delivery)

    if (isAvailable) results.push(dateStr)
    current = addDays(current, 1)
  }

  return results
}

function toDateString(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d)
  result.setDate(result.getDate() + n)
  return result
}
