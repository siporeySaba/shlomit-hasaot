import * as store from './store.js';
import { DAY_NAMES, DAY_LETTERS, todayIso, addDays, weekday, fmtShort, fmtSlash, parseIso, buildRound, randomSeed } from './scheduler.js';

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const sheet = $('#sheet');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nameOf = (id) => store.volunteerById(id)?.name || '—';
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------------- ניתוב ----------------
const routes = { '': home, schedule, admin };
async function render() {
  const [, route = '', sub = ''] = location.hash.split('/');
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.route === (route || 'home')));
  let fn = routes[route] || home;
  if (fn === admin && !store.session.isAdmin) fn = adminLogin;
  else if (fn !== admin && store.session.needsKey) fn = needKey;
  view.innerHTML = await fn(sub);
  if (fn === adminLogin) bindLogin();
  view.querySelectorAll('[data-act]').forEach(el => el.addEventListener('click', onAct));
  if (fn === admin) bindAdmin(sub);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);

async function onAct(e) {
  const el = e.currentTarget, { act, date } = el.dataset;
  if (act === 'report') openReport(date);
  if (act === 'swap') openSwap(date);
}

// ---------------- רכיבים ----------------
function upcoming(state, n) {
  const t = todayIso();
  return Object.keys(state.assignments).filter(d => d >= t).sort().slice(0, n);
}

function dayCard(state, date, { big = false } = {}) {
  const a = state.assignments[date];
  const r = state.reports[date];
  const t = todayIso();
  const isToday = date === t, past = date < t;
  const wd = weekday(date);
  const [, m, d] = date.split('-').map(Number);
  let status = '';
  if (r) status = `<span class="tag ${r.ok ? 'tag-ok' : 'tag-bad'}">${r.ok ? 'דווח · תקין' : 'דווח · חריג'}</span>`;
  else if (past) status = `<span class="tag tag-miss">לא דווח</span>`;
  const swapped = a.originalId ? `<span class="swap-note">במקום ${esc(nameOf(a.originalId))}</span>` : '';
  const canReport = date <= t;
  return `
  <article class="day ${isToday ? 'is-today' : ''} ${big ? 'day-big' : ''}">
    <div class="day-stub">
      <span class="day-letter">${DAY_LETTERS[wd]}</span>
      <span class="day-num">${d}</span>
      <span class="day-month">${MONTHS[m - 1]}</span>
    </div>
    <div class="day-body">
      <div class="day-top">
        <span class="day-when">${isToday ? 'היום' : (date === addDays(t, 1) ? 'מחר' : 'יום ' + DAY_NAMES[wd])}</span>
        ${status}
      </div>
      <div class="day-name">${esc(nameOf(a.volunteerId))}</div>
      ${swapped}
    </div>
    <div class="day-acts">
      ${!past ? `<button class="btn btn-ghost" data-act="swap" data-date="${date}">החלפה</button>` : ''}
      ${canReport ? `<button class="btn ${r ? 'btn-ghost' : 'btn-sun'}" data-act="report" data-date="${date}">${r ? 'עריכת דיווח' : 'דיווח'}</button>` : ''}
    </div>
  </article>`;
}

function leaders(state) {
  const count = {};
  for (const r of Object.values(state.reports)) count[r.reporterId] = (count[r.reporterId] || 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 3);
}

// ---------------- מסך הבית (הורים) ----------------
async function home() {
  const s = await store.getState();
  const days = upcoming(s, 5);
  const top = leaders(s);
  const order = [1, 0, 2]; // סדר הפודיום: שני, ראשון, שלישי
  const podium = top.length ? order.filter(i => top[i]).map(i => `
      <li class="pod pod-${i + 1}">
        <span class="pod-name">${esc(nameOf(top[i][0]))}</span>
        <span class="pod-block"><b>${top[i][1]}</b><small>דיווחים</small></span>
      </li>`).join('') : '';
  return `
  <section class="hero">
    <p class="kicker">תחנת ההסעות · שלומית</p>
    <h1>הורה אחד בתחנה.<br><span>כל בוקר.</span></h1>
    <p class="lede">אחרי יותר מדי בקרים שבהם הסעה יצאה מוקדם או לא הגיעה, וילדים נשארו לבד בתחנה, החלטנו שבכל בוקר יעמוד בתחנה הורה מתנדב בין <b>7:20</b> ל-<b>7:40</b>. זה בשביל הבטיחות והמוגנות של כל הילדים שלנו. תודה ענקית לכל מי שלוקח חלק.</p>
  </section>

  <section class="block">
    <header class="block-head">
      <h2>חמשת הימים הקרובים</h2>
      <p class="hint">לא מסתדר לך? מצא/י מחליף ולחצ/י "החלפה".</p>
    </header>
    <div class="days">
      ${days.length ? days.map((d, i) => dayCard(s, d, { big: i === 0 })).join('') : `<p class="empty">עוד לא הוגרל סבב. אפשר להגריל במסך הניהול.</p>`}
    </div>
  </section>

  <section class="block">
    <header class="block-head">
      <h2>שומרי התחנה המובילים</h2>
      <p class="hint">לפי מספר הדיווחים שמולאו בפועל.</p>
    </header>
    ${podium ? `<ol class="podium">${podium}</ol>` : `<p class="empty">עוד אין דיווחים.</p>`}
  </section>`;
}

// ---------------- לוח ודיווח ----------------
async function schedule() {
  const s = await store.getState();
  const dates = Object.keys(s.assignments).sort();
  const t = todayIso();
  // קיבוץ לפי שבוע (מיום ראשון)
  const weeks = [];
  for (const d of dates) {
    const sun = addDays(d, -weekday(d));
    let w = weeks[weeks.length - 1];
    if (!w || w.sun !== sun) weeks.push(w = { sun, days: [] });
    w.days.push(d);
  }
  const firstOpen = weeks.findIndex(w => w.days.some(d => d >= addDays(t, -6)));
  return `
  <section class="block">
    <header class="block-head">
      <h1 class="h-page">לוח השיבוצים</h1>
      <p class="hint">לוחצים "דיווח" בסוף ההשגחה: כמה הסעות הגיעו והאם הכל עבר תקין. לוקח 10 שניות.</p>
    </header>
    ${weeks.map((w, i) => `
      <details class="week" ${i >= firstOpen && i <= firstOpen + 1 ? 'open' : ''}>
        <summary><span>שבוע ${fmtShort(w.sun)}–${fmtShort(addDays(w.sun, 6))}</span><span class="week-count">${w.days.filter(d => s.reports[d]).length}/${w.days.filter(d => d <= t).length} דווחו</span></summary>
        <div class="days">${w.days.map(d => dayCard(s, d)).join('')}</div>
      </details>`).join('') || '<p class="empty">אין שיבוצים עדיין.</p>'}
  </section>`;
}

// ---------------- גיליון (דיווח / החלפה) ----------------
function openSheet(html, onSubmit) {
  sheet.innerHTML = `<form method="dialog" class="sheet-in">${html}</form>`;
  const form = $('form', sheet);
  form.addEventListener('submit', async (e) => {
    if (e.submitter?.value === 'cancel') return;
    e.preventDefault();
    const ok = await onSubmit(form);
    if (ok !== false) { sheet.close(); render(); }
  });
  sheet.showModal();
}
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
const SHOW_FIRST = 6;

// בטלפון: החלון יושב תמיד מעל המקלדת, כך שכפתור האישור נשאר גלוי
const mobileMq = matchMedia('(max-width: 820px)');
function fitSheet() {
  const vv = window.visualViewport;
  if (!vv || !sheet.open || !mobileMq.matches) { sheet.style.marginBottom = ''; sheet.style.maxHeight = ''; return; }
  const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  sheet.style.marginBottom = kb + 'px';
  sheet.style.maxHeight = Math.round(vv.height - 12) + 'px';
}
window.visualViewport?.addEventListener('resize', fitSheet);
window.visualViewport?.addEventListener('scroll', fitSheet);
sheet.addEventListener('close', fitSheet);

async function openReport(date) {
  const s = await store.getState();
  const a = s.assignments[date];
  const r = s.reports[date] || {};
  const wd = weekday(date);
  const vols = s.volunteers.filter(v => v.active !== false);
  const reporter = r.reporterId || a.volunteerId;
  openSheet(`
    <div class="sheet-head">
      <p class="kicker">דיווח בוקר</p>
      <h2>יום ${DAY_NAMES[wd]}, ${fmtSlash(date)}</h2>
    </div>
    <label class="field">
      <span class="field-label">מי מדווח/ת?</span>
      <select name="reporter">${vols.map(v => `<option value="${v.id}" ${v.id === reporter ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
    </label>
    <fieldset class="field">
      <legend class="field-label">כמה הסעות הגיעו?</legend>
      <div class="chips chips-6">${[1, 2, 3, 4, 5, 6].map(n => `<label class="chip"><input type="radio" name="buses" value="${n}" ${r.buses === n ? 'checked' : ''} required><span>${n}</span></label>`).join('')}</div>
    </fieldset>
    <fieldset class="field">
      <legend class="field-label">הכל עבר תקין?</legend>
      <div class="chips chips-2">
        <label class="chip chip-yes"><input type="radio" name="ok" value="1" ${r.ok === true ? 'checked' : ''} required><span>כן, הכל תקין</span></label>
        <label class="chip chip-no"><input type="radio" name="ok" value="0" ${r.ok === false ? 'checked' : ''}><span>לא</span></label>
      </div>
    </fieldset>
    <label class="field field-details" ${r.ok === false ? '' : 'hidden'}>
      <span class="field-label">מה קרה?</span>
      <textarea name="details" rows="3" placeholder="למשל: ההסעה לחטיבה יצאה ב-7:28 ושני ילדים פספסו">${esc(r.details || '')}</textarea>
    </label>
    <div class="sheet-acts">
      <button class="btn btn-sun btn-wide" value="save">שליחת דיווח</button>
      <button class="btn btn-ghost" value="cancel" formnovalidate>ביטול</button>
    </div>`, async (form) => {
    const fd = new FormData(form);
    const ok = fd.get('ok') === '1';
    if (!ok && !String(fd.get('details') || '').trim()) { $('textarea', form).focus(); toast('ספר/י בקצרה מה קרה'); return false; }
    await store.saveReport(date, { reporterId: fd.get('reporter'), buses: fd.get('buses'), ok, details: fd.get('details') });
    toast('הדיווח נשמר. תודה! ☀');
  });
  const det = $('.field-details', sheet);
  sheet.querySelectorAll('input[name=ok]').forEach(i => i.addEventListener('change', () => {
    det.hidden = i.value === '1';
    if (!det.hidden) $('textarea', det).focus();
  }));
}

async function openSwap(date) {
  const s = await store.getState();
  const a = s.assignments[date];
  const wd = weekday(date);
  const vols = s.volunteers.filter(v => v.active !== false && v.id !== a.volunteerId).sort((x, y) => x.name.localeCompare(y.name, 'he'));
  openSheet(`
    <div class="sheet-head">
      <p class="kicker">החלפה · יום ${DAY_NAMES[wd]}, ${fmtSlash(date)}</p>
      <h2>מי מחליף/ה את ${esc(nameOf(a.volunteerId))}?</h2>
      <p class="hint">קודם מתאמים עם המחליף/ה, ואז בוחרים כאן. המחליף/ה יקבל/תקבל תזכורת בוואטסאפ בערב שלפני.</p>
    </div>
    <input class="search" type="search" placeholder="חיפוש שם…" aria-label="חיפוש שם" enterkeyhint="done">
    <div class="pick-list">${vols.map((v, i) => `<label class="pick" ${i >= SHOW_FIRST ? 'data-more hidden' : ''}><input type="radio" name="to" value="${v.id}" required><span>${esc(v.name)}</span></label>`).join('')}
      ${vols.length > SHOW_FIRST ? `<button type="button" class="pick-more">הצגת כל השמות (${vols.length})</button>` : ''}</div>
    <div class="sheet-acts">
      <button class="btn btn-sun btn-wide" value="save">אישור החלפה</button>
      <button class="btn btn-ghost" value="cancel" formnovalidate>ביטול</button>
    </div>`, async (form) => {
    const to = new FormData(form).get('to');
    await store.swapAssignment(date, to);
    toast(`${nameOf(to)} משובץ/ת ל-${fmtSlash(date)}. תודה!`);
  });
  const q = $('.search', sheet);
  const more = $('.pick-more', sheet);
  let showAll = false;
  const filter = () => {
    const term = q.value.trim();
    sheet.querySelectorAll('.pick').forEach(p => {
      p.hidden = term ? !p.textContent.includes(term) : (!showAll && p.hasAttribute('data-more'));
    });
    if (more) more.hidden = !!term || showAll;
  };
  q.addEventListener('input', filter);
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); q.blur(); } });
  more?.addEventListener('click', () => { showAll = true; filter(); });
  // בחירת שם סוגרת את המקלדת, כדי שכפתור האישור ייראה
  sheet.querySelectorAll('.pick input').forEach(r => r.addEventListener('change', () => q.blur()));
}

// ---------------- כניסה ----------------
async function needKey() {
  return `
  <section class="block gate">
    <p class="kicker">שומרי התחנה · שלומית</p>
    <h1 class="h-page">צריך את הקישור מהקבוצה</h1>
    <p class="lede">האתר פתוח רק להורי היישוב. כדי להיכנס, פתחו את הקישור ששותף בקבוצת ההורים או בתזכורת בוואטסאפ. אחרי פעם אחת הוא נשמר בטלפון.</p>
  </section>`;
}

async function adminLogin() {
  const u = store.session.user;
  return `
  <section class="block gate">
    <p class="kicker">ניהול</p>
    <h1 class="h-page">כניסת מנהלים</h1>
    ${u ? `
      <p class="lede">מחובר/ת בתור <b>${esc(u.email)}</b>, אבל החשבון עוד לא מוגדר כמנהל.</p>
      <p class="hint">כדי להוסיף: בקונסול של Firebase ← Firestore ← אוסף <code>admins</code> ← מסמך חדש עם המזהה:</p>
      <p class="uid" dir="ltr">${esc(u.uid)}</p>
      <div class="sheet-acts"><button class="btn btn-ghost" id="logout">התנתקות</button></div>` : `
      <p class="lede">המסך הזה מיועד לרכזי הפרויקט. ההתחברות עם חשבון Google.</p>
      <div class="sheet-acts"><button class="btn btn-sun" id="login">התחברות עם Google</button></div>`}
  </section>`;
}
function bindLogin() {
  $('#login')?.addEventListener('click', async () => {
    try { await store.signIn(); } catch (e) { toast('ההתחברות לא הצליחה'); }
  });
  $('#logout')?.addEventListener('click', async () => { await store.signOut(); render(); });
}

// ---------------- ניהול ----------------
async function admin(tab) {
  tab = tab || 'reminders';
  const tabs = [['reminders', 'תזכורות'], ['reports', 'דיווחים'], ['volunteers', 'מתנדבים'], ['manual', 'שיבוץ ידני'], ['round', 'הגרלה']];
  const body = tab === 'volunteers' ? await adminVolunteers() : tab === 'round' ? await adminRound()
    : tab === 'manual' ? await adminManual() : tab === 'reports' ? await adminReports() : await adminReminders();
  const fbMode = store.mode === 'firebase';
  return `
  <section class="block">
    <header class="block-head admin-head">
      <h1 class="h-page">ניהול</h1>
      <div class="admin-meta">
        ${fbMode ? `<button class="btn btn-ghost" id="copy-link">העתקת קישור להורים</button><button class="btn btn-ghost" id="logout">התנתקות</button>`
                 : `<span class="tag tag-miss">מצב דוגמה · הנתונים רק בדפדפן הזה</span><button class="btn btn-ghost" id="reset-demo">איפוס נתוני דוגמה</button>`}
      </div>
    </header>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<a role="tab" href="#/admin/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</div>
    ${body}
  </section>`;
}

// ---------- תזכורות (שליחה ידנית בלחיצה, עד שיהיה API) ----------
let remDay = null; // היום שבו שולחים (ברירת מחדל: היום)
const intlPhone = (p) => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '972' + d.slice(1); return d; };
function reminderText(v, date) {
  const first = v.name.trim().split(/\s+/)[0];
  return `היי ${first}, מתזכר אותך שאתה משובץ להשגחה בתחנת ההסעה ביום ${DAY_NAMES[weekday(date)]} בתאריך ${fmtSlash(date)}, בין 7:20 ל-7:40. ` +
    `אם לא מסתדר לך, נשמח מאוד שתמצא מחליף ותשבץ אותו באתר שומרי התחנה:\n${store.shareLink()}\n\nתודה רבה, זה לא מובן מאליו 🙏`;
}

async function adminReminders() {
  const s = await store.getState();
  const t = todayIso();
  const day = remDay || t;
  const items = [];
  const eve = addDays(day, 1), week = addDays(day, 7);
  // ערב לפני: מי שמשובץ מחר (כולל מחליף). לשיבוץ של יום ראשון – מופיע בשבת, לשליחה במוצאי שבת.
  if (s.assignments[eve]) items.push({ type: 'eve', date: eve, a: s.assignments[eve] });
  // שבוע לפני: רק המשובץ המקורי (מי שהוחלף לא מקבל; המחליף מקבל רק את תזכורת הערב)
  if (s.assignments[week] && !s.assignments[week].originalId) items.push({ type: 'week', date: week, a: s.assignments[week] });
  const dayLabel = day === t ? 'היום' : day === addDays(t, 1) ? 'מחר' : day === addDays(t, -1) ? 'אתמול' : `יום ${DAY_NAMES[weekday(day)]}`;
  const cards = items.map(({ type, date, a }) => {
    const v = store.volunteerById(a.volunteerId) || { name: '—' };
    const id = `${date}_${type}_${a.volunteerId}`;
    const sent = store.sentAt(id);
    const text = reminderText(v, date);
    const href = v.kosher ? `sms:${v.phone}?&body=${encodeURIComponent(text)}` : `https://wa.me/${intlPhone(v.phone)}?text=${encodeURIComponent(text)}`;
    return `
    <article class="rem ${sent ? 'is-sent' : ''}" data-id="${id}">
      <div class="rem-top">
        <span class="tag ${type === 'eve' ? 'tag-eve' : 'tag-week'}">${type === 'eve' ? 'ערב לפני' : 'שבוע לפני'}</span>
        <span class="rem-when">משובץ/ת ליום ${DAY_NAMES[weekday(date)]} ${fmtSlash(date)}</span>
      </div>
      <div class="rem-name">${esc(v.name)} ${v.kosher ? '<span class="tag tag-miss">קו כשר</span>' : ''}</div>
      ${a.originalId && type === 'eve' ? `<div class="swap-note">מחליף/ה את ${esc(nameOf(a.originalId))}</div>` : ''}
      <details class="rem-text"><summary>נוסח ההודעה</summary><p>${esc(text).replace(/\n/g, '<br>')}</p></details>
      <div class="rem-acts">
        ${v.phone ? `<a class="btn ${sent ? 'btn-ghost' : 'btn-sun'}" href="${href}" target="_blank" rel="noopener" data-send>${v.kosher ? 'שליחה ב-SMS' : 'שליחה בוואטסאפ'}</a>`
                  : '<span class="warn">אין טלפון ברשימה</span>'}
        ${sent ? `<span class="sent-mark">✓ נשלח ${new Date(sent).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <button type="button" class="btn btn-ghost btn-sm" data-unsent>ביטול סימון</button>`
               : `<button type="button" class="btn btn-ghost btn-sm" data-mark>סימון כנשלח</button>`}
      </div>
    </article>`;
  }).join('');
  return `
  <div class="rem-nav">
    <button type="button" class="btn btn-ghost btn-sm" data-day="-1" aria-label="יום קודם">→</button>
    <div class="rem-day"><b>${dayLabel}</b><small>${DAY_LETTERS[weekday(day)]} ${fmtSlash(day)}</small></div>
    <button type="button" class="btn btn-ghost btn-sm" data-day="1" aria-label="יום הבא">←</button>
    ${day !== t ? '<button type="button" class="btn btn-ghost btn-sm" data-day="0">חזרה להיום</button>' : ''}
  </div>
  <p class="hint">לוחצים "שליחה". הוואטסאפ נפתח עם ההודעה מוכנה, ונשאר רק ללחוץ שלח. הכפתור גם מסמן שנשלח.</p>
  ${cards || `<p class="empty">אין תזכורות לשלוח ${day === t ? 'היום' : 'ביום הזה'}.</p>`}`;
}

function bindReminders() {
  view.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => {
    const n = Number(b.dataset.day);
    remDay = n === 0 ? null : addDays(remDay || todayIso(), n);
    render();
  }));
  view.querySelectorAll('.rem').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('[data-send]')?.addEventListener('click', () => { store.markSent(id).then(() => setTimeout(render, 400)); });
    card.querySelector('[data-mark]')?.addEventListener('click', async () => { await store.markSent(id); render(); });
    card.querySelector('[data-unsent]')?.addEventListener('click', async () => { await store.markSent(id, false); render(); });
  });
}

function reportRows(s) {
  return Object.keys(s.assignments).filter(d => d <= todayIso()).sort().reverse().map(d => {
    const a = s.assignments[d], r = s.reports[d];
    return { date: d, wd: DAY_NAMES[weekday(d)], assigned: nameOf(a.volunteerId), reporter: r ? nameOf(r.reporterId) : '', buses: r?.buses ?? '', ok: r ? (r.ok ? 'כן' : 'לא') : '', details: r?.details || '', at: r?.updatedAt || '', r };
  });
}

async function adminReports() {
  const s = await store.getState();
  const rows = reportRows(s);
  const done = rows.filter(x => x.r), bad = done.filter(x => !x.r.ok);
  return `
  <div class="stats">
    <div class="stat"><b>${done.length}</b><span>דיווחים</span></div>
    <div class="stat stat-bad"><b>${bad.length}</b><span>חריגים</span></div>
    <div class="stat stat-miss"><b>${rows.length - done.length}</b><span>לא דווחו</span></div>
  </div>
  <div class="toolbar">
    <label class="check"><input type="checkbox" id="only-bad"> רק חריגים</label>
    <button class="btn btn-ink" id="export">ייצוא לאקסל (CSV)</button>
  </div>
  <div class="table-wrap">
    <table class="tbl">
      <thead><tr><th>תאריך</th><th>משובץ/ת</th><th>מדווח/ת</th><th>הסעות</th><th>תקין</th><th>פירוט</th><th><span class="sr">פעולות</span></th></tr></thead>
      <tbody>${rows.map(x => `
        <tr class="${!x.r ? 'row-miss' : x.r.ok ? '' : 'row-bad'}" data-date="${x.date}">
          <td data-l="תאריך"><b>${fmtSlash(x.date)}</b> <small>${x.wd}</small></td>
          <td data-l="משובץ/ת">${esc(x.assigned)}</td>
          <td data-l="מדווח/ת">${x.r ? esc(x.reporter) : '<span class="tag tag-miss">לא דווח</span>'}</td>
          <td data-l="הסעות">${x.buses}</td>
          <td data-l="תקין">${x.r ? `<span class="tag ${x.r.ok ? 'tag-ok' : 'tag-bad'}">${x.ok}</span>` : ''}</td>
          <td data-l="פירוט" class="td-details">${esc(x.details)}</td>
          <td class="td-acts">
            ${x.r ? '<button type="button" class="mini" data-del-report>מחיקת דיווח</button>' : ''}
            <button type="button" class="mini mini-red" data-del-assign>מחיקת שיבוץ</button>
          </td>
        </tr>`).join('')}</tbody>
    </table>
  </div>`;
}

async function adminVolunteers() {
  const s = await store.getState();
  const vols = s.volunteers.filter(v => v.active !== false);
  const total = vols.reduce((n, v) => n + v.capacity, 0);
  return `
  <p class="hint">${vols.length} מתנדבים · ${total} משמרות בסבב. הטלפונים מוצגים רק כאן (לתזכורות), לא במסך ההורים.</p>
  <form class="add-vol" id="add-vol">
    <input name="name" placeholder="שם מלא" required>
    <input name="phone" placeholder="טלפון" inputmode="tel" required>
    <select name="capacity"><option value="1">פעם בסבב</option><option value="2">פעמיים בסבב</option></select>
    <button class="btn btn-ink">הוספה</button>
  </form>
  <ul class="vols">${vols.map(v => `
    <li class="vol" data-id="${v.id}">
      <span class="vol-name">${esc(v.name)}</span>
      <a class="vol-phone" href="tel:${esc(v.phone)}" dir="ltr">${esc(v.phone)}</a>
      <button type="button" class="ktog ${v.kosher ? 'on' : ''}" data-kosher aria-pressed="${!!v.kosher}" title="קו כשר: תזכורת ב-SMS במקום וואטסאפ">קו כשר</button>
      <span class="seg" role="group" aria-label="כמה פעמים בסבב">
        <button type="button" data-cap="1" class="${v.capacity === 1 ? 'on' : ''}">×1</button>
        <button type="button" data-cap="2" class="${v.capacity === 2 ? 'on' : ''}">×2</button>
      </span>
      <button type="button" class="x" data-del aria-label="הסרת ${esc(v.name)}">✕</button>
    </li>`).join('')}</ul>
  <details class="import">
    <summary>ייבוא רשימה מלאה (הדבקה מאקסל או מוואטסאפ)</summary>
    <p class="hint">שורה לכל מתנדב/ת: שם, טלפון, ו-2 למי שפנוי פעמיים בסבב (אחרת פעם אחת). למשל: <code>דנה כהן, 0521234567, 2</code></p>
    <textarea id="import-text" rows="6"></textarea>
    <div class="sheet-acts"><button type="button" class="btn btn-ink" id="import-go">ייבוא</button></div>
  </details>`;
}

async function adminRound() {
  const last = store.lastScheduledDate();
  let start = last ? addDays(last, 1) : todayIso();
  return `
  <div class="rule">
    <h3>איך עובדת ההגרלה</h3>
    <p>לכל מתנדב/ת יש פתק אחד בכובע (או שניים, למי שפנוי פעמיים). הכובע מעורבב, והפתקים נשלפים לפי סדר הימים. מי ששובץ לא יופיע שוב בחמשת הימים הבאים. <b>מספר ההגרלה</b> מאפשר לכל אחד לשחזר בדיוק את אותה תוצאה, כך שהכל שקוף.</p>
  </div>
  <form id="round-form" class="round-form">
    <label class="field"><span class="field-label">מתחילים בתאריך</span><input type="date" name="start" value="${start}" required></label>
    <fieldset class="field"><legend class="field-label">ימים עם הסעות</legend>
      <div class="chips chips-days">${[0, 1, 2, 3, 4, 5].map(i => `<label class="chip"><input type="checkbox" name="wd" value="${i}" checked><span>${DAY_LETTERS[i]}</span></label>`).join('')}</div>
    </fieldset>
    <label class="field"><span class="field-label">תאריכים בלי הסעות (חגים, חופשות) – תאריך בכל שורה, למשל 14/12</span><textarea name="ex" rows="2" dir="ltr"></textarea></label>
    <label class="field"><span class="field-label">מספר הגרלה</span><input name="seed" value="${randomSeed()}" inputmode="numeric"></label>
    <div class="sheet-acts"><button class="btn btn-ink" value="preview">הגרלה (תצוגה מקדימה)</button></div>
  </form>
  <div id="round-out"></div>`;
}

// שורה חופשית → {name, phone, capacity}. מבין "שם - 0541234567", "שם, 054-1234567, 2", טאבים מאקסל וכו'.
function normPhone(p) {
  let d = p.replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  return d.length === 10 ? d.slice(0, 3) + '-' + d.slice(3) : d.length === 9 ? d.slice(0, 2) + '-' + d.slice(2) : p.trim();
}
function parseLine(l) {
  const m = l.match(/(?:\+?972|0)[\d\-\s]{7,12}\d/);
  let rest = m ? l.replace(m[0], ' ') : l;
  let capacity = 1;
  const c = rest.match(/(?:^|[\s,;\t|])([12])\s*$/);
  if (c) { capacity = Number(c[1]); rest = rest.slice(0, c.index); }
  const name = rest.replace(/[-–—,;\t|:]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { name, phone: m ? normPhone(m[0]) : '', capacity };
}
function parseImport(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(parseLine).filter(x => x.name);
}
// מוצא מתנדב פעיל לפי שם, או יוצר חדש
async function ensureVolunteer({ name, phone, capacity }) {
  const s = await store.getState();
  return s.volunteers.find(v => v.active !== false && v.name === name) || store.addVolunteer({ name, phone, capacity });
}

async function adminManual() {
  const s = await store.getState();
  const t = todayIso();
  const vols = s.volunteers.filter(v => v.active !== false).sort((x, y) => x.name.localeCompare(y.name, 'he'));
  const last = store.lastScheduledDate();
  let start = last && last >= t ? addDays(last, 1) : addDays(t, 1);
  while (weekday(start) === 6) start = addDays(start, 1);
  const future = Object.keys(s.assignments).filter(d => d >= t).sort();
  return `
  <div class="rule">
    <h3>הדבקת שיבוצים מוכנים</h3>
    <p>מדביקים שורה לכל יום, לפי סדר הימים, למשל <code>ישראל ישראלי - 0501234567</code>. מי שלא קיים ברשימה יתווסף אוטומטית.</p>
  </div>
  <form id="paste-form" class="round-form">
    <label class="field"><span class="field-label">היום הראשון ברשימה</span><input type="date" name="start" value="${start}" required></label>
    <fieldset class="field"><legend class="field-label">ימים עם הסעות</legend>
      <div class="chips chips-days">${[0, 1, 2, 3, 4, 5].map(i => `<label class="chip"><input type="checkbox" name="wd" value="${i}" checked><span>${DAY_LETTERS[i]}</span></label>`).join('')}</div>
    </fieldset>
    <label class="field"><span class="field-label">השיבוצים</span><textarea name="lines" rows="6" required></textarea></label>
    <div class="sheet-acts"><button class="btn btn-ink">תצוגה מקדימה</button></div>
  </form>
  <div id="paste-out"></div>

  <div class="rule rule-gap"><h3>שיבוץ של יום אחד</h3><p>קובע מי משובץ בתאריך מסוים. אם כבר יש שם מישהו, הוא מוחלף.</p></div>
  <form id="one-form" class="one-form">
    <input type="date" name="date" value="${addDays(t, 1)}" required aria-label="תאריך">
    <select name="vol" required aria-label="מתנדב/ת"><option value="">בחירת מתנדב/ת…</option>${vols.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('')}</select>
    <button class="btn btn-ink">שיבוץ</button>
  </form>

  <h3 class="sub-h">השיבוצים מהיום והלאה</h3>
  ${future.length ? `<ul class="vols">${future.map(d => `
    <li class="vol" data-date="${d}">
      <span class="vol-name">${esc(nameOf(s.assignments[d].volunteerId))}</span>
      <span class="vol-phone">${DAY_LETTERS[weekday(d)]} ${fmtSlash(d)}</span>
      <span></span>
      <button type="button" class="x" data-unassign aria-label="ביטול השיבוץ ב-${fmtSlash(d)}">✕</button>
    </li>`).join('')}</ul>` : '<p class="empty">אין שיבוצים עתידיים.</p>'}`;
}

function bindManual() {
  const pf = $('#paste-form');
  if (!pf) return;
  pf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(pf);
    const rows = parseImport(String(fd.get('lines')));
    const wds = fd.getAll('wd').map(Number);
    if (!rows.length || !wds.length) return toast('לא נמצאו שורות');
    const s = await store.getState();
    let d = fd.get('start');
    const plan = rows.map(r => {
      while (!wds.includes(weekday(d))) d = addDays(d, 1);
      const p = { ...r, date: d }; d = addDays(d, 1); return p;
    });
    const out = $('#paste-out');
    out.innerHTML = `
      <div class="round-res">
        <h3>${plan.length} שיבוצים · ${fmtSlash(plan[0].date)}–${fmtSlash(plan[plan.length - 1].date)}</h3>
        <ol class="round-list">${plan.map(p => {
          const exists = s.volunteers.some(v => v.active !== false && v.name === p.name);
          const taken = s.assignments[p.date] ? ` <small class="warn">(במקום ${esc(nameOf(s.assignments[p.date].volunteerId))})</small>` : '';
          return `<li><span>${DAY_LETTERS[weekday(p.date)]} ${fmtSlash(p.date)}</span><b>${esc(p.name)}${exists ? '' : ' <small class="new">חדש</small>'}${taken}</b></li>`;
        }).join('')}</ol>
        <div class="sheet-acts"><button class="btn btn-sun" id="paste-save">שמירת השיבוצים</button></div>
      </div>`;
    $('#paste-save').addEventListener('click', async (ev) => {
      ev.currentTarget.disabled = true;
      for (const p of plan) {
        const v = await ensureVolunteer(p);
        await store.setAssignment(p.date, v.id);
      }
      toast(`נשמרו ${plan.length} שיבוצים`); render();
    });
  });

  $('#one-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const date = fd.get('date'), vol = fd.get('vol');
    const s = await store.getState();
    if (s.assignments[date] && !confirm(`ב-${fmtSlash(date)} משובץ/ת ${nameOf(s.assignments[date].volunteerId)}. להחליף?`)) return;
    await store.setAssignment(date, vol);
    toast(`${nameOf(vol)} שובץ/ה ל-${fmtSlash(date)}`); render();
  });

  view.querySelectorAll('[data-unassign]').forEach(b => b.addEventListener('click', async () => {
    const date = b.closest('li').dataset.date;
    if (!confirm(`לבטל את השיבוץ של ${fmtSlash(date)}?`)) return;
    await store.deleteAssignment(date); toast('השיבוץ בוטל'); render();
  }));
}

function bindAdmin(tab) {
  bindManual();
  bindReminders();
  $('#logout')?.addEventListener('click', async () => { await store.signOut(); location.hash = '#/'; });
  $('#copy-link')?.addEventListener('click', async () => {
    const link = store.shareLink();
    try { await navigator.clipboard.writeText(link); toast('הקישור הועתק. אפשר להדביק בקבוצת ההורים'); }
    catch (e) { prompt('הקישור להורים:', link); }
  });
  $('#reset-demo')?.addEventListener('click', async () => {
    if (!confirm('לאפס את נתוני הדוגמה?')) return;
    await store.resetDemo(); toast('אופס'); render();
  });
  $('#import-go')?.addEventListener('click', async () => {
    const list = parseImport($('#import-text').value);
    if (!list.length) return toast('לא נמצאו שורות לייבוא');
    const existing = new Set((await store.getState()).volunteers.filter(v => v.active !== false).map(v => v.name));
    const fresh = list.filter(x => !existing.has(x.name));
    if (!confirm(`לייבא ${fresh.length} מתנדבים? (${list.length - fresh.length} כבר ברשימה)`)) return;
    for (const v of fresh) await store.addVolunteer(v);
    toast(`נוספו ${fresh.length} מתנדבים`); render();
  });

  const exp = $('#export');
  if (exp) exp.addEventListener('click', exportCsv);
  const ob = $('#only-bad');
  if (ob) ob.addEventListener('change', () => view.querySelectorAll('.tbl tbody tr').forEach(tr => { tr.hidden = ob.checked && !tr.classList.contains('row-bad'); }));
  view.querySelectorAll('.tbl tbody tr').forEach(tr => {
    const date = tr.dataset.date;
    tr.querySelector('[data-del-report]')?.addEventListener('click', async () => {
      if (!confirm(`למחוק את הדיווח של ${fmtSlash(date)}? אי אפשר לשחזר.`)) return;
      await store.deleteReport(date); toast('הדיווח נמחק'); render();
    });
    tr.querySelector('[data-del-assign]')?.addEventListener('click', async () => {
      const s = await store.getState();
      const hasReport = !!s.reports[date];
      if (!confirm(`למחוק את השיבוץ של ${nameOf(s.assignments[date]?.volunteerId)} ב-${fmtSlash(date)}?${hasReport ? ' גם הדיווח של היום הזה יימחק.' : ''} אי אפשר לשחזר.`)) return;
      if (hasReport) await store.deleteReport(date);
      await store.deleteAssignment(date); toast('השיבוץ נמחק'); render();
    });
  });

  const add = $('#add-vol');
  if (add) {
    add.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(add);
      await store.addVolunteer({ name: fd.get('name'), phone: fd.get('phone'), capacity: Number(fd.get('capacity')) });
      toast('נוסף/ה לרשימה'); render();
    });
    view.querySelectorAll('.vol').forEach(li => {
      li.querySelector('[data-kosher]').addEventListener('click', async () => {
        const v = store.volunteerById(li.dataset.id);
        await store.updateVolunteer(li.dataset.id, { kosher: !v.kosher }); render();
      });
      li.querySelectorAll('[data-cap]').forEach(b => b.addEventListener('click', async () => { await store.updateVolunteer(li.dataset.id, { capacity: Number(b.dataset.cap) }); render(); }));
      li.querySelector('[data-del]').addEventListener('click', async () => {
        if (!confirm('להסיר מהרשימה? דיווחים קודמים יישמרו.')) return;
        await store.removeVolunteer(li.dataset.id); render();
      });
    });
  }

  const rf = $('#round-form');
  if (rf) rf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const s = await store.getState();
    const fd = new FormData(rf);
    const startD = fd.get('start');
    const y = parseIso(startD).getFullYear();
    const excluded = String(fd.get('ex') || '').split(/\s|,/).filter(Boolean).map(x => {
      const [d, m] = x.split(/[/.]/).map(Number); if (!d || !m) return null;
      let yy = y; if (m < parseIso(startD).getMonth() + 1 - 2) yy++;
      return `${yy}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }).filter(Boolean);
    const round = buildRound({ volunteers: s.volunteers, start: startD, weekdays: fd.getAll('wd').map(Number), excluded, seed: fd.get('seed') || randomSeed() });
    const out = $('#round-out');
    const clash = round.slots.filter(x => s.assignments[x.date]).length;
    out.innerHTML = `
      <div class="round-res">
        <h3>סבב ${fmtSlash(round.start)}–${fmtSlash(round.end)} · ${round.slots.length} בקרים · הגרלה מס׳ ${esc(round.seed)}</h3>
        ${clash ? `<p class="warn">שימו לב: ${clash} תאריכים כבר משובצים ויוחלפו.</p>` : ''}
        <ol class="round-list">${round.slots.map(x => `<li><span>${DAY_LETTERS[weekday(x.date)]} ${fmtSlash(x.date)}</span><b>${esc(nameOf(x.volunteerId))}</b></li>`).join('')}</ol>
        <div class="sheet-acts"><button class="btn btn-sun" id="save-round">שמירה ופרסום הסבב</button></div>
      </div>`;
    $('#save-round').addEventListener('click', async () => { await store.saveRound(round); toast('הסבב נשמר'); location.hash = '#/schedule'; });
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function exportCsv() {
  const s = await store.getState();
  const rows = reportRows(s);
  const head = ['תאריך', 'יום', 'משובץ/ת', 'מדווח/ת', 'מספר הסעות', 'הכל תקין', 'פירוט', 'זמן דיווח'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head, ...rows.map(x => [fmtSlash(x.date) + '/' + x.date.slice(0, 4), x.wd, x.assigned, x.reporter || 'לא דווח', x.buses, x.ok, x.details, x.at ? x.at.replace('T', ' ').slice(0, 16) : ''])].map(r => r.map(q).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `דיווחי-תחנה-${todayIso()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

store.onChange(() => { if (!sheet.open) render(); });
store.init().then(render).catch((e) => {
  console.error(e);
  view.innerHTML = `<section class="block gate"><h1 class="h-page">משהו השתבש</h1><p class="lede">לא הצלחנו לטעון את הנתונים. בדקו את החיבור לאינטרנט ונסו לרענן.</p></section>`;
});
