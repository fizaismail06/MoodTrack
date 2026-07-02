// ============================================================
// MoodTrack — app.js
// ============================================================

// ---------- Mood config ----------
const MOODS = [
  { key:'rad',   label:'rad',   icon:'😆', color:'var(--rad)',   score:5 },
  { key:'good',  label:'good',  icon:'🙂', color:'var(--good)',  score:4 },
  { key:'meh',   label:'meh',   icon:'😐', color:'var(--meh)',   score:3 },
  { key:'bad',   label:'bad',   icon:'🙁', color:'var(--bad)',   score:2 },
  { key:'awful', label:'awful', icon:'😣', color:'var(--awful)', score:1 },
];
const MOOD_BY_KEY = Object.fromEntries(MOODS.map(m => [m.key, m]));

const DEFAULT_ACTIVITIES = [
  {icon:'🏃',label:'Exercise'}, {icon:'💼',label:'Work'}, {icon:'😴',label:'Sleep'},
  {icon:'🍽️',label:'Food'}, {icon:'👨‍👩‍👧',label:'Family'}, {icon:'📚',label:'Reading'},
  {icon:'🎮',label:'Gaming'}, {icon:'🧘',label:'Meditation'}, {icon:'☕',label:'Coffee'},
  {icon:'🛍️',label:'Shopping'}, {icon:'🚗',label:'Travel'}, {icon:'💊',label:'Health'},
  {icon:'🎵',label:'Music'}, {icon:'🎬',label:'Movie'}, {icon:'🧹',label:'Chores'},
  {icon:'💬',label:'Social'}, {icon:'🙏',label:'Prayer'}, {icon:'💰',label:'Finance'},
  {icon:'🏥',label:'Doctor'}, {icon:'🩸',label:'Period'}
];

const EMOJI_PICKER_LIST = ['😀','😅','😍','🤩','😎','🥳','😢','😡','😰','🤒','🥱','🤔',
  '🏋️','🚴','🏊','⚽','🎨','✍️','🧑‍💻','📱','🚌','✈️','🏠','🌳','🐶','🐱','🍕','🍜',
  '🍫','🍺','🚬','💤','🛁','🧴','💊','🩹','📞','🎉','🕌','📖','🧵','🧶','🧺','🧼','🛒','👶'];

const DOW_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ---------- State ----------
let currentUser = null;
let entries = [];        // {id, date, time, mood, activities:[{icon,label}], journal, createdAt}
let activities = [...DEFAULT_ACTIVITIES]; // default + custom (custom ones flagged custom:true)
let cycles = [];          // {id, start, end}
let settings = {
  pinHash: null, pinEnabled: false,
  reminderEnabled: false, reminderTime: '20:00',
  cycleLength: 28, periodLength: 5, overrideNextDate: null
};

let selectedMood = null;
let selectedActivities = []; // array of {icon,label}
let moMonthDate = new Date();          // month shown in monthly mood calendar
let wkStartDate = getMonday(new Date()); // Monday of week shown in weekly report
let cyMonthDate = new Date();           // month shown in menstrual calendar
let wkChartInstance = null;
let pinMode = 'verify';    // 'verify' | 'setNew' | 'confirmNew'
let pinBuffer = '';
let pinFirstEntry = '';
let lastNotifiedDate = localStorage.getItem('mt_lastNotified') || '';

// ---------- Utility ----------
function pad2(n){ return n.toString().padStart(2,'0'); }
function fmtDate(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function parseDateStr(s){ const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); }
function fmtTime(d){ return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function getMonday(d){
  const x = new Date(d); const day = x.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff); x.setHours(0,0,0,0); return x;
}
function addDays(d,n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function monthLabel(d){ return d.toLocaleDateString('en-US',{month:'long', year:'numeric'}); }
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
}
async function sha256(str){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

// ============================================================
// AUTH
// ============================================================
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('acctEmailLbl').textContent = user.email || 'Signed in';
    attachListeners(user.uid);
  } else {
    currentUser = null;
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('lockOverlay').classList.add('hidden');
  }
});

document.getElementById('loginBtn').onclick = () => {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  document.getElementById('loginErr').textContent = '';
  auth.signInWithEmailAndPassword(email, pass).catch(e => {
    document.getElementById('loginErr').textContent = e.message;
  });
};
document.getElementById('signupBtn').onclick = () => {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  document.getElementById('loginErr').textContent = '';
  if (pass.length < 6) { document.getElementById('loginErr').textContent = 'Password must be at least 6 characters.'; return; }
  auth.createUserWithEmailAndPassword(email, pass).catch(e => {
    document.getElementById('loginErr').textContent = e.message;
  });
};
document.getElementById('signOutBtn').onclick = () => {
  sessionStorage.removeItem('mt_unlocked');
  auth.signOut();
};

// ============================================================
// FIRESTORE LISTENERS
// ============================================================
function attachListeners(uid){
  const userRef = db.collection('users').doc(uid);

  userRef.collection('settings').doc('config').onSnapshot(doc => {
    if (doc.exists) {
      settings = { ...settings, ...doc.data() };
    } else {
      userRef.collection('settings').doc('config').set(settings);
    }
    applySettingsToUI();
    maybeShowLock();
  });

  userRef.collection('entries').orderBy('date').orderBy('time').onSnapshot(snap => {
    entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderEntries();
    renderMonthCalendar();
    renderGauge();
    renderWeekReport();
  });

  userRef.collection('activities').orderBy('createdAt').onSnapshot(snap => {
    const custom = snap.docs.map(d => ({ id: d.id, ...d.data(), custom:true }));
    activities = [...DEFAULT_ACTIVITIES, ...custom];
    renderActGrid();
  });

  userRef.collection('cycles').orderBy('start').onSnapshot(snap => {
    cycles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMenstrualCalendar();
  });
}
function userRef(){ return db.collection('users').doc(currentUser.uid); }

// ============================================================
// PIN LOCK
// ============================================================
function maybeShowLock(){
  if (settings.pinEnabled && settings.pinHash && sessionStorage.getItem('mt_unlocked') !== '1') {
    openLock('verify');
  }
}
function openLock(mode){
  pinMode = mode; pinBuffer = ''; pinFirstEntry = '';
  document.getElementById('lockLabel').textContent =
    mode === 'verify' ? 'Enter PIN' : mode === 'setNew' ? 'Set a new 4-digit PIN' : 'Confirm your PIN';
  document.getElementById('pinErr').textContent = '';
  renderPinDots();
  document.getElementById('lockOverlay').classList.remove('hidden');
}
function renderPinDots(){
  const wrap = document.getElementById('pinDots'); wrap.innerHTML = '';
  for (let i=0;i<4;i++){
    const dot = document.createElement('div');
    dot.className = 'pin-dot' + (i < pinBuffer.length ? ' filled' : '');
    wrap.appendChild(dot);
  }
}
(function buildPinPad(){
  const pad = document.getElementById('pinPad');
  const keys = ['1','2','3','4','5','6','7','8','9','','0','del'];
  keys.forEach(k => {
    const btn = document.createElement('button');
    if (k === '') { btn.style.visibility = 'hidden'; }
    else if (k === 'del') { btn.textContent = '⌫'; btn.className = 'del'; btn.onclick = () => { pinBuffer = pinBuffer.slice(0,-1); renderPinDots(); }; }
    else { btn.textContent = k; btn.onclick = () => onPinDigit(k); }
    pad.appendChild(btn);
  });
})();
async function onPinDigit(d){
  if (pinBuffer.length >= 4) return;
  pinBuffer += d; renderPinDots();
  if (pinBuffer.length === 4) {
    if (pinMode === 'verify') {
      const hash = await sha256(pinBuffer);
      if (hash === settings.pinHash) {
        sessionStorage.setItem('mt_unlocked','1');
        document.getElementById('lockOverlay').classList.add('hidden');
      } else {
        document.getElementById('pinErr').textContent = 'Incorrect PIN, try again.';
        setTimeout(()=>{ pinBuffer=''; renderPinDots(); }, 500);
      }
    } else if (pinMode === 'setNew') {
      pinFirstEntry = pinBuffer; pinBuffer = '';
      pinMode = 'confirmNew';
      document.getElementById('lockLabel').textContent = 'Confirm your PIN';
      renderPinDots();
    } else if (pinMode === 'confirmNew') {
      if (pinBuffer === pinFirstEntry) {
        const hash = await sha256(pinBuffer);
        await userRef().collection('settings').doc('config').set({ pinHash: hash, pinEnabled: true }, { merge:true });
        sessionStorage.setItem('mt_unlocked','1');
        document.getElementById('lockOverlay').classList.add('hidden');
        toast('PIN set ✓');
      } else {
        document.getElementById('pinErr').textContent = "PINs didn't match, start over.";
        setTimeout(()=>{ pinMode='setNew'; pinBuffer=''; pinFirstEntry=''; document.getElementById('lockLabel').textContent='Set a new 4-digit PIN'; renderPinDots(); }, 700);
      }
    }
  }
}
document.getElementById('lockNowBtn').onclick = () => {
  if (!settings.pinHash) { toast('No PIN set yet — go to Settings to add one.'); return; }
  sessionStorage.removeItem('mt_unlocked');
  openLock('verify');
};
document.getElementById('changePinBtn').onclick = () => openLock('setNew');
document.getElementById('pinToggle').onclick = async () => {
  if (!settings.pinHash) { toast('Set a PIN first.'); openLock('setNew'); return; }
  await userRef().collection('settings').doc('config').set({ pinEnabled: !settings.pinEnabled }, { merge:true });
};

// ============================================================
// TAB NAVIGATION
// ============================================================
document.querySelectorAll('.navbtn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.navbtn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t=>t.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.remove('hidden');
    if (btn.dataset.tab === 'tabEntries') setTimeout(()=>{ const l=document.getElementById('entriesList'); l.scrollTop = l.scrollHeight; }, 50);
  };
});

// ============================================================
// MOOD + ACTIVITY PICKER (Log tab)
// ============================================================
(function buildMoodRow(){
  const row = document.getElementById('moodRow');
  MOODS.forEach(m => {
    const btn = document.createElement('button');
    btn.className = `mood-opt ${m.key}`;
    btn.innerHTML = `<div class="circ">${m.icon}</div><small>${m.label}</small>`;
    btn.onclick = () => {
      selectedMood = m.key;
      document.querySelectorAll('.mood-opt').forEach(el=>el.classList.remove('selected'));
      btn.classList.add('selected');
      updateSaveBtnState();
    };
    row.appendChild(btn);
  });
})();

function renderActGrid(){
  const grid = document.getElementById('actGrid');
  grid.innerHTML = '';
  activities.forEach(a => {
    const chip = document.createElement('div');
    const isSel = selectedActivities.some(s => s.icon===a.icon && s.label===a.label);
    chip.className = 'act-chip' + (isSel ? ' selected' : '');
    chip.innerHTML = `<span class="ic">${a.icon}</span><small>${a.label}</small>`;
    chip.onclick = () => {
      const idx = selectedActivities.findIndex(s => s.icon===a.icon && s.label===a.label);
      if (idx >= 0) selectedActivities.splice(idx,1); else selectedActivities.push({icon:a.icon,label:a.label});
      renderActGrid();
    };
    grid.appendChild(chip);
  });
  const addChip = document.createElement('div');
  addChip.className = 'act-chip add';
  addChip.innerHTML = `<span class="ic">➕</span><small>Add new</small>`;
  addChip.onclick = openAddActivityModal;
  grid.appendChild(addChip);
}

function updateSaveBtnState(){
  document.getElementById('saveEntryBtn').disabled = !selectedMood;
}

document.getElementById('saveEntryBtn').onclick = async () => {
  if (!selectedMood) return;
  const now = new Date();
  const journal = document.getElementById('journalInput').value.trim();
  await userRef().collection('entries').add({
    date: fmtDate(now), time: fmtTime(now), mood: selectedMood,
    activities: selectedActivities, journal,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  selectedMood = null; selectedActivities = [];
  document.querySelectorAll('.mood-opt').forEach(el=>el.classList.remove('selected'));
  document.getElementById('journalInput').value = '';
  renderActGrid(); updateSaveBtnState();
  lastNotifiedDate = fmtDate(now); localStorage.setItem('mt_lastNotified', lastNotifiedDate);
  toast('Entry saved ✓');
  document.querySelector('.navbtn[data-tab="tabEntries"]').click();
};

// ---------- Add-activity modal ----------
let pickedEmoji = null;
function openAddActivityModal(){
  pickedEmoji = null;
  const grid = document.getElementById('actEmojiGrid'); grid.innerHTML = '';
  EMOJI_PICKER_LIST.forEach(e => {
    const b = document.createElement('button');
    b.textContent = e;
    b.onclick = () => { pickedEmoji = e; grid.querySelectorAll('button').forEach(x=>x.classList.remove('picked')); b.classList.add('picked'); };
    grid.appendChild(b);
  });
  document.getElementById('actLabelInput').value = '';
  document.getElementById('addActModalBg').classList.remove('hidden');
}
document.getElementById('closeAddActModal').onclick = () => document.getElementById('addActModalBg').classList.add('hidden');
document.getElementById('saveActBtn').onclick = async () => {
  const label = document.getElementById('actLabelInput').value.trim();
  if (!pickedEmoji || !label) { toast('Pick an emoji and enter a label.'); return; }
  await userRef().collection('activities').add({ icon: pickedEmoji, label, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  document.getElementById('addActModalBg').classList.add('hidden');
};

// ============================================================
// ENTRIES TAB (history, scroll, latest at bottom)
// ============================================================
function renderEntries(){
  const list = document.getElementById('entriesList');
  if (!entries.length) {
    list.innerHTML = `<div class="empty-state">No entries yet 🌱<br>Log your first mood in the Log tab.</div>`;
    return;
  }
  list.innerHTML = '';
  entries.forEach(e => {
    const m = MOOD_BY_KEY[e.mood];
    const d = document.createElement('div');
    d.className = 'entry';
    const dateObj = parseDateStr(e.date);
    d.innerHTML = `
      <div class="entry-head">
        <div class="entry-mood-ic" style="background:${m.color};">${m.icon}</div>
        <div class="entry-meta">
          <div class="entry-date">${dateObj.toLocaleDateString('en-US',{weekday:'short', month:'short', day:'numeric'})}</div>
          <div class="entry-time">${e.time || ''} · ${m.label}</div>
        </div>
        <button class="entry-del" data-id="${e.id}">🗑️</button>
      </div>
      ${e.activities && e.activities.length ? `<div class="entry-acts">${e.activities.map(a=>`<span>${a.icon} ${a.label}</span>`).join('')}</div>` : ''}
      ${e.journal ? `<div class="entry-journal">${escapeHtml(e.journal)}</div>` : ''}
    `;
    d.querySelector('.entry-del').onclick = async () => {
      if (confirm('Delete this entry?')) await userRef().collection('entries').doc(e.id).delete();
    };
    list.appendChild(d);
  });
  list.scrollTop = list.scrollHeight;
}
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

// ============================================================
// MONTHLY MOOD CALENDAR + GAUGE (Log tab)
// ============================================================
function dayMoodScore(dateStr){
  const dayEntries = entries.filter(e => e.date === dateStr);
  if (!dayEntries.length) return null;
  const avg = dayEntries.reduce((s,e)=>s+MOOD_BY_KEY[e.mood].score,0) / dayEntries.length;
  return avg;
}
function scoreToMoodKey(score){
  let best = MOODS[0], bestDiff = Infinity;
  MOODS.forEach(m => { const diff = Math.abs(m.score - score); if (diff < bestDiff) { bestDiff = diff; best = m; } });
  return best.key;
}
function buildMonthCells(monthDate){
  const year = monthDate.getFullYear(), month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month+1, 0).getDate();
  let startOffset = first.getDay(); startOffset = startOffset === 0 ? 6 : startOffset - 1; // Mon=0
  const cells = [];
  for (let i=0;i<startOffset;i++){
    const d = addDays(first, -(startOffset - i));
    cells.push({ date: d, inMonth:false });
  }
  for (let day=1; day<=daysInMonth; day++){
    cells.push({ date: new Date(year, month, day), inMonth:true });
  }
  while (cells.length % 7 !== 0){
    const last = cells[cells.length-1].date;
    cells.push({ date: addDays(last,1), inMonth:false });
  }
  return cells;
}
function renderMonthCalendar(){
  document.getElementById('moMonthLbl').textContent = monthLabel(moMonthDate);
  const grid = document.getElementById('moMonthGrid'); grid.innerHTML = '';
  DOW_LABELS.forEach(l => { const el = document.createElement('div'); el.className='cal-dow'; el.textContent=l; grid.appendChild(el); });
  const cells = buildMonthCells(moMonthDate);
  const todayStr = fmtDate(new Date());
  cells.forEach(c => {
    const el = document.createElement('div');
    const dStr = fmtDate(c.date);
    const score = dayMoodScore(dStr);
    el.className = 'cal-day' + (score !== null ? ' mood' : '') + (dStr === todayStr ? ' today' : '');
    el.style.opacity = c.inMonth ? '1' : '.35';
    if (score !== null) el.style.background = MOOD_BY_KEY[scoreToMoodKey(score)].color;
    el.textContent = c.date.getDate();
    grid.appendChild(el);
  });
  // Insight: best weekday this month by avg score
  const year = moMonthDate.getFullYear(), month = moMonthDate.getMonth();
  const byDow = Array.from({length:7}, ()=>({sum:0,count:0}));
  entries.forEach(e => {
    const d = parseDateStr(e.date);
    if (d.getFullYear()===year && d.getMonth()===month){
      let dow = d.getDay(); dow = dow===0?6:dow-1;
      byDow[dow].sum += MOOD_BY_KEY[e.mood].score; byDow[dow].count++;
    }
  });
  let bestDow = -1, bestAvg = -1;
  byDow.forEach((v,i) => { if (v.count>0){ const avg = v.sum/v.count; if (avg > bestAvg){ bestAvg = avg; bestDow = i; } } });
  document.getElementById('moInsight').textContent = bestDow >= 0
    ? `😊 This month your best day is ${DOW_LABELS[bestDow]==='Wed'?'Wednesday':new Date(2024,0,1+bestDow).toLocaleDateString('en-US',{weekday:'long'})}`
    : `📅 Log a few entries this month to see your best day.`;
}
function renderGauge(){
  const year = moMonthDate.getFullYear(), month = moMonthDate.getMonth();
  const counts = Object.fromEntries(MOODS.map(m=>[m.key,0]));
  let total = 0;
  const seenDates = new Set();
  entries.forEach(e => {
    const d = parseDateStr(e.date);
    if (d.getFullYear()===year && d.getMonth()===month && !seenDates.has(e.date)){
      seenDates.add(e.date);
      const score = dayMoodScore(e.date);
      counts[scoreToMoodKey(score)]++; total++;
    }
  });
  document.getElementById('gaugeNum').textContent = total;
  // Draw semicircle segments
  const svg = document.getElementById('gaugeSvg');
  svg.innerHTML = '';
  const cx=100, cy=100, r=80, strokeW=16;
  let startAngle = 180; // degrees, semicircle from 180 to 0
  const segLen = total > 0 ? 180 / total : 0;
  let idx = 0;
  if (total === 0){
    svg.innerHTML = `<path d="M20,100 A80,80 0 0 1 180,100" fill="none" stroke="#3a3a3a" stroke-width="${strokeW}" stroke-linecap="round"/>`;
  } else {
    MOODS.forEach(m => {
      const c = counts[m.key];
      for (let i=0;i<c;i++){
        const a0 = startAngle, a1 = startAngle - segLen;
        svg.appendChild(arcPath(cx,cy,r,a0,a1,m.color,strokeW));
        startAngle = a1;
      }
    });
  }
  const legend = document.getElementById('legendRow'); legend.innerHTML = '';
  MOODS.forEach(m => {
    const item = document.createElement('div'); item.className = 'legend-item';
    item.innerHTML = `<div class="legend-dot" style="background:${m.color};">${counts[m.key]}</div><small>${m.label}</small>`;
    legend.appendChild(item);
  });
}
function arcPath(cx,cy,r,a0,a1,color,strokeW){
  const toRad = a => (a * Math.PI)/180;
  const x0 = cx + r*Math.cos(toRad(a0)), y0 = cy - r*Math.sin(toRad(a0));
  const x1 = cx + r*Math.cos(toRad(a1)), y1 = cy - r*Math.sin(toRad(a1));
  const largeArc = Math.abs(a0-a1) > 180 ? 1 : 0;
  const path = document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d', `M${x0},${y0} A${r},${r} 0 ${largeArc} 0 ${x1},${y1}`);
  path.setAttribute('fill','none'); path.setAttribute('stroke',color);
  path.setAttribute('stroke-width', strokeW); path.setAttribute('stroke-linecap','butt');
  return path;
}
document.getElementById('moMonthPrev').onclick = () => { moMonthDate = new Date(moMonthDate.getFullYear(), moMonthDate.getMonth()-1, 1); renderMonthCalendar(); renderGauge(); };
document.getElementById('moMonthNext').onclick = () => { moMonthDate = new Date(moMonthDate.getFullYear(), moMonthDate.getMonth()+1, 1); renderMonthCalendar(); renderGauge(); };

// ============================================================
// WEEKLY REPORT
// ============================================================
function renderWeekReport(){
  const weekEnd = addDays(wkStartDate,6);
  document.getElementById('wkLbl').textContent = `${wkStartDate.toLocaleDateString('en-US',{day:'numeric',month:'short'})} – ${weekEnd.toLocaleDateString('en-US',{day:'numeric',month:'short'})}`;

  const dayScores = []; // per day avg score or null
  for (let i=0;i<7;i++){
    const dStr = fmtDate(addDays(wkStartDate,i));
    dayScores.push(dayMoodScore(dStr));
  }
  const logged = dayScores.filter(s=>s!==null);
  const weekdayScores = dayScores.slice(0,5).filter(s=>s!==null);
  const weekendScores = dayScores.slice(5,7).filter(s=>s!==null);
  const avgOf = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
  const wdAvg = avgOf(weekdayScores), weAvg = avgOf(weekendScores);

  const avgRow = document.getElementById('avgRow'); avgRow.innerHTML = '';
  [['Weekdays', wdAvg], ['Weekend', weAvg]].forEach(([label,avg]) => {
    const box = document.createElement('div'); box.className = 'avg-box';
    const mk = avg !== null ? scoreToMoodKey(avg) : null;
    box.innerHTML = `
      <div class="avg-circ" style="background:${mk?MOOD_BY_KEY[mk].color:'var(--none)'};">${mk?MOOD_BY_KEY[mk].icon:'–'}</div>
      <div class="avg-num">${avg!==null?avg.toFixed(1):'–'}</div>
      <small style="color:var(--sub);font-size:11px;">${label}</small>
    `;
    avgRow.appendChild(box);
  });

  const barRows = document.getElementById('barRows'); barRows.innerHTML = '';
  DOW_LABELS.forEach((label,i) => {
    const score = dayScores[i];
    const row = document.createElement('div'); row.className = 'bar-row';
    const pct = score !== null ? (score/5*100) : 0;
    const color = score !== null ? MOOD_BY_KEY[scoreToMoodKey(score)].color : 'transparent';
    row.innerHTML = `<div class="dlabel">${label}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color};"></div></div>`;
    barRows.appendChild(row);
  });

  // Chart.js line chart
  const ctx = document.getElementById('wkChart').getContext('2d');
  const chartData = dayScores.map(s => s);
  const pointColors = dayScores.map(s => s!==null ? MOOD_BY_KEY[scoreToMoodKey(s)].color.replace('var(--','').replace(')','') : 'transparent');
  const resolvedColors = dayScores.map(s => {
    if (s===null) return 'transparent';
    const key = scoreToMoodKey(s);
    return getComputedStyle(document.documentElement).getPropertyValue(`--${key}`).trim();
  });
  if (wkChartInstance) wkChartInstance.destroy();
  wkChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: DOW_LABELS,
      datasets: [{
        data: chartData, spanGaps: true, borderColor: '#666', borderWidth: 2,
        pointBackgroundColor: resolvedColors, pointRadius: chartData.map(s=>s!==null?6:0),
        pointHoverRadius: 7, tension: 0.3, fill:false
      }]
    },
    options: {
      responsive:true,
      plugins:{ legend:{display:false} },
      scales:{
        y:{ min:0.5, max:5.5, ticks:{ stepSize:1, color:'#9a9a9a',
            callback: v => { const m = MOODS.find(mm=>mm.score===v); return m?m.icon:''; } },
            grid:{ color:'#2a2a2a' } },
        x:{ ticks:{ color:'#9a9a9a' }, grid:{ display:false } }
      }
    }
  });
}
document.getElementById('wkPrev').onclick = () => { wkStartDate = addDays(wkStartDate,-7); renderWeekReport(); };
document.getElementById('wkNext').onclick = () => { wkStartDate = addDays(wkStartDate,7); renderWeekReport(); };

// ============================================================
// MENSTRUAL CYCLE
// ============================================================
function isDateInPeriod(dStr){
  return cycles.some(c => dStr >= c.start && dStr <= (c.end || c.start));
}
function getPredictedRange(){
  if (settings.overrideNextDate){
    const start = settings.overrideNextDate;
    const end = fmtDate(addDays(parseDateStr(start), (settings.periodLength||5)-1));
    return { start, end, manual:true };
  }
  if (!cycles.length) return null;
  const last = cycles[cycles.length-1];
  const nextStart = addDays(parseDateStr(last.start), settings.cycleLength || 28);
  const nextEnd = addDays(nextStart, (settings.periodLength||5)-1);
  return { start: fmtDate(nextStart), end: fmtDate(nextEnd), manual:false };
}
function renderMenstrualCalendar(){
  document.getElementById('cyMonthLbl').textContent = monthLabel(cyMonthDate);
  const grid = document.getElementById('cyMonthGrid'); grid.innerHTML = '';
  DOW_LABELS.forEach(l => { const el = document.createElement('div'); el.className='cal-dow'; el.textContent=l; grid.appendChild(el); });
  const cells = buildMonthCells(cyMonthDate);
  const todayStr = fmtDate(new Date());
  const pred = getPredictedRange();
  cells.forEach(c => {
    const el = document.createElement('div');
    const dStr = fmtDate(c.date);
    let cls = 'cal-day';
    if (isDateInPeriod(dStr)) cls += ' period';
    else if (pred && dStr >= pred.start && dStr <= pred.end) cls += ' predicted';
    if (dStr === todayStr) cls += ' today';
    el.className = cls;
    el.style.opacity = c.inMonth ? '1' : '.35';
    el.textContent = c.date.getDate();
    grid.appendChild(el);
  });
  const predBox = document.getElementById('nextPredBox');
  if (pred){
    const daysAway = Math.round((parseDateStr(pred.start) - new Date(fmtDate(new Date())))/86400000);
    predBox.textContent = `🩸 Next period predicted: ${parseDateStr(pred.start).toLocaleDateString('en-US',{month:'short',day:'numeric'})}` +
      (daysAway>=0 ? ` (in ${daysAway} day${daysAway===1?'':'s'})` : ` (overdue by ${-daysAway} day${-daysAway===1?'':'s'})`) +
      (pred.manual ? ' — manually set' : '');
  } else {
    predBox.textContent = 'Log a period to get predictions.';
  }
  renderCycleHistory();
  renderCycleSettingsUI();
}
function renderCycleHistory(){
  const wrap = document.getElementById('cycHistory'); wrap.innerHTML = '';
  if (!cycles.length) { wrap.innerHTML = `<div style="color:var(--sub);font-size:12px;">No periods logged yet.</div>`; return; }
  [...cycles].reverse().forEach(c => {
    const days = c.end ? Math.round((parseDateStr(c.end)-parseDateStr(c.start))/86400000)+1 : 1;
    const row = document.createElement('div'); row.className = 'cyc-history-item';
    row.innerHTML = `<span>${parseDateStr(c.start).toLocaleDateString('en-US',{month:'short',day:'numeric'})} ${c.end?'– '+parseDateStr(c.end).toLocaleDateString('en-US',{month:'short',day:'numeric'}):''}</span><span>${days}d</span>`;
    wrap.appendChild(row);
  });
}
document.getElementById('cyMonthPrev').onclick = () => { cyMonthDate = new Date(cyMonthDate.getFullYear(), cyMonthDate.getMonth()-1, 1); renderMenstrualCalendar(); };
document.getElementById('cyMonthNext').onclick = () => { cyMonthDate = new Date(cyMonthDate.getFullYear(), cyMonthDate.getMonth()+1, 1); renderMenstrualCalendar(); };

document.getElementById('logPeriodBtn').onclick = () => {
  document.getElementById('periodStartInput').value = fmtDate(new Date());
  document.getElementById('periodEndInput').value = '';
  document.getElementById('periodModalBg').classList.remove('hidden');
};
document.getElementById('closePeriodModal').onclick = () => document.getElementById('periodModalBg').classList.add('hidden');
document.getElementById('savePeriodBtn').onclick = async () => {
  const start = document.getElementById('periodStartInput').value;
  const end = document.getElementById('periodEndInput').value || null;
  if (!start) { toast('Pick a start date.'); return; }
  await userRef().collection('cycles').add({ start, end });
  document.getElementById('periodModalBg').classList.add('hidden');
  toast('Period logged ✓');
};

// ============================================================
// SETTINGS TAB
// ============================================================
function applySettingsToUI(){
  document.getElementById('pinToggle').classList.toggle('on', !!settings.pinEnabled);
  document.getElementById('remToggle').classList.toggle('on', !!settings.reminderEnabled);
  document.getElementById('remTime').value = settings.reminderTime || '20:00';
  renderCycleSettingsUI();
}
function renderCycleSettingsUI(){
  document.getElementById('cycleLenInput').value = settings.cycleLength || 28;
  document.getElementById('periodLenInput').value = settings.periodLength || 5;
  document.getElementById('overrideDateInput').value = settings.overrideNextDate || '';
  const pred = getPredictedRange();
  document.getElementById('predictedDateSub').textContent = pred
    ? parseDateStr(pred.start).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) + (pred.manual?' (manual)':' (calculated)')
    : 'Log a period first';
}
document.getElementById('saveCycleSettingsBtn').onclick = async () => {
  const cycleLength = parseInt(document.getElementById('cycleLenInput').value) || 28;
  const periodLength = parseInt(document.getElementById('periodLenInput').value) || 5;
  const overrideNextDate = document.getElementById('overrideDateInput').value || null;
  await userRef().collection('settings').doc('config').set({ cycleLength, periodLength, overrideNextDate }, { merge:true });
  toast('Cycle settings saved ✓');
};
document.getElementById('remToggle').onclick = async () => {
  const newVal = !settings.reminderEnabled;
  if (newVal && Notification.permission !== 'granted'){
    const perm = await Notification.requestPermission();
    if (perm !== 'granted'){ toast('Notification permission denied.'); return; }
  }
  await userRef().collection('settings').doc('config').set({ reminderEnabled: newVal }, { merge:true });
};
document.getElementById('remTime').onchange = async (e) => {
  await userRef().collection('settings').doc('config').set({ reminderTime: e.target.value }, { merge:true });
};

// ============================================================
// REMINDER CHECK LOOP (best-effort local notifications)
// ============================================================
function todayHasEntry(){
  const todayStr = fmtDate(new Date());
  return entries.some(e => e.date === todayStr);
}
async function checkReminder(){
  if (!settings.reminderEnabled || Notification.permission !== 'granted') return;
  const now = new Date();
  const nowHM = fmtTime(now);
  const todayStr = fmtDate(now);
  if (todayHasEntry()) return; // already logged today, no need to nag
  if (lastNotifiedDate === todayStr) return; // already notified today
  const target = settings.reminderTime || '20:00';
  // Fire at the exact minute, OR as a catch-up if we're past it and haven't notified yet today
  if (nowHM >= target){
    fireReminderNotification();
    lastNotifiedDate = todayStr; localStorage.setItem('mt_lastNotified', lastNotifiedDate);
  }
}
function fireReminderNotification(){
  const body = "You haven't logged your mood today — take a moment for yourself 💭";
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg) reg.showNotification('MoodTrack', { body, icon:'icons/icon-192.png', badge:'icons/icon-192.png' });
      else new Notification('MoodTrack', { body });
    });
  } else {
    new Notification('MoodTrack', { body });
  }
}
setInterval(checkReminder, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkReminder(); });

// ============================================================
// SERVICE WORKER REGISTRATION
// ============================================================
if ('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(err => console.warn('SW registration failed', err));
  });
}

// ---------- initial render ----------
renderActGrid();
updateSaveBtnState();
