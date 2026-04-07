import { START_SLOTS } from '../constants'
import { toMins, overlaps, todayISO } from '../utils'
import './SlotGrid.css'

/**
 * Visual grid showing hourly time slots for a selected building + date.
 * Click once to set start time, click again (on a later slot) to set end time.
 *
 * Props:
 *   bookedRanges  {Array}  [{s, e}] of already-booked minute ranges
 *   selectedStart {string} Currently selected start-time slot (or '')
 *   selectedEnd   {string} Currently selected end-time slot (or '')
 *   selectedDate  {string} Currently selected date (yyyy-MM-dd)
 *   onSelect      {fn}     Called with slot string when a slot is clicked
 *   loading       {bool}   Show loading overlay
 */
export default function SlotGrid({
  bookedRanges = [],
  selectedStart = '',
  selectedEnd = '',
  selectedDate = '',
  onSelect,
  loading = false,
}) {
  const selStartMins = selectedStart ? toMins(selectedStart) : -1
  const selEndMins   = selectedEnd   ? toMins(selectedEnd)   : -1
  
  // To block past slots if the selected date is today
  const isToday = selectedDate === todayISO()
  const nowMins = isToday ? (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() })() : -1

  function getSlotState(slot) {
    const s = toMins(slot)
    const e = s + 60

    if (isToday && s < nowMins) {
      return 'past' // Past time slots for today
    }

    const booked = bookedRanges.some(r => overlaps(s, e, r.s, r.e))
    if (booked) return 'booked'

    if (slot === selectedStart) return 'start'
    if (slot === selectedEnd)   return 'end'

    // Highlight slots between start and end
    if (selStartMins !== -1 && selEndMins !== -1) {
      if (s > selStartMins && s < selEndMins) return 'in-range'
    }

    return 'free'
  }

  return (
    <div className="slot-grid-wrap">
      <div className="slot-grid-label">
        <span>Time Availability</span>
        <span className="sg-legend">
          <span className="sg-dot free" />Free
          <span className="sg-dot booked" />Booked
          <span className="sg-dot selected" />Start
          <span className="sg-dot in-range" />Range
          <span className="sg-dot end" />End
        </span>
      </div>

      <div className={`slot-grid ${loading ? 'sg-loading' : ''}`}>
        {START_SLOTS.map(slot => {
          const state = getSlotState(slot)
          const isDisabled = state === 'booked' || state === 'past' || !onSelect
          
          let title = slot
          if (state === 'booked') title += ' — already booked'
          if (state === 'past') title += ' — time has passed'
          
          return (
            <button
              key={slot}
              className={`sg-slot sg-${state}`}
              disabled={isDisabled}
              onClick={() => onSelect && !isDisabled && onSelect(slot)}
              title={title}
            >
              {slot.replace(':00 ', '\n')}
            </button>
          )
        })}
      </div>

      {loading && (
        <div className="sg-loader">
          <span className="spinner spinner-md" />
        </div>
      )}

      {selectedStart && !selectedEnd && (
        <p className="sg-hint">Now click an end time slot</p>
      )}
    </div>
  )
}
