// שכבת נתונים. בשלב 1 – localStorage עם נתוני דוגמה.
// בשלב 2 יוחלף ב-Firestore עם אותו ממשק (כל הפונקציות אסינכרוניות).
import { addDays, iso, todayIso, buildRound } from './scheduler.js';

const KEY = 'shlomit-hasaot:v1';
const uid = () => Math.random().toString(36).slice(2, 10);

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  const s = demoState();
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}
function persist() { localStorage.setItem(KEY, JSON.stringify(state)); }

// ---------- קריאה ----------
export const getState = async () => state;
export const volunteerById = (id) => state.volunteers.find(v => v.id === id);

// ---------- מתנדבים ----------
export async function addVolunteer({ name, phone, capacity }) {
  const v = { id: uid(), name: name.trim(), phone: phone.trim(), capacity: capacity === 2 ? 2 : 1, active: true };
  state.volunteers.push(v); persist(); return v;
}
export async function updateVolunteer(id, patch) {
  const v = volunteerById(id); if (!v) return;
  Object.assign(v, patch); persist();
}
export async function removeVolunteer(id) {
  const v = volunteerById(id); if (!v) return;
  v.active = false; persist(); // לא מוחקים – כדי שהיסטוריית הדיווחים תישאר
}

// ---------- שיבוצים ----------
export async function swapAssignment(date, newVolunteerId) {
  const a = state.assignments[date]; if (!a) return;
  if (!a.originalId) a.originalId = a.volunteerId;
  a.volunteerId = newVolunteerId;
  a.swappedAt = new Date().toISOString();
  if (a.originalId === newVolunteerId) { delete a.originalId; delete a.swappedAt; }
  persist();
}
export async function saveRound(round) {
  state.rounds.push({ id: round.id, seed: round.seed, start: round.start, end: round.end, createdAt: new Date().toISOString() });
  for (const slot of round.slots) {
    state.assignments[slot.date] = { volunteerId: slot.volunteerId, roundId: round.id };
  }
  persist();
}
export function lastScheduledDate() {
  const ds = Object.keys(state.assignments).sort();
  return ds[ds.length - 1] || null;
}

// ---------- דיווחים ----------
export async function saveReport(date, { reporterId, buses, ok, details }) {
  state.reports[date] = {
    reporterId, buses: Number(buses), ok: !!ok,
    details: ok ? '' : (details || '').trim(),
    createdAt: state.reports[date]?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  persist();
}

export async function resetDemo() { state = demoState(); persist(); }

// ---------- נתוני דוגמה ----------
function demoState() {
  const names = [
    ['מיכל אברהם', 2], ['יוסי כהן', 1], ['נועה לוי', 2], ['אבי פרץ', 1], ['שירה דהן', 1],
    ['דוד מזרחי', 2], ['רותם ביטון', 1], ['אורית שלום', 1], ['עמית גבאי', 2], ['הדס אוחיון', 1],
    ['אלון חדד', 1], ['טל יוסף', 1], ['מורן אזולאי', 2], ['איתי בן דוד', 1],
  ];
  const volunteers = names.map(([name, capacity], i) => ({
    id: 'v' + (i + 1), name, capacity, active: true,
    phone: '050-000' + String(1000 + i).slice(-4),
  }));
  const s = { volunteers, assignments: {}, reports: {}, rounds: [] };
  // סבב שהתחיל לפני כשבועיים, כדי שיהיו דיווחים ותחתית "המובילים"
  const start = addDays(todayIso(), -15);
  const round = buildRound({ volunteers, start, weekdays: [0, 1, 2, 3, 4, 5], excluded: [], seed: 'שלומית-1' });
  s.rounds.push({ id: round.id, seed: round.seed, start: round.start, end: round.end, createdAt: new Date().toISOString() });
  for (const slot of round.slots) s.assignments[slot.date] = { volunteerId: slot.volunteerId, roundId: round.id };
  // דיווחים לימים שעברו (חלק לא דווחו – כמו בחיים)
  const today = todayIso();
  const notes = ['ההסעה לחטיבה יצאה ב-7:31, שתי בנות רצו ולא הספיקו. נלקחו ברכב פרטי.', 'הסעה אחת לא הגיעה בכלל. דיברתי עם הרכז.', ''];
  let k = 0;
  for (const slot of round.slots) {
    if (slot.date >= today) break;
    k++;
    if (k % 4 === 0) continue; // לא דווח
    const bad = k % 5 === 2;
    s.reports[slot.date] = {
      reporterId: slot.volunteerId, buses: bad ? 3 : 4, ok: !bad,
      details: bad ? notes[k % 2] : '', createdAt: slot.date + 'T07:45:00', updatedAt: slot.date + 'T07:45:00',
    };
  }
  // דוגמה להחלפה
  const fut = round.slots.find(x => x.date > addDays(today, 1));
  if (fut) {
    const a = s.assignments[fut.date];
    const other = volunteers.find(v => v.id !== a.volunteerId);
    a.originalId = a.volunteerId; a.volunteerId = other.id; a.swappedAt = new Date().toISOString();
  }
  return s;
}

export { iso };
