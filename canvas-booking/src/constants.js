// ── Buildings ──────────────────────────────────────────────────────
export const BUILDINGS = ['Canvas 1317', 'Canvas 1331', 'Canvas 144', 'Others']

// ── Time slots ────────────────────────────────────────────────────
export const START_SLOTS = [
  '12:00 AM', '1:00 AM',  '2:00 AM',  '3:00 AM',
  '4:00 AM',  '5:00 AM',  '6:00 AM',  '7:00 AM',
  '8:00 AM',  '9:00 AM',  '10:00 AM', '11:00 AM',
  '12:00 PM', '1:00 PM',  '2:00 PM',  '3:00 PM',
  '4:00 PM',  '5:00 PM',  '6:00 PM',  '7:00 PM',
  '8:00 PM',  '9:00 PM',  '10:00 PM', '11:00 PM',
]

// End times include midnight as the final option
export const END_SLOTS = [...START_SLOTS, '12:00 AM (midnight)']

// ── App metadata ───────────────────────────────────────────────────
export const APP_VERSION = 'v1.0'
