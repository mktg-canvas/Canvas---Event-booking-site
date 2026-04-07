import { APPS_SCRIPT_URL } from './constants'

/**
 * Fetch events from the Google Apps Script backend.
 * @param {Object} filters  Optional { building, date } to narrow results.
 * @returns {Promise<Array>} Array of event objects.
 */
export async function getEvents(filters = {}) {
  const params = new URLSearchParams()
  if (filters.building) params.set('building', filters.building)
  if (filters.date)     params.set('date',     filters.date)

  const url = APPS_SCRIPT_URL + (params.toString() ? '?' + params.toString() : '')
  const res  = await fetch(url)

  if (!res.ok) throw new Error(`Server returned ${res.status}`)

  const data = await res.json()
  if (data.error) throw new Error(data.error)

  return data.events || []
}

/**
 * Submit a new booking to the backend.
 * @param {Object} payload  Booking fields.
 * @returns {Promise<Object>} { success, conflict?, message? }
 */
export async function bookEvent(payload) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'text/plain' },
    body:    JSON.stringify(payload),
  })

  if (!res.ok) throw new Error(`Server returned ${res.status}`)

  return res.json()
}
