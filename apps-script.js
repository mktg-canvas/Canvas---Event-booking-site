// ═══════════════════════════════════════════════════════════════════════
//  Canvas Event Manager — Google Apps Script
//  Paste this entire file into Extensions → Apps Script in your Sheet.
//  Then deploy as a Web App (Anyone access) and copy the URL into
//  event-manager.html where it says YOUR_APPS_SCRIPT_URL_HERE.
// ═══════════════════════════════════════════════════════════════════════

const SHEET_NAME = 'Events';

const HEADERS = [
  'Building', 'Date', 'Start Time', 'End Time',
  'Attendees', 'Event Name', 'Contact Person', 'Contact Number'
];

// ── GET: return events as JSON ────────────────────────────────────────
function doGet(e) {
  try {
    const sheet  = getSheet();
    const events = readEvents(sheet);

    // Optional filters from query params (used for availability preview)
    const building = e.parameter.building || '';
    const date     = e.parameter.date     || '';

    const filtered = events.filter(ev => {
      if (building && ev.building !== building) return false;
      if (date     && ev.date     !== date)     return false;
      return true;
    });

    return respond({ events: filtered });

  } catch (err) {
    return respond({ error: err.message }, true);
  }
}

// ── POST: validate conflict, then write ──────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    const { building, date, startTime, endTime,
            attendees, eventName, contactPerson, contactNumber } = data;

    // Basic server-side presence check
    if (!building || !date || !startTime || !endTime ||
        !attendees || !eventName || !contactPerson || !contactNumber) {
      return respond({ success: false, message: 'Missing required fields.' });
    }

    const sheet      = getSheet();
    const existing   = readEvents(sheet);
    const newStart   = toMins(startTime);
    const newEnd     = toMins(endTime);

    // Check for time overlap on same building + date
    for (const ev of existing) {
      if (ev.building !== building || ev.date !== date) continue;

      const exStart = toMins(ev.startTime);
      const exEnd   = toMins(ev.endTime);

      // Overlap: newStart < exEnd AND newEnd > exStart
      if (newStart < exEnd && newEnd > exStart) {
        return respond({
          success:  false,
          conflict: true,
          message:  `Conflict: "${ev.eventName}" is already booked in ${ev.building} from ${ev.startTime} to ${ev.endTime} on this date. Please choose a different time.`
        });
      }
    }

    // No conflict — write the row
    sheet.appendRow([
      building, date, startTime, endTime,
      attendees, eventName, contactPerson, contactNumber
    ]);

    return respond({ success: true });

  } catch (err) {
    return respond({ success: false, message: err.message }, true);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function getSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Write headers if the sheet is empty
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }

  return sheet;
}

function readEvents(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return []; // only headers or empty

  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();

  return rows
    .filter(row => row[0]) // skip blank rows
    .map(row => ({
      building:      String(row[0]),
      date:          formatDateValue(row[1]),
      startTime:     String(row[2]),
      endTime:       String(row[3]),
      attendees:     Number(row[4]),
      eventName:     String(row[5]),
      contactPerson: String(row[6]),
      contactNumber: String(row[7])
    }));
}

// Google Sheets may parse date strings as Date objects — normalise back
function formatDateValue(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(val);
}

// Convert time string to minutes since midnight for overlap arithmetic
function toMins(t) {
  if (!t) return 0;
  if (t === '12:00 AM (midnight)') return 1440;

  const parts  = t.split(' ');
  const period = parts[1];
  let   h      = parseInt(parts[0].split(':')[0], 10);

  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;

  return h * 60;
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
