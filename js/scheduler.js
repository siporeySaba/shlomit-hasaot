// הגרלת סבב שיבוצים – אקראית אבל ניתנת לשחזור (לפי "מספר הגרלה").
// כל מתנדב מופיע בסבב לפי מספר הפעמים שהוא פנוי (1 או 2).
// מנסים שלא אותו אדם יופיע פעמיים בפער קטן משבוע.

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

// מחולל מספרים אקראיים עם זרע (mulberry32) – אותו זרע = אותה הגרלה
function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function randomSeed() { return String(Math.floor(1000 + Math.random() * 9000)); }

export function buildRound({ volunteers, start, weekdays, excluded = [], seed }) {
  const rand = rng(String(seed));
  const active = volunteers.filter(v => v.active !== false);
  // "כובע" עם פתק לכל פעם שמתנדב פנוי
  const pool = [];
  for (const v of active) for (let i = 0; i < (v.capacity || 1); i++) pool.push(v.id);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }

  // תאריכים פנויים מהתאריך ההתחלתי
  const dates = [];
  let d = start, guard = 0;
  const ex = new Set(excluded);
  while (dates.length < pool.length && guard++ < 1000) {
    if (weekdays.includes(weekday(d)) && !ex.has(d)) dates.push(d);
    d = addDays(d, 1);
  }

  // שיבוץ: לוקחים את הפתק הבא, אלא אם אותו אדם שובץ ב-5 הימים האחרונים
  const minGap = Math.min(5, Math.max(1, Math.floor(pool.length / 2)));
  const slots = [];
  const lastIdx = {};
  for (let i = 0; i < dates.length; i++) {
    let pick = pool.findIndex(id => lastIdx[id] === undefined || i - lastIdx[id] > minGap);
    if (pick < 0) pick = 0;
    const id = pool.splice(pick, 1)[0];
    lastIdx[id] = i;
    slots.push({ date: dates[i], volunteerId: id });
  }
  return { id: 'r' + seed + '-' + start, seed: String(seed), start, end: slots.length ? slots[slots.length - 1].date : start, slots };
}
