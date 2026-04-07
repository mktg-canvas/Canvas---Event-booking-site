import { fmtDate } from '../utils'
import './ConfirmModal.css'

/**
 * Booking confirmation modal.
 * Shown before final submission so the user can review their booking.
 *
 * Props:
 *   booking   {Object}   The form data to confirm
 *   onConfirm {function} Called when user clicks "Confirm & Book"
 *   onCancel  {function} Called when user clicks Cancel
 *   isLoading {bool}     Disable button and show spinner during API call
 */
export default function ConfirmModal({ booking, onConfirm, onCancel, isLoading }) {
  if (!booking) return null

  const rows = [
    { label: 'Building', value: booking.building },
    { label: 'Date', value: fmtDate(booking.date) },
    { label: 'Start Time', value: booking.startTime },
    { label: 'End Time', value: booking.endTime },
    { label: 'Attendees', value: booking.attendees },
    { label: 'Event Name', value: booking.eventName },
    { label: 'Contact Person', value: booking.contactPerson },
    { label: 'Contact Number', value: booking.contactNumber },
  ]

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true">

        {/* Header */}
        <div className="modal-header">
          <div className="modal-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="12" y1="14" x2="12" y2="18" />
              <line x1="10" y1="16" x2="14" y2="16" />
            </svg>
          </div>
          <div>
            <h2 className="modal-title">Confirm Booking</h2>
            <p className="modal-subtitle">Please review your booking before confirming.</p>
          </div>
          <button className="modal-close" onClick={onCancel} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Summary table */}
        <div className="modal-body">
          <dl className="confirm-list">
            {rows.map(({ label, value }) => (
              <div key={label} className="confirm-row">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Actions */}
        <div className="modal-footer">
          <button className="modal-cancel" onClick={onCancel} disabled={isLoading}>
            Cancel
          </button>
          <button className="modal-confirm" onClick={onConfirm} disabled={isLoading}>
            {isLoading
              ? <><span className="spinner spinner-sm" />&ensp;{booking.action === 'edit' ? 'Updating' : 'Booking'}&hellip;</>
              : (booking.action === 'edit' ? 'Confirm & Update' : 'Confirm & Book')
            }
          </button>
        </div>

      </div>
    </div>
  )
}
