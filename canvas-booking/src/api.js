import { supabase } from './supabase'

/**
 * Fetch events from Supabase.
 * For clients: we should only select time-related columns.
 * For admins: we select everything.
 */
export async function getEvents(filters = {}, isAdmin = false) {
  let query = supabase
    .from('events')
    .select(isAdmin ? '*' : 'id, building, date, start_time, end_time')

  if (filters.building) query = query.eq('building', filters.building)
  if (filters.date)     query = query.eq('date',     filters.date)

  const { data, error } = await query

  if (error) throw new Error(error.message)

  // Map Supabase column names to our app's names if they differ
  // (We kept them the same: startTime -> start_time)
  return data.map(e => ({
    ...e,
    startTime: e.start_time,
    endTime: e.end_time,
    eventName: e.event_name,
    contactPerson: e.contact_person,
    contactNumber: e.contact_number
  }))
}

/**
 * Submit a new booking or update an existing one.
 */
export async function bookEvent(payload) {
  const { id, action, ...data } = payload
  
  // Prepare the data for Supabase (mapping back to snake_case)
  const dbData = {
    building:       data.building,
    date:           data.date,
    start_time:     data.startTime,
    end_time:       data.endTime,
    attendees:      data.attendees,
    event_name:     data.eventName,
    contact_person: data.contactPerson,
    contact_number: data.contactNumber,
    status:         'confirmed'
  }

  if (action === 'edit' && id) {
    const { error } = await supabase
      .from('events')
      .update(dbData)
      .eq('id', id)
    
    if (error) return { success: false, message: error.message }
    return { success: true }
  } else {
    // Check for conflicts first (optional but good for UX)
    // Supabase allows us to do this more reliably with a RPC call, 
    // but for now, we'll keep it simple.
    
    const { error } = await supabase
      .from('events')
      .insert([dbData])

    if (error) return { success: false, message: error.message }
    return { success: true }
  }
}
