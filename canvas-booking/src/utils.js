/**
 * Convert a time-slot string to minutes since midnight.
 *   '12:00 AM'            →    0
 *   '1:00 AM'             →   60
 *   '12:00 PM'            →  720
 *   '11:00 PM'            → 1380
 *   '12:00 AM (midnight)' → 1440
 */
export function toMins(t) {
  if (!t) return 0
  if (t === '12:00 AM (midnight)') return 1440
  const [tp, period] = t.split(' ')
  let h = parseInt(tp.split(':')[0], 10)
  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0
  return h * 60
}

/**
 * Format an ISO date string (yyyy-MM-dd) to "02 Apr 2026".
 */
export function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-').map(Number)
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec']
  return `${String(day).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`
}

/**
 * Return today's date as an ISO string (yyyy-MM-dd) using local timezone.
 */
export function todayISO() {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-')
}

/**
 * Check whether two time ranges overlap.
 * Overlap condition: aStart < bEnd AND aEnd > bStart
 */
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart
}

/**
 * Normalize a time value to "H:MM AM/PM" display string.
 * Handles:
 *  - Already correct strings like "11:00 AM", "2:00 PM"
 *  - Lowercase variants like "11:00 am"
 *  - Date.toString() strings like "Sat Dec 30 1899 11:00:00 GMT+0530"
 *  - 24-hour strings like "14:00"
 */
export function fmtTime(t) {
  if (!t) return '—'
  const s = String(t).trim()

  // Already in H:MM AM/PM format (case-insensitive)
  if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(s)) {
    return s.replace(/\bam\b/gi, 'AM').replace(/\bpm\b/gi, 'PM')
  }

  // Extract HH:MM from a Date.toString() like "Sat Dec 30 1899 14:00:00 GMT+..."
  const dateMatch = s.match(/(\d{1,2}):(\d{2}):\d{2}/)
  if (dateMatch) {
    let h = parseInt(dateMatch[1], 10)
    const m = dateMatch[2]
    const period = h >= 12 ? 'PM' : 'AM'
    if (h === 0) h = 12
    else if (h > 12) h -= 12
    return `${h}:${m} ${period}`
  }

  // 24-hour format "14:00"
  const plainMatch = s.match(/^(\d{1,2}):(\d{2})$/)
  if (plainMatch) {
    let h = parseInt(plainMatch[1], 10)
    const m = plainMatch[2]
    const period = h >= 12 ? 'PM' : 'AM'
    if (h === 0) h = 12
    else if (h > 12) h -= 12
    return `${h}:${m} ${period}`
  }

  return s
}
