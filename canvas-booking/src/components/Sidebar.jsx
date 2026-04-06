import { useState } from 'react'
import logo from '../assets/canvas-logo.png'
import { BUILDINGS, APP_VERSION } from '../constants'

export default function Sidebar({ activeView, onNavigate, isOpen, onClose }) {
  const [logoError, setLogoError] = useState(false)

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
      {/* Logo */}
      <div className="sb-logo">
        {/* Close button — mobile only */}
        <button className="sb-close" onClick={onClose} aria-label="Close menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2.5"
               strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6"  y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        {logoError ? (
          <div className="logo-text">
            <div className="lt-name">CANVAS</div>
            <div className="lt-tag">SPACE FOR BIG IDEAS</div>
          </div>
        ) : (
          <img
            src={logo}
            alt="Canvas"
            onError={() => setLogoError(true)}
          />
        )}
      </div>

      {/* Navigation */}
      <nav className="sb-nav">
        <span className="sb-nav-label">Navigation</span>

        <button
          className={`nav-btn ${activeView === 'add' ? 'active' : ''}`}
          onClick={() => onNavigate('add')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8"  y1="2" x2="8"  y2="6"/>
            <line x1="3"  y1="10" x2="21" y2="10"/>
            <line x1="12" y1="14" x2="12" y2="18"/>
            <line x1="10" y1="16" x2="14" y2="16"/>
          </svg>
          Add Event
        </button>

        <button
          className={`nav-btn ${activeView === 'upcoming' ? 'active' : ''}`}
          onClick={() => onNavigate('upcoming')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          Upcoming Events
        </button>

        <button
          className={`nav-btn ${activeView === 'past' ? 'active' : ''}`}
          onClick={() => onNavigate('past')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
          Past Events
        </button>
      </nav>

      {/* Footer */}
      <div className="sb-footer">
        {BUILDINGS.join(' · ')} · {APP_VERSION}
      </div>
    </aside>
  )
}
