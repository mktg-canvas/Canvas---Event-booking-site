import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate as useRouterNavigate, Navigate } from 'react-router-dom'
import './App.css'

import Sidebar       from './components/Sidebar'
import Calendar      from './components/Calendar'
import SlotGrid      from './components/SlotGrid'
import ConfirmModal  from './components/ConfirmModal'

import { BUILDINGS } from './constants'
import { toMins, fmtDate, fmtTime, todayISO, overlaps } from './utils'
import { getEvents, bookEvent } from './api'
import { supabase } from './supabase'

/* ── View metadata ───────────────────────────────────────────────── */
const VIEW_META = {
  add:       { title: 'Add Event',        sub: 'Book a room in Canvas 1317 or Canvas 1331' },
  edit:      { title: 'Edit Event',       sub: 'Update the details for this booking' },
  upcoming:  { title: 'Upcoming Events',  sub: 'Future bookings across both buildings' },
  past:      { title: 'Past Events',      sub: 'Previous bookings across both buildings' },
}

/* ── Initial form state ──────────────────────────────────────────── */
const EMPTY_FORM = {
  id: '', action: '', building: '', date: '', startTime: '', endTime: '',
  attendees: '', eventName: '', contactPerson: '', contactNumber: '', otherDetails: '',
}

export default function App() {
  /* ── Auth ──────────────────────────────────────────────────────── */
  const routerNavigate = useRouterNavigate()
  const [session, setSession] = useState(undefined) // undefined=loading, null=no session

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    routerNavigate('/admin/login', { replace: true })
  }

  /* ── Navigation ────────────────────────────────────────────────── */
  const [view, setView] = useState('add')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  /* ── Form ──────────────────────────────────────────────────────── */
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  /* ── Availability preview ──────────────────────────────────────── */
  const [bookedRanges,  setBookedRanges]  = useState([])
  const [previewLoading, setPreviewLoading] = useState(false)

  /* ── Scheduled Events ──────────────────────────────────────────── */
  const [events,        setEvents]        = useState([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError,   setEventsError]   = useState('')
  const [filter,        setFilter]        = useState('all')

  /* ── Toast ─────────────────────────────────────────────────────── */
  const [toast, setToast] = useState(null)   // { type, msg }
  const toastTimer = useRef(null)

  /* ── Helpers ───────────────────────────────────────────────────── */
  function showToast(type, msg) {
    clearTimeout(toastTimer.current)
    setToast({ type, msg })
    toastTimer.current = setTimeout(() => setToast(null), 4200)
  }

  // Clean up toast timer on unmount
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  function navigate(name) {
    setView(name)
    setSidebarOpen(false)
    // Only fetch if we have no data yet; Refresh button handles manual reloads
    if ((name === 'upcoming' || name === 'past') && events.length === 0) loadEvents()
  }

  /* ── Form field change ─────────────────────────────────────────── */
  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
    setFormError('')
  }

  /* Fetch booked ranges for availability preview */
  const fetchPreview = useCallback(async (building, date, currentId) => {
    if (!building || !date) {
      setBookedRanges([])
      return
    }
    setPreviewLoading(true)
    try {
      const evs = await getEvents({ building, date })
      // Filter out the current event being edited so its time appears free in the grid
      setBookedRanges(
        evs
          .filter(e => e.startTime && e.id !== currentId)
          .map(e => {
            const s = toMins(e.startTime)
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

  /* Re-fetch preview whenever building or date changes */
  useEffect(() => {
    fetchPreview(form.building, form.date, form.id)
    // Only reset time selections if we are adding a new event, 
    // or if the user is actively changing the building/date during an edit.
    // We avoid resetting if they just clicked 'Edit' and the form is populating.
    if (form.action !== 'edit') {
      setForm(prev => ({ ...prev, startTime: '', endTime: '' }))
    }
  }, [form.building, form.date, form.id, fetchPreview])

  /* When start time changes, clear end time if now invalid */
  useEffect(() => {
    if (form.startTime && form.endTime) {
      if (toMins(form.endTime) <= toMins(form.startTime)) {
        setForm(prev => ({ ...prev, endTime: '' }))
      }
    }
  }, [form.startTime])

  /* ── Form validation ───────────────────────────────────────────── */
  function validate() {
    const { building, date, startTime, endTime,
            attendees, eventName, contactPerson, contactNumber } = form

    if (!building) return 'Please select a building.'
    if (!date) return 'Please select a date.'
    if (!startTime || !endTime) return 'Please select a time range.'
    if (!eventName.trim()) return 'Please enter an event name.'
    if (!contactPerson.trim()) return 'Please enter a contact person.'
    if (contactNumber && !/^\d{10}$/.test(contactNumber)) {
      return 'Contact number must be exactly 10 digits (numbers only).'
    }
    if (attendees && parseInt(attendees, 10) < 1) {
      return 'Number of attendees must be at least 1.'
    }
    if (attendees && parseInt(attendees, 10) > 200) {
      return 'Maximum 200 attendees allowed per booking.'
    }
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
      const payload = {
        ...form,
        attendees: parseInt(form.attendees, 10),
      }
      const result = await bookEvent(payload)

      if (result.success) {
        const msg = form.action === 'edit' 
          ? `✓  "${form.eventName}" updated successfully!`
          : `✓  "${form.eventName}" booked successfully!`
        showToast('success', msg)
        setForm(EMPTY_FORM)
        setShowConfirm(false)
        setBookedRanges([])
        setTimeout(() => navigate('upcoming'), 1500)
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

  /* ── Load scheduled events ─────────────────────────────────────── */
  const loadEvents = useCallback(async () => {
    setEventsLoading(true)
    setEventsError('')
    try {
      // Pass true for isAdmin to fetch all details like names and numbers
      const evs = await getEvents({}, true)
      setEvents(evs)
    } catch (err) {
      setEventsError('Could not load events. Check your connection and click Refresh.')
    } finally {
      setEventsLoading(false)
    }
  }, [])

  /* Filtered + sorted events */
  const visibleEvents = useMemo(() => {
    const today = todayISO()
    return (filter === 'all' ? events : events.filter(e => e.building === filter))
      .filter(e => {
        if (!e.date) return false   // skip events with no date
        const isPast = e.date < today
        return view === 'past' ? isPast : !isPast
      })
      .sort((a, b) => {
        if (view === 'past') {
          const d = b.date.localeCompare(a.date)
          return d !== 0 ? d : toMins(b.startTime) - toMins(a.startTime)
        } else {
          const d = a.date.localeCompare(b.date)
          return d !== 0 ? d : toMins(a.startTime) - toMins(b.startTime)
        }
      })
  }, [events, filter, view])

  /* ── Slot grid two-click range selection ───────────────────────── */
  function handleSlotClick(slot) {
    const { startTime, endTime } = form
    if (!startTime || endTime) {
      // No start yet, or both already set → reset and pick new start
      setForm(prev => ({ ...prev, startTime: slot, endTime: '' }))
      setFormError('')
    } else if (toMins(slot) > toMins(startTime)) {
      // Check if proposed range overlaps any booked slot
      const rangeStart = toMins(startTime)
      const rangeEnd   = toMins(slot)
      const conflict   = bookedRanges.some(r => overlaps(rangeStart, rangeEnd, r.s, r.e))
      if (conflict) {
        setFormError('This time range overlaps an existing booking. Choose a different slot.')
        return
      }
      setForm(prev => ({ ...prev, endTime: slot }))
      setFormError('')
    } else {
      // Clicked same slot or before start → reset to new start
      setForm(prev => ({ ...prev, startTime: slot, endTime: '' }))
      setFormError('')
    }
  }

  /* ── Edit Event ────────────────────────────────────────────────── */
  function handleEditClick(e) {
    setForm({ ...e, action: 'edit' })
    setView('edit')
    setFormError('')
  }

  /* ── Auth guard ────────────────────────────────────────────────── */
  if (session === undefined) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh' }}>
      <span className="spinner spinner-md" />
    </div>
  )
  if (!session) return <Navigate to="/admin/login" replace />

  /* ── Render ────────────────────────────────────────────────────── */
  return (
    <>
      <div className="app">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
        )}

        <Sidebar
          activeView={view}
          onNavigate={navigate}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onLogout={handleLogout}
        />

        <div className="main">
          {/* Topbar */}
          <div className="topbar">
            {/* Hamburger — mobile only */}
            <button className="hamburger" onClick={() => setSidebarOpen(o => !o)} aria-label="Menu">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.2"
                   strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6"  x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <div>
              <div className="topbar-title">{VIEW_META[view]?.title}</div>
              <div className="topbar-sub">{VIEW_META[view]?.sub}</div>
            </div>
          </div>

          <div className="content">

            {/* ── ADD/EDIT EVENT ─────────────────────────────────── */}
            {(view === 'add' || view === 'edit') && (
              <div className="form-card">

                {/* ── Step 1: Where? ── */}
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

                {/* ── Step 2: When? ── */}
                <div className="form-step">
                  <div className="step-header">
                    <span className="step-num">2</span>
                    <span className="step-title">When?</span>
                  </div>
                  <div className="when-grid">
                    {/* Left: Calendar */}
                    <div className="when-cal">
                      <Calendar value={form.date} onChange={d => setField('date', d)} />
                    </div>

                    {/* Right: Time availability */}
                    <div className="when-time">
                      {form.building && form.date ? (
                        <>
                          <SlotGrid
                            bookedRanges={bookedRanges}
                            selectedStart={form.startTime}
                            selectedEnd={form.endTime}
                            selectedDate={form.date}
                            onSelect={handleSlotClick}
                            loading={previewLoading}
                          />
                        </>
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

                {/* ── Step 3: Event Details ── */}
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
                  {form.action === 'edit' ? 'Review & Update' : 'Review & Book'}
                </button>

                {/* Inline error alert (moved below button) */}
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
            )}

            {/* ── UPCOMING & PAST EVENTS ──────────────────────────── */}
            {(view === 'upcoming' || view === 'past') && (
              <>
                <div className="ev-header">
                  <div className="pills">
                    {['all', ...BUILDINGS].map(b => (
                      <button
                        key={b}
                        className={`pill ${filter === b ? 'active' : ''}`}
                        onClick={() => setFilter(b)}
                      >
                        {b === 'all' ? 'All Buildings' : b}
                      </button>
                    ))}
                  </div>
                  <button className="refresh-btn" onClick={loadEvents}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10"/>
                      <polyline points="1 20 1 14 7 14"/>
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                    Refresh
                  </button>
                </div>

                <div className="events-container">
                  {eventsLoading ? (
                    <div className="state-box">
                      <span className="spinner spinner-md" />
                      <p style={{ marginTop: 12 }}>Loading events…</p>
                    </div>
                  ) : eventsError ? (
                    <div className="state-box">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                           strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <h3>Could not load events</h3>
                      <p>{eventsError}</p>
                    </div>
                  ) : visibleEvents.length === 0 ? (
                    <div className="state-box">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                           strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8"  y1="2" x2="8"  y2="6"/>
                        <line x1="3"  y1="10" x2="21" y2="10"/>
                      </svg>
                      <h3>No events booked yet</h3>
                      <p>Switch to Add Event to schedule the first booking.</p>
                    </div>
                  ) : (
                    <div className="events-grid">
                      {visibleEvents.map((e, i) => {
                        const isNextEvent = view === 'upcoming' && i === 0;
                        return (
                        <div key={`${e.building}-${e.date}-${e.startTime}-${i}`} className={`event-card ${isNextEvent ? 'next-event-card' : ''}`}>
                          <div className="event-card-header">
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span className="badge">{e.building}</span>
                              {isNextEvent && <span className="badge badge-up-next">Up Next</span>}
                            </div>
                            <span className="event-card-date">{fmtDate(e.date)}</span>
                          </div>
                          <h3 className="event-card-title">{e.eventName}</h3>
                          <div className="event-card-time">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            {fmtTime(e.startTime)}{e.endTime ? ` – ${fmtTime(e.endTime)}` : ''}
                          </div>
                          <div className="event-card-details">
                            <div className="event-card-detail">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                              {e.attendees} Attendees
                            </div>
                            <div className="event-card-detail">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                              {e.contactPerson}
                            </div>
                            <div className="event-card-detail">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                              {e.contactNumber
                                ? <a href={`tel:${e.contactNumber}`} className="tel-link">{e.contactNumber}</a>
                                : '—'}
                            </div>
                          </div>
                          <div className="event-card-actions">
                            <button className="edit-btn" onClick={() => handleEditClick(e)}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                              Edit
                            </button>
                          </div>
                        </div>
                      )})}
                    </div>
                  )}
                </div>
              </>
            )}

          </div>{/* /content */}
        </div>{/* /main */}
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <ConfirmModal
          booking={form}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
          isLoading={submitting}
        />
      )}

      {/* Toast notification */}
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
    </>
  )
}
