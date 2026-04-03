// ═══════════════════════════════════════════════════════════════════
//  Canvas Event Manager — Google Apps Script  (v1.0)
//
//  HOW TO USE:
//  1. Open your Google Sheet → Extensions → Apps Script
//  2. Delete all existing code and paste this entire file
//  3. Click Deploy → New Deployment → Web App
//     • Execute as: Me
//     • Who has access: Anyone
//  4. Click Deploy → copy the Web App URL
//  5. Paste the URL into event-manager.html where it says
//     YOUR_APPS_SCRIPT_URL_HERE
// ═══════════════════════════════════════════════════════════════════

const SHEET_NAME = 'Events';

const COLUMNS = [
  'Building',       // A
  'Date',           // B
  'Start Time',     // C
  'End Time',       // D
  'Attendees',      // E
  'Event Name',     // F
  'Contact Person', // G
  'Contact Number'  // H
];

// ─────────────────────────────────────────────────────────────────
//  doGet  —  Return all (optionally filtered) events as JSON
// ─────────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const sheet  = getOrCreateSheet();
    let   events = readAllEvents(sheet);

    // Optional query-string filters (used by availability preview)
    const filterBuilding = (e.parameter && e.parameter.building) || '';
    const filterDate     = (e.parameter && e.parameter.date)     || '';

    if (filterBuilding) events = events.filter(ev => ev.building === filterBuilding);
    if (filterDate)     events = events.filter(ev => ev.date     === filterDate);

    return jsonResponse({ events });

  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────
//  doPost  —  Validate, check conflicts, then write a new booking
// ─────────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    const { building, date, startTime, endTime,
            attendees, eventName, contactPerson, contactNumber } = data;

    // Server-side presence check (client validates too, but be safe)
    if (!building || !date || !startTime || !endTime ||
        !attendees || !eventName || !contactPerson || !contactNumber) {
      return jsonResponse({ success: false, message: 'Missing required fields.' });
    }

    const sheet    = getOrCreateSheet();
    const existing = readAllEvents(sheet);
    const newStart = toMins(startTime);
    const newEnd   = toMins(endTime);

    // ── Conflict check ──────────────────────────────────────────
    //  Two bookings overlap when:
    //    newStart < existingEnd  AND  newEnd > existingStart
    for (const ev of existing) {
      if (ev.building !== building || ev.date !== date) continue;

      const exStart = toMins(ev.startTime);
      const exEnd   = toMins(ev.endTime);

      if (newStart < exEnd && newEnd > exStart) {
        return jsonResponse({
          success:  false,
          conflict: true,
          message:  `Conflict: "${ev.eventName}" is already booked in ${ev.building} ` +
                    `from ${ev.startTime} to ${ev.endTime} on this date. ` +
                    `Please choose a different time.`
        });
      }
    }

    // ── Write the new booking ───────────────────────────────────
    sheet.appendRow([
      building,
      date,
      startTime,
      endTime,
      attendees,
      eventName,
      contactPerson,
      contactNumber
    ]);

    return jsonResponse({ success: true });

  } catch (err) {
    return jsonResponse({ success: false, message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────

/** Get the Events sheet, creating it with headers if it doesn't exist. */
function getOrCreateSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Write column headers if the sheet is empty
  if (sheet.getLastRow() === 0) {
    const headerRange = sheet.getRange(1, 1, 1, COLUMNS.length);
    headerRange.setValues([COLUMNS]);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#F3F0FF');
  }

  return sheet;
}

/** Read all data rows (skipping the header) and return as objects. */
function readAllEvents(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];   // header only, or completely empty

  const values = sheet
    .getRange(2, 1, lastRow - 1, COLUMNS.length)
    .getValues();

  return values
    .filter(row => row[0])   // skip blank rows
    .map(row => ({
      building:      String(row[0]),
      date:          normDate(row[1]),
      startTime:     String(row[2]),
      endTime:       String(row[3]),
      attendees:     Number(row[4]),
      eventName:     String(row[5]),
      contactPerson: String(row[6]),
      contactNumber: String(row[7])
    }));
}

/**
 * Google Sheets sometimes auto-converts date strings to Date objects.
 * Normalise back to "yyyy-MM-dd" string so comparisons stay consistent.
 */
function normDate(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(val);
}

/**
 * Convert a time-slot label to minutes since midnight.
 *   "12:00 AM"           →    0
 *   "1:00 AM"            →   60
 *   "12:00 PM"           →  720
 *   "11:00 PM"           → 1380
 *   "12:00 AM (midnight)"→ 1440
 */
function toMins(t) {
  if (!t) return 0;
  if (t === '12:00 AM (midnight)') return 1440;

  const parts  = String(t).split(' ');
  const period = parts[1];
  let   h      = parseInt(parts[0].split(':')[0], 10);

  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;

  return h * 60;
}

/** Wrap any object as a JSON ContentService response. */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
