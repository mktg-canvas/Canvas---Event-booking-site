import { useState, useEffect, useCallback, useRef } from 'react'
import Calendar     from './components/Calendar'
import SlotGrid     from './components/SlotGrid'
import ConfirmModal from './components/ConfirmModal'
import { BUILDINGS } from './constants'
import { toMins, overlaps } from './utils'
import { getEvents, bookEvent } from './api'
import logo from './assets/canvas-logo.png'
import './App.css'
import './PublicBooking.css'

const EMPTY_FORM = {
  id: '', action: 'add', building: '', date: '', startTime: '', endTime: '',
  attendees: '', eventName: '', contactPerson: '', contactNumber: '', otherDetails: '',
}

export default function PublicBooking() {
  /* ── Form ──────────────────────────────────────────────────────── */
  const [form,       setFormState] = useState(EMPTY_FORM)
  const [formError,  setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  /* ── Availability preview ──────────────────────────────────────── */
  const [bookedRanges,   setBookedRanges]   = useState([])
  const [previewLoading, setPreviewLoading] = useState(false)

  /* ── Toast ─────────────────────────────────────────────────────── */
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  function showToast(type, msg) {
    clearTimeout(toastTimer.current)
    setToast({ type, msg })
    toastTimer.current = setTimeout(() => setToast(null), 7000)
  }

  function setField(key, value) {
    setFormState(prev => ({ ...prev, [key]: value }))
    setFormError('')
  }

  /* ── Fetch booked ranges for SlotGrid ──────────────────────────── */
  const fetchPreview = useCallback(async (building, date) => {
    if (!building || !date) { setBookedRanges([]); return }
    setPreviewLoading(true)
    try {
      const evs = await getEvents({ building, date })
      setBookedRanges(
        evs
          .filter(e => e.startTime)
          .map(e => {
            const s  = toMins(e.startTime)
            const e_ = e.endTime ? toMins(e.endTime) : s + 60
            return { s, e: e_ }
          })
          .filter(r => r.e > r.s)
      )
    } catch {
      setBookedRanges([])
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  /* Re-fetch when building or date changes and reset time selection */
  useEffect(() => {
    fetchPreview(form.building, form.date)
    setFormState(prev => ({ ...prev, startTime: '', endTime: '' }))
  }, [form.building, form.date, fetchPreview])

  /* Clear end time if start changes and makes end invalid */
  useEffect(() => {
    if (form.startTime && form.endTime) {
      if (toMins(form.endTime) <= toMins(form.startTime)) {
        setFormState(prev => ({ ...prev, endTime: '' }))
      }
    }
  }, [form.startTime])

  /* ── Slot grid two-click range selection ───────────────────────── */
  function handleSlotClick(slot) {
    const { startTime, endTime } = form
    if (!startTime || endTime) {
      setFormState(prev => ({ ...prev, startTime: slot, endTime: '' }))
      setFormError('')
    } else if (toMins(slot) > toMins(startTime)) {
      const rangeStart = toMins(startTime)
      const rangeEnd   = toMins(slot)
      const conflict   = bookedRanges.some(r => overlaps(rangeStart, rangeEnd, r.s, r.e))
      if (conflict) {
        setFormError('This time range overlaps an existing booking. Choose a different slot.')
        return
      }
      setFormState(prev => ({ ...prev, endTime: slot }))
      setFormError('')
    } else {
      setFormState(prev => ({ ...prev, startTime: slot, endTime: '' }))
      setFormError('')
    }
  }

  /* ── Validation ────────────────────────────────────────────────── */
  function validate() {
    const { building, date, startTime, endTime,
            attendees, eventName, contactPerson, contactNumber } = form
    if (!building)  return 'Please select a building.'
    if (!date)      return 'Please select a date.'
    if (!startTime || !endTime) return 'Please select a time range.'
    if (!eventName.trim())      return 'Please enter an event name.'
    if (!contactPerson.trim())  return 'Please enter a contact person.'
    if (contactNumber && !/^\d{10}$/.test(contactNumber))
      return 'Contact number must be exactly 10 digits (numbers only).'
    if (attendees && parseInt(attendees, 10) < 1)   return 'Number of attendees must be at least 1.'
    if (attendees && parseInt(attendees, 10) > 200) return 'Maximum 200 attendees allowed per booking.'
    return ''
  }

  function handleSubmitClick() {
    const err = validate()
    if (err) { setFormError(err); return }
    setFormError('')
    setShowConfirm(true)
  }

  async function handleConfirm() {
    setSubmitting(true)
    try {
      const payload = { ...form, attendees: parseInt(form.attendees, 10) }
      const result  = await bookEvent(payload)

      if (result.success) {
        showToast('success', `Your booking request has been received! Our team will contact you shortly.`)
        setFormState(EMPTY_FORM)
        setShowConfirm(false)
        setBookedRanges([])
      } else if (result.conflict) {
        setShowConfirm(false)
        setFormError(result.message || 'This time slot conflicts with an existing booking.')
      } else {
        setShowConfirm(false)
        setFormError(result.message || 'Something went wrong. Please try again.')
      }
    } catch {
      setShowConfirm(false)
      setFormError('Network error — could not reach the booking server.')
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Render ────────────────────────────────────────────────────── */
  return (
    <div className="public-page">

      {/* Header */}
      <header className="public-header">
        <img src={logo} alt="Canvas" className="public-logo"
             onError={e => { e.target.style.display = 'none' }} />
        <div className="public-header-divider" />
        <div className="public-header-text">
          <span className="public-title">Book an Event</span>
          <span className="public-sub">Reserve a space at Canvas Workspace</span>
        </div>
      </header>

      {/* Form */}
      <main className="public-main">
        <div className="form-card">

          {/* Step 1: Where? */}
          <div className="form-step">
            <div className="step-header">
              <span className="step-num">1</span>
              <span className="step-title">Where?</span>
            </div>
            <div className="building-pills">
              {BUILDINGS.map(b => (
                <button
                  key={b}
                  className={`building-pill ${form.building === b ? 'active' : ''}`}
                  onClick={() => setField('building', b)}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: When? */}
          <div className="form-step">
            <div className="step-header">
              <span className="step-num">2</span>
              <span className="step-title">When?</span>
            </div>
            <div className="when-grid">
              <div className="when-cal">
                <Calendar value={form.date} onChange={d => setField('date', d)} />
              </div>
              <div className="when-time">
                {form.building && form.date ? (
                  <SlotGrid
                    bookedRanges={bookedRanges}
                    selectedStart={form.startTime}
                    selectedEnd={form.endTime}
                    selectedDate={form.date}
                    onSelect={handleSlotClick}
                    loading={previewLoading}
                  />
                ) : (
                  <div className="time-placeholder">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="1.5"
                         strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <p>Select a building &amp; date to check availability</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Step 3: Event Details */}
          <div className="form-step form-step-last">
            <div className="step-header">
              <span className="step-num">3</span>
              <span className="step-title">Event Details</span>
            </div>
            <div className="details-grid">
              <div className="fg">
                <label>Event Name</label>
                <input
                  type="text" placeholder="e.g. Product Review"
                  value={form.eventName}
                  onChange={e => setField('eventName', e.target.value)}
                />
              </div>
              <div className="fg">
                <label>No. of Attendees</label>
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*" placeholder="e.g. 12"
                  value={form.attendees}
                  onChange={e => setField('attendees', e.target.value.replace(/[^0-9]/g, ''))}
                />
              </div>
              <div className="fg">
                <label>Contact Person</label>
                <input
                  type="text" placeholder="Full name"
                  value={form.contactPerson}
                  onChange={e => setField('contactPerson', e.target.value)}
                />
              </div>
              <div className="fg">
                <label>Contact Number</label>
                <input
                  type="tel" placeholder="10-digit number" maxLength={10}
                  value={form.contactNumber}
                  onChange={e => setField('contactNumber', e.target.value.replace(/[^0-9]/g, ''))}
                />
              </div>
              <div className="fg fg-full">
                <label>Other Details</label>
                <textarea
                  placeholder="Any additional information, requirements, or notes…"
                  value={form.otherDetails}
                  onChange={e => setField('otherDetails', e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          </div>

          {/* Submit */}
          <button className="submit-btn" onClick={handleSubmitClick}>
            Review &amp; Book
          </button>

          {formError && (
            <div className="form-alert show" style={{ marginTop: 20 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8"  x2="12"    y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>{formError}</span>
            </div>
          )}

        </div>
      </main>

      {/* Confirmation modal */}
      {showConfirm && (
        <ConfirmModal
          booking={form}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
          isLoading={submitting}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast t-${toast.type} show`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {toast.type === 'success'
              ? <polyline points="20 6 9 17 4 12"/>
              : <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
            }
          </svg>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  )
}
