// שכבת נתונים: מצב דוגמה (localStorage) או Firebase – אותו ממשק.
// state: { volunteers:[{id,name,capacity,active,phone?}], assignments:{date:{volunteerId,originalId?,swappedAt?,roundId,rep?}},
//          reports:{date:{reporterId,buses,ok,details?,...}}, rounds:[] }
// אצל מי שאינו מנהל, reports נבנה מתוך assignment.rep (בלי פירוט – הפירוט למנהלים בלבד).
import { firebaseConfig } from './config.js';
import { addDays, todayIso, buildRound } from './scheduler.js';

const LS_KEY = 'shlomit-hasaot:v1';
const SITE_KEY = 'shlomit-hasaot:key';
const uid = () => Math.random().toString(36).slice(2, 10);
const listeners = new Set();
const emit = () => listeners.forEach(f => f());

export const mode = firebaseConfig ? 'firebase' : 'demo';
export const session = { isAdmin: mode === 'demo', user: null, key: null, needsKey: false };
let state = { volunteers: [], assignments: {}, reports: {}, rounds: [] };
let fb = null; // מודולי Firebase אחרי טעינה

export const onChange = (f) => listeners.add(f);
export const getState = async () => state;
export const volunteerById = (id) => state.volunteers.find(v => v.id === id);

// ================= אתחול =================
export async function init() {
  if (mode === 'demo') {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) state = JSON.parse(raw); } catch (e) { /* ignore */ }
    if (!state.volunteers.length) { state = demoState(); saveLocal(); }
    return;
  }
  await initFirebase();
}
function saveLocal() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }

async function initFirebase() {
  const V = '10.12.5', base = `https://www.gstatic.com/firebasejs/${V}/`;
  const [appM, fsM, authM] = await Promise.all([
    import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js'), import(base + 'firebase-auth.js'),
  ]);
  const app = appM.initializeApp(firebaseConfig);
  fb = { ...fsM, ...authM, db: fsM.getFirestore(app), auth: authM.getAuth(app) };

  // מפתח היישוב: מהקישור (?k=...) או ממה שנשמר בדפדפן
  const url = new URL(location.href);
  const k = url.searchParams.get('k');
  if (k) {
    localStorage.setItem(SITE_KEY, k);
    url.searchParams.delete('k');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  session.key = localStorage.getItem(SITE_KEY);

  // מחכים לזיהוי ההתחברות הראשון
  await new Promise(res => { const off = fb.onAuthStateChanged(fb.auth, u => { off(); res(); }); });
  await refreshAdmin();
  fb.onAuthStateChanged(fb.auth, async () => { await refreshAdmin(); await loadAll(); emit(); });

  await loadAll();
}

async function refreshAdmin() {
  const u = fb.auth.currentUser;
  session.user = u ? { uid: u.uid, name: u.displayName, email: u.email } : null;
  session.isAdmin = false;
  if (!u) return;
  try {
    session.isAdmin = (await fb.getDoc(fb.doc(fb.db, 'admins', u.uid))).exists();
  } catch (e) { session.isAdmin = false; }
  if (session.isAdmin && !session.key) {
    // למנהל: המפתח שמור ב-config/site. אם אין – יוצרים חדש.
    const cfg = await fb.getDoc(fb.doc(fb.db, 'config', 'site'));
    let key = cfg.exists() ? cfg.data().key : null;
    if (!key) {
      key = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
      await fb.setDoc(fb.doc(fb.db, 'keys', key), { createdAt: new Date().toISOString() });
      await fb.setDoc(fb.doc(fb.db, 'config', 'site'), { key });
    }
    session.key = key; localStorage.setItem(SITE_KEY, key);
  }
}

const kcol = (name) => fb.collection(fb.db, 'k', session.key, name);
const kdoc = (name, id) => fb.doc(fb.db, 'k', session.key, name, id);

async function loadAll() {
  session.needsKey = !session.key;
  if (!session.key) { state = { volunteers: [], assignments: {}, reports: {}, rounds: [] }; return; }
  const s = { volunteers: [], assignments: {}, reports: {}, rounds: [] };
  try {
    const [vs, as, rs] = await Promise.all([fb.getDocs(kcol('volunteers')), fb.getDocs(kcol('assignments')), fb.getDocs(kcol('rounds'))]);
    vs.forEach(d => s.volunteers.push({ id: d.id, ...d.data() }));
    as.forEach(d => { s.assignments[d.id] = d.data(); });
    rs.forEach(d => s.rounds.push({ id: d.id, ...d.data() }));
  } catch (e) {
    // מפתח שגוי / לא קיים
    console.warn(e); session.needsKey = true; state = s; return;
  }
  for (const [date, a] of Object.entries(s.assignments)) if (a.rep) s.reports[date] = { reporterId: a.rep.by, ok: a.rep.ok, buses: a.rep.buses, updatedAt: a.rep.at };
  if (session.isAdmin) {
    const [rep, con] = await Promise.all([fb.getDocs(kcol('reports')), fb.getDocs(fb.collection(fb.db, 'contacts'))]);
    rep.forEach(d => { s.reports[d.id] = d.data(); });
    const phones = {}; con.forEach(d => { phones[d.id] = d.data().phone; });
    s.volunteers.forEach(v => { v.phone = phones[v.id] || ''; });
  }
  state = s;
}

export async function signIn() {
  await fb.signInWithPopup(fb.auth, new fb.GoogleAuthProvider());
}
export async function signOut() { await fb.signOut(fb.auth); }
export function shareLink() {
  return `${location.origin}${location.pathname}?k=${session.key}`;
}

// ================= מתנדבים =================
export async function addVolunteer({ name, phone, capacity }) {
  const v = { id: uid(), name: name.trim(), capacity: capacity === 2 ? 2 : 1, active: true };
  if (mode === 'firebase') {
    await fb.setDoc(kdoc('volunteers', v.id), { name: v.name, capacity: v.capacity, active: true });
    await fb.setDoc(fb.doc(fb.db, 'contacts', v.id), { phone: phone.trim(), name: v.name });
  }
  state.volunteers.push({ ...v, phone: phone.trim() });
  if (mode === 'demo') saveLocal();
  return v;
}
export async function updateVolunteer(id, patch) {
  const v = volunteerById(id); if (!v) return;
  Object.assign(v, patch);
  if (mode === 'firebase') {
    const { phone, ...pub } = patch;
    if (Object.keys(pub).length) await fb.updateDoc(kdoc('volunteers', id), pub);
    if (phone !== undefined) await fb.setDoc(fb.doc(fb.db, 'contacts', id), { phone, name: v.name });
  } else saveLocal();
}
export async function removeVolunteer(id) { await updateVolunteer(id, { active: false }); } // היסטוריה נשמרת

// ================= שיבוצים =================
export async function swapAssignment(date, newVolunteerId) {
  const a = state.assignments[date]; if (!a) return;
  if (!a.originalId) a.originalId = a.volunteerId;
  a.volunteerId = newVolunteerId;
  a.swappedAt = new Date().toISOString();
  if (a.originalId === newVolunteerId) { a.originalId = null; a.swappedAt = null; }
  if (mode === 'firebase') {
    await fb.updateDoc(kdoc('assignments', date), { volunteerId: a.volunteerId, originalId: a.originalId || null, swappedAt: a.swappedAt || null });
  } else saveLocal();
}
export async function saveRound(round) {
  const meta = { seed: round.seed, start: round.start, end: round.end, createdAt: new Date().toISOString() };
  state.rounds.push({ id: round.id, ...meta });
  for (const slot of round.slots) state.assignments[slot.date] = { volunteerId: slot.volunteerId, roundId: round.id };
  if (mode === 'firebase') {
    const b = fb.writeBatch(fb.db);
    b.set(kdoc('rounds', round.id), meta);
    for (const slot of round.slots) b.set(kdoc('assignments', slot.date), { volunteerId: slot.volunteerId, roundId: round.id });
    await b.commit();
  } else saveLocal();
}
// שיבוץ ידני של מנהל – בלי סימון "החלפה" (כך שהמשובץ יקבל גם את תזכורת השבוע)
export async function setAssignment(date, volunteerId) {
  const prev = state.assignments[date] || {};
  const a = { volunteerId, roundId: 'manual', originalId: null, swappedAt: null };
  if (prev.rep) a.rep = prev.rep;
  state.assignments[date] = a;
  if (mode === 'firebase') await fb.setDoc(kdoc('assignments', date), a);
  else saveLocal();
}
export async function deleteAssignment(date) {
  delete state.assignments[date];
  if (mode === 'firebase') await fb.deleteDoc(kdoc('assignments', date));
  else saveLocal();
}
export function lastScheduledDate() {
  const ds = Object.keys(state.assignments).sort();
  return ds[ds.length - 1] || null;
}

// ================= דיווחים =================
export async function saveReport(date, { reporterId, buses, ok, details }) {
  const now = new Date().toISOString();
  const r = {
    reporterId, buses: Number(buses), ok: !!ok,
    details: ok ? '' : String(details || '').trim().slice(0, 1000),
    createdAt: state.reports[date]?.createdAt || now, updatedAt: now,
  };
  state.reports[date] = r;
  const rep = { by: reporterId, ok: r.ok, buses: r.buses, at: now };
  if (state.assignments[date]) state.assignments[date].rep = rep;
  if (mode === 'firebase') {
    await fb.setDoc(kdoc('reports', date), r);
    await fb.updateDoc(kdoc('assignments', date), { rep });
  } else saveLocal();
}

export async function resetDemo() { if (mode === 'demo') { state = demoState(); saveLocal(); } }

// ================= נתוני דוגמה =================
function demoState() {
  const names = [
    ['מיכל אברהם', 2], ['יוסי כהן', 1], ['נועה לוי', 2], ['אבי פרץ', 1], ['שירה דהן', 1],
    ['דוד מזרחי', 2], ['רותם ביטון', 1], ['אורית שלום', 1], ['עמית גבאי', 2], ['הדס אוחיון', 1],
    ['אלון חדד', 1], ['טל יוסף', 1], ['מורן אזולאי', 2], ['איתי בן דוד', 1],
  ];
  const volunteers = names.map(([name, capacity], i) => ({
    id: 'v' + (i + 1), name, capacity, active: true, phone: '050-000' + String(1000 + i).slice(-4),
  }));
  const s = { volunteers, assignments: {}, reports: {}, rounds: [] };
  const start = addDays(todayIso(), -15);
  const round = buildRound({ volunteers, start, weekdays: [0, 1, 2, 3, 4, 5], excluded: [], seed: 'שלומית-1' });
  s.rounds.push({ id: round.id, seed: round.seed, start: round.start, end: round.end, createdAt: new Date().toISOString() });
  for (const slot of round.slots) s.assignments[slot.date] = { volunteerId: slot.volunteerId, roundId: round.id };
  const today = todayIso();
  const notes = ['ההסעה לחטיבה יצאה ב-7:31, שתי בנות רצו ולא הספיקו. נלקחו ברכב פרטי.', 'הסעה אחת לא הגיעה בכלל. דיברתי עם הרכז.'];
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
    s.assignments[slot.date].rep = { by: slot.volunteerId, ok: !bad, buses: bad ? 3 : 4, at: slot.date + 'T07:45:00' };
  }
  const fut = round.slots.find(x => x.date > addDays(today, 1));
  if (fut) {
    const a = s.assignments[fut.date];
    const other = volunteers.find(v => v.id !== a.volunteerId);
    a.originalId = a.volunteerId; a.volunteerId = other.id; a.swappedAt = new Date().toISOString();
  }
  return s;
}
