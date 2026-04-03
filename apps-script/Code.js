// ═══════════════════════════════════════════════════════════════════
//  Canvas Event Manager — Google Apps Script  (v1.0)
//
//  Setup:
//  1. Open your Google Sheet → Extensions → Apps Script
//  2. Paste this entire file (replace any existing code)
//  3. Deploy → New Deployment → Web App
//       Execute as: Me  |  Who has access: Anyone
//  4. Copy the Web App URL
//  5. Paste it into canvas-booking/src/constants.js
//     where it says YOUR_APPS_SCRIPT_URL_HERE
// ═══════════════════════════════════════════════════════════════════

const SHEET_NAME = 'Events'

const HEADERS = [
  'Building', 'Date', 'Start Time', 'End Time',
  'Attendees', 'Event Name', 'Contact Person', 'Contact Number',
]

// ── GET — return events (optionally filtered by building + date) ───
function doGet(e) {
  try {
    const sheet  = getOrCreateSheet()
    let   events = readEvents(sheet)

    const fb = (e.parameter && e.parameter.building) || ''
    const fd = (e.parameter && e.parameter.date)     || ''
    if (fb) events = events.filter(ev => ev.building === fb)
    if (fd) events = events.filter(ev => ev.date     === fd)

    return json({ events })
  } catch (err) {
    return json({ error: err.message })
  }
}

// ── POST — validate, check conflicts, write booking ───────────────
function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents)
    const { building, date, startTime, endTime,
            attendees, eventName, contactPerson, contactNumber } = d

    // No fields are mandatory — submit whatever is provided

    const sheet  = getOrCreateSheet()
    const events = readEvents(sheet)
    const ns = toMins(startTime)
    const ne = toMins(endTime)

    for (const ev of events) {
      if (ev.building !== building || ev.date !== date) continue
      const es = toMins(ev.startTime)
      const ee = toMins(ev.endTime)
      if (ns < ee && ne > es) {
        return json({
          success: false, conflict: true,
          message: `Conflict: "${ev.eventName}" is already booked in ${ev.building} ` +
                   `from ${ev.startTime} to ${ev.endTime} on this date.`,
        })
      }
    }

    sheet.appendRow([building, date, startTime, endTime,
                     attendees, eventName, contactPerson, contactNumber])
    return json({ success: true })

  } catch (err) {
    return json({ success: false, message: err.message })
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function getOrCreateSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet()
  let   sheet = ss.getSheetByName(SHEET_NAME)
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME)
  if (sheet.getLastRow() === 0) {
    const r = sheet.getRange(1, 1, 1, HEADERS.length)
    r.setValues([HEADERS])
    r.setFontWeight('bold')
    r.setBackground('#F3F0FF')
  }
  // Keep Start Time and End Time columns as plain text so Sheets
  // never auto-converts them to Date/time values.
  sheet.getRange('C:D').setNumberFormat('@')
  return sheet
}

function readEvents(sheet) {
  const last = sheet.getLastRow()
  if (last < 2) return []
  return sheet.getRange(2, 1, last - 1, HEADERS.length)
    .getValues()
    .filter(r => r[0])
    .map(r => ({
      building:      String(r[0]),
      date:          normDate(r[1]),
      startTime:     normTime(r[2]),
      endTime:       normTime(r[3]),
      attendees:     Number(r[4]),
      eventName:     String(r[5]),
      contactPerson: String(r[6]),
      contactNumber: String(r[7]),
    }))
}

function normDate(v) {
  if (v instanceof Date)
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd')
  return String(v)
}

// Google Sheets auto-converts time strings to Date objects.
// This converts them back to "H:MM AM/PM" format matching our time slots.
function normTime(v) {
  if (v instanceof Date) {
    const formatted = Utilities.formatDate(v, Session.getScriptTimeZone(), 'h:mm a')
    return formatted.replace('am', 'AM').replace('pm', 'PM')
  }
  return String(v)
}


function toMins(t) {
  if (!t) return 0
  if (t === '12:00 AM (midnight)') return 1440
  const parts  = String(t).split(' ')
  const period = parts[1]
  let   h      = parseInt(parts[0].split(':')[0], 10)
  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0
  return h * 60
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
}
