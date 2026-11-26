// שיבוץ סבב – לא הגרלה עיוורת אלא שיבוץ שעומד בכללים:
// 1. כל מתנדב מופיע בסבב לפי מספר הפעמים שביקש (1 או 2) – לא יותר.
// 2. מי שביקש פעמיים: לפחות 3 שבועות בין פעם לפעם.
// 3. בני זוג: לפחות שבוע בין השיבוץ של אחד לשל השני.
// הסדר בתוך הכללים מעורבב, כדי שלא יהיה לפי סדר הרשימה.

export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const DAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export function iso(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
export function parseIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function todayIso() { return iso(new Date()); }
export function addDays(s, n) { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); }
export function weekday(s) { return parseIso(s).getDay(); }
export function fmtShort(s) { const [, m, d] = s.split('-'); return `${Number(d)}.${Number(m)}`; }
export function fmtSlash(s) { const [, m, d] = s.split('-'); return `${d}/${m}`; }

// מחולל מספרים אקראיים עם זרע (mulberry32)
function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function randomSeed() { return String(Math.floor(1000 + Math.random() * 9000)); }

export const SELF_GAP = 21, COUPLE_GAP = 7; // בימים קלנדריים
const dayNum = (d) => Math.round(Date.UTC(...d.split('-').map((x, i) => i === 1 ? x - 1 : +x)) / 864e5);

// volunteers, start, weekdays, excluded (ימי חופש), couples: [[idA, idB]],
// history: {date: volunteerId} – שיבוצים קיימים לפני ההתחלה, נחשבים לצורך המרווחים
export function buildRound({ volunteers, start, weekdays, excluded = [], seed, couples = [], history = {} }) {
  seed = String(seed || randomSeed());
  const active = volunteers.filter(v => v.active !== false);
  const cap = {};
  for (const v of active) cap[v.id] = v.capacity === 2 ? 2 : 1;
  const total = Object.values(cap).reduce((a, b) => a + b, 0);
  const partners = {};
  for (const [a, b] of couples) if (cap[a] && cap[b]) { (partners[a] = partners[a] || []).push(b); (partners[b] = partners[b] || []).push(a); }

  const dates = [];
  const ex = new Set(excluded);
  for (let d = start, guard = 0; dates.length < total && guard < 1000; guard++, d = addDays(d, 1))
    if (weekdays.includes(weekday(d)) && !ex.has(d)) dates.push(d);

  const s0 = dayNum(start);
  const past = {};
  for (const [d, id] of Object.entries(history)) { const n = dayNum(d); if (n < s0 && s0 - n < SELF_GAP && cap[id]) (past[id] = past[id] || []).push(n); }

  function attempt(rand) {
    const order = Object.keys(cap);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const rank = Object.fromEntries(order.map((id, i) => [id, i]));
    const left = { ...cap }, days = {};
    for (const id in past) days[id] = [...past[id]];
    const slots = [];
    let bad = 0;
    for (let i = 0; i < dates.length; i++) {
      const n = dayNum(dates[i]);
      const cost = (id) => {
        let c = 0;
        for (const x of days[id] || []) if (n - x < SELF_GAP) c++;
        for (const p of partners[id] || []) for (const x of days[p] || []) if (Math.abs(n - x) < COUPLE_GAP) c++;
        return c;
      };
      // מי שעוד צריך פעמיים מקבל קדימות כשהסבב מתקדם, כדי שיישאר מקום ל-3 שבועות בין הפעמים
      const slotsLeft = dates.length - i;
      let best = null, bestKey = Infinity;
      for (const id of order) {
        if (!left[id]) continue;
        const urgency = left[id] === 2 ? Math.max(0, 45 - slotsLeft) * 3 : 0;
        const key = cost(id) * 100000 + rank[id] - urgency;
        if (key < bestKey) { bestKey = key; best = id; }
      }
      if (best === null) break;
      if (cost(best)) bad++;
      left[best]--; (days[best] = days[best] || []).push(n);
      slots.push({ date: dates[i], volunteerId: best });
    }
    return { slots, bad };
  }

  let res = null;
  for (let t = 0; t < 400; t++) {
    const r = attempt(rng(seed + ':' + t));
    if (!res || r.bad < res.bad) res = r;
    if (!r.bad) break;
  }
  const slots = res.slots;
  return { id: 'r' + seed + '-' + start, seed, start, end: slots.length ? slots[slots.length - 1].date : start, slots, problems: checkRound(slots, couples, history) };
}

// בדיקת הכללים: מחזיר רשימת בעיות {type:'self'|'couple', id, other?, dates}
export function checkRound(slots, couples = [], history = {}) {
  const byId = {};
  const all = [...Object.entries(history).map(([date, volunteerId]) => ({ date, volunteerId, old: true })), ...slots];
  for (const x of all) (byId[x.volunteerId] = byId[x.volunteerId] || []).push(x);
  const out = [];
  for (const [id, xs] of Object.entries(byId)) {
    xs.sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < xs.length; i++) if (!(xs[i - 1].old && xs[i].old) && dayNum(xs[i].date) - dayNum(xs[i - 1].date) < SELF_GAP)
      out.push({ type: 'self', id, dates: [xs[i - 1].date, xs[i].date] });
  }
  for (const [a, b] of couples) for (const x of byId[a] || []) for (const y of byId[b] || [])
    if (!(x.old && y.old) && Math.abs(dayNum(x.date) - dayNum(y.date)) < COUPLE_GAP) out.push({ type: 'couple', id: a, other: b, dates: [x.date, y.date].sort() });
  return out;
}
