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
  const fn = routes[route] || home;
  view.innerHTML = await fn(sub);
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
    <input class="search" type="search" placeholder="חיפוש שם…" aria-label="חיפוש שם">
    <div class="pick-list">${vols.map(v => `<label class="pick"><input type="radio" name="to" value="${v.id}" required><span>${esc(v.name)}</span></label>`).join('')}</div>
    <div class="sheet-acts">
      <button class="btn btn-sun btn-wide" value="save">אישור החלפה</button>
      <button class="btn btn-ghost" value="cancel" formnovalidate>ביטול</button>
    </div>`, async (form) => {
    const to = new FormData(form).get('to');
    await store.swapAssignment(date, to);
    toast(`${nameOf(to)} משובץ/ת ל-${fmtSlash(date)}. תודה!`);
  });
  const q = $('.search', sheet);
  q.addEventListener('input', () => {
    const term = q.value.trim();
    sheet.querySelectorAll('.pick').forEach(p => { p.hidden = term && !p.textContent.includes(term); });
  });
}

// ---------------- ניהול ----------------
async function admin(tab = 'reports') {
  const tabs = [['reports', 'דיווחים'], ['volunteers', 'מתנדבים'], ['round', 'הגרלת סבב']];
  const body = tab === 'volunteers' ? await adminVolunteers() : tab === 'round' ? await adminRound() : await adminReports();
  return `
  <section class="block">
    <header class="block-head"><h1 class="h-page">ניהול</h1></header>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<a role="tab" href="#/admin/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</div>
    ${body}
  </section>`;
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
      <thead><tr><th>תאריך</th><th>משובץ/ת</th><th>מדווח/ת</th><th>הסעות</th><th>תקין</th><th>פירוט</th></tr></thead>
      <tbody>${rows.map(x => `
        <tr class="${!x.r ? 'row-miss' : x.r.ok ? '' : 'row-bad'}">
          <td data-l="תאריך"><b>${fmtSlash(x.date)}</b> <small>${x.wd}</small></td>
          <td data-l="משובץ/ת">${esc(x.assigned)}</td>
          <td data-l="מדווח/ת">${x.r ? esc(x.reporter) : '<span class="tag tag-miss">לא דווח</span>'}</td>
          <td data-l="הסעות">${x.buses}</td>
          <td data-l="תקין">${x.r ? `<span class="tag ${x.r.ok ? 'tag-ok' : 'tag-bad'}">${x.ok}</span>` : ''}</td>
          <td data-l="פירוט" class="td-details">${esc(x.details)}</td>
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
      <span class="seg" role="group" aria-label="כמה פעמים בסבב">
        <button type="button" data-cap="1" class="${v.capacity === 1 ? 'on' : ''}">×1</button>
        <button type="button" data-cap="2" class="${v.capacity === 2 ? 'on' : ''}">×2</button>
      </span>
      <button type="button" class="x" data-del aria-label="הסרת ${esc(v.name)}">✕</button>
    </li>`).join('')}</ul>
  <p class="hint">את הרשימה האמיתית נטען לכאן כשתהיה מוכנה.</p>`;
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

function bindAdmin(tab) {
  const exp = $('#export');
  if (exp) exp.addEventListener('click', exportCsv);
  const ob = $('#only-bad');
  if (ob) ob.addEventListener('change', () => view.querySelectorAll('.tbl tbody tr').forEach(tr => { tr.hidden = ob.checked && !tr.classList.contains('row-bad'); }));

  const add = $('#add-vol');
  if (add) {
    add.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(add);
      await store.addVolunteer({ name: fd.get('name'), phone: fd.get('phone'), capacity: Number(fd.get('capacity')) });
      toast('נוסף/ה לרשימה'); render();
    });
    view.querySelectorAll('.vol').forEach(li => {
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

render();
