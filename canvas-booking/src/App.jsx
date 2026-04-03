import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

import Sidebar       from './components/Sidebar'
import Calendar      from './components/Calendar'
import SlotGrid      from './components/SlotGrid'
import ConfirmModal  from './components/ConfirmModal'

import { BUILDINGS, START_SLOTS, END_SLOTS, APPS_SCRIPT_URL } from './constants'
import { toMins, fmtDate, fmtTime, todayISO, overlaps } from './utils'
import { getEvents, bookEvent } from './api'

/* ── View metadata ───────────────────────────────────────────────── */
const VIEW_META = {
  add:       { title: 'Add Event',        sub: 'Book a room in Canvas 1317 or Canvas 1331' },
  scheduled: { title: 'Scheduled Events', sub: 'All upcoming bookings across both buildings' },
}

/* ── Initial form state ──────────────────────────────────────────── */
const EMPTY_FORM = {
  building: '', date: '', startTime: '', endTime: '',
  attendees: '', eventName: '', contactPerson: '', contactNumber: '',
}

export default function App() {
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

  function navigate(name) {
    setView(name)
    setSidebarOpen(false)
    if (name === 'scheduled') loadEvents()
  }

  /* ── Form field change ─────────────────────────────────────────── */
  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
    setFormError('')
  }

  /* Fetch booked ranges for availability preview */
  const fetchPreview = useCallback(async (building, date) => {
    if (!building || !date || APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') {
      setBookedRanges([])
      return
    }
    setPreviewLoading(true)
    try {
      const evs = await getEvents({ building, date })
      setBookedRanges(evs.map(e => ({ s: toMins(e.startTime), e: toMins(e.endTime) })))
    } catch {
      setBookedRanges([])
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  /* Re-fetch preview whenever building or date changes */
  useEffect(() => {
    fetchPreview(form.building, form.date)
    // Reset time selections when context changes
    setForm(prev => ({ ...prev, startTime: '', endTime: '' }))
  }, [form.building, form.date, fetchPreview])

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

    if (contactNumber && !/^\d{10}$/.test(contactNumber)) {
      return 'Contact number must be exactly 10 digits (numbers only).'
    }
    if (attendees && parseInt(attendees, 10) < 1) {
      return 'Number of attendees must be at least 1.'
    }
    if (attendees && parseInt(attendees, 10) > 200) {
      return 'Maximum 200 attendees allowed per booking.'
    }
    if (APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') {
      return 'Setup needed: replace YOUR_APPS_SCRIPT_URL_HERE in src/constants.js with your Apps Script URL.'
    }
    return null
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
        showToast('success', `✓  "${form.eventName}" booked successfully!`)
        setForm(EMPTY_FORM)
        setShowConfirm(false)
        setBookedRanges([])
        setTimeout(() => navigate('scheduled'), 1500)
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
      const evs = await getEvents()
      setEvents(evs)
    } catch (err) {
      setEventsError('Could not load events. Check your connection and click Refresh.')
    } finally {
      setEventsLoading(false)
    }
  }, [])

  /* Filtered + sorted events */
  const visibleEvents = (filter === 'all' ? events : events.filter(e => e.building === filter))
    .slice()
    .sort((a, b) => {
      const d = b.date.localeCompare(a.date)
      return d !== 0 ? d : toMins(b.startTime) - toMins(a.startTime)
    })

  /* ── Filtered end-time options (disable <= start) ──────────────── */
  function endTimeOptions() {
    const startMins = form.startTime ? toMins(form.startTime) : -1
    return END_SLOTS.map(t => ({
      label:    t,
      value:    t,
      disabled: toMins(t) <= startMins,
    }))
  }

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
              <div className="topbar-title">{VIEW_META[view].title}</div>
              <div className="topbar-sub">{VIEW_META[view].sub}</div>
            </div>
          </div>

          <div className="content">

            {/* ── ADD EVENT ─────────────────────────────────────── */}
            {view === 'add' && (
              <div className="form-card">
                <div className="form-grid">

                  {/* Inline error alert */}
                  {formError && (
                    <div className="fg span2">
                      <div className="form-alert show">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" strokeWidth="2"
                             strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="12" y1="8"  x2="12"    y2="12"/>
                          <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        <span>{formError}</span>
                      </div>
                    </div>
                  )}

                  {/* Building */}
                  <div className="fg">
                    <label>Building</label>
                    <div className="sel-wrap">
                      <select value={form.building} onChange={e => setField('building', e.target.value)}>
                        <option value="">— Select Building —</option>
                        {BUILDINGS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Date — custom Calendar */}
                  <div className="fg">
                    <label>Date</label>
                    <Calendar value={form.date} onChange={d => setField('date', d)} />
                  </div>

                  {/* SlotGrid — availability preview */}
                  {form.building && form.date && (
                    <div className="fg span2">
                      <SlotGrid
                        bookedRanges={bookedRanges}
                        selectedStart={form.startTime}
                        selectedEnd={form.endTime}
                        onSelect={slot => setField('startTime', slot)}
                        loading={previewLoading}
                      />
                    </div>
                  )}

                  {/* Start Time */}
                  <div className="fg">
                    <label>Start Time</label>
                    <div className="sel-wrap">
                      <select value={form.startTime} onChange={e => setField('startTime', e.target.value)}>
                        <option value="">— Select Start Time —</option>
                        {START_SLOTS.map(t => {
                          const slotStart = toMins(t)
                          const slotEnd   = slotStart + 60
                          const isBooked  = bookedRanges.some(r => overlaps(slotStart, slotEnd, r.s, r.e))
                          return (
                            <option key={t} value={t}>
                              {t}{isBooked ? ' — booked' : ''}
                            </option>
                          )
                        })}
                      </select>
                    </div>
                  </div>

                  {/* End Time */}
                  <div className="fg">
                    <label>End Time</label>
                    <div className="sel-wrap">
                      <select value={form.endTime} onChange={e => setField('endTime', e.target.value)}>
                        <option value="">— Select End Time —</option>
                        {endTimeOptions().map(({ label, value, disabled }) => (
                          <option key={value} value={value} disabled={disabled}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Attendees */}
                  <div className="fg">
                    <label>No. of Attendees</label>
                    <input
                      type="number" min="1" max="200" placeholder="e.g. 12"
                      value={form.attendees}
                      onChange={e => setField('attendees', e.target.value)}
                    />
                  </div>

                  {/* Event Name */}
                  <div className="fg">
                    <label>Event Name</label>
                    <input
                      type="text" placeholder="e.g. Product Review"
                      value={form.eventName}
                      onChange={e => setField('eventName', e.target.value)}
                    />
                  </div>

                  {/* Contact Person */}
                  <div className="fg">
                    <label>Contact Person</label>
                    <input
                      type="text" placeholder="Full name"
                      value={form.contactPerson}
                      onChange={e => setField('contactPerson', e.target.value)}
                    />
                  </div>

                  {/* Contact Number */}
                  <div className="fg">
                    <label>Contact Number</label>
                    <input
                      type="tel" placeholder="10-digit number" maxLength={10}
                      value={form.contactNumber}
                      onChange={e => setField('contactNumber', e.target.value.replace(/[^0-9]/g, ''))}
                    />
                  </div>

                  {/* Submit */}
                  <div className="fg span2">
                    <button className="submit-btn" onClick={handleSubmitClick}>
                      Review &amp; Book
                    </button>
                  </div>

                </div>
              </div>
            )}

            {/* ── SCHEDULED EVENTS ──────────────────────────────── */}
            {view === 'scheduled' && (
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

                <div className="table-card">
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
                    <div className="table-scroll"><table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Building</th>
                          <th>Event Name</th>
                          <th>Date</th>
                          <th>Time</th>
                          <th>Attendees</th>
                          <th>Contact Person</th>
                          <th>Contact Number</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleEvents.map((e, i) => (
                          <tr key={`${e.building}-${e.date}-${e.startTime}-${i}`}>
                            <td className="td-num">{i + 1}</td>
                            <td><span className="badge">{e.building}</span></td>
                            <td className="td-name">{e.eventName}</td>
                            <td>{fmtDate(e.date)}</td>
                            <td style={{whiteSpace:'nowrap'}}>{fmtTime(e.startTime)}{e.endTime ? ` – ${fmtTime(e.endTime)}` : ''}</td>
                            <td>{e.attendees}</td>
                            <td>{e.contactPerson}</td>
                            <td>{e.contactNumber}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
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
