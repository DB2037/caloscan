/* CaloScan — client-side PWA. Claude vision + Open Food Facts barcode + trackers. */
'use strict';

const LS = {
  settings: 'caloscan.settings.v2',
  bank: 'caloscan.bank.v2',
  diary: 'caloscan.diary.v2',
  water: 'caloscan.water.v2',
  weights: 'caloscan.weights.v2',
};

const DEFAULT_SETTINGS = {
  apiEndpoint: 'https://api.anthropic.com/v1/messages',
  apiKey: '',
  model: 'claude-sonnet-4-6',
  units: 'metric',        // food: 'metric' | 'imperial'
  weightUnit: 'kg',       // 'kg' | 'lb'
  dailyGoal: 2000,
  tdee: 0,                // optional maintenance calories (for Cutting/Bulking label)
  macroSplit: { p: 30, c: 40, f: 30 }, // % of calories from protein / carbs / fat
  waterGoalMl: 2000,
  theme: 'light',         // 'auto' | 'light' | 'dark'
};

const MODELS = [
  { id: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1 — highest accuracy' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — balanced (recommended)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — fast & cheap' },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7 — newest (if available)' },
];

const PROMPT = `Analyze this meal photograph carefully.

Your job: estimate the calories and macronutrients of EVERY distinct food item visible on the plate(s) or in the container.

For each item provide:
- "name": a short common name (e.g. "Grilled chicken breast", "White rice", "Broccoli", "Olive oil").
- "grams": your best estimate of the edible portion weight in GRAMS. Be specific and realistic (a chicken breast ~120-180g, a slice of bread ~30g, 1 cup cooked rice ~150-200g, a tablespoon of oil ~13.5g).
- "per100g": the nutrition values PER 100 GRAMS from standard food databases (USDA / common references): { "kcal": number, "protein": number (g), "carbs": number (g), "fat": number (g) }.
- "confidence": one of "high", "medium", "low" based on how identifiable and portion-certain you are.
- "note": optional short note (e.g. "estimated from typical portion", "cooked weight").

Also provide:
- "totalWeightGrams": your estimate of the total edible weight.
- "notes": a brief honest comment about uncertainty or assumptions.

Rules:
- If a liquid (oil, sauce, drink, dressing) is present, estimate its volume, convert to grams, and count its calories.
- If you cannot see something clearly, still give a best estimate and mark confidence "low".
- Use realistic, well-known nutrition values.
- Respond with ONLY a single valid JSON object (no markdown, no extra text) in exactly this schema:

{
  "items": [
    { "name": string, "grams": number, "per100g": {"kcal":number,"protein":number,"carbs":number,"fat":number}, "confidence": "high"|"medium"|"low", "note": string }
  ],
  "totalWeightGrams": number,
  "notes": string
}`;

/* ---------------- brand assets ---------------- */
const MASCOT = `<svg viewBox="0 0 120 120" class="mascot-svg" aria-hidden="true">
  <path d="M60 22 C70 14 86 16 88 26 C78 30 66 30 60 22 Z" fill="var(--muted)"/>
  <path d="M60 26 C36 26 24 44 24 64 C24 92 40 108 60 108 C80 108 96 92 96 64 C96 44 84 26 60 26 Z" fill="currentColor"/>
  <circle cx="44" cy="74" r="6" fill="var(--bg)" opacity="0.35"/>
  <circle cx="76" cy="74" r="6" fill="var(--bg)" opacity="0.35"/>
  <circle cx="49" cy="62" r="5.5" fill="var(--bg)"/>
  <circle cx="71" cy="62" r="5.5" fill="var(--bg)"/>
  <circle cx="51" cy="60" r="1.8" fill="var(--muted)"/>
  <circle cx="73" cy="60" r="1.8" fill="var(--muted)"/>
  <path d="M50 78 Q60 88 70 78" fill="none" stroke="var(--bg)" stroke-width="3.5" stroke-linecap="round"/>
</svg>`;

const ICONS = {
  drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.7s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z"/></svg>',
  scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="4"/><line x1="12" y1="4" x2="12" y2="20"/><circle cx="12" cy="12" r="3.4"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11"/><path d="M7 11l5 4 5-4"/><path d="M4 20h16"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 3-2 4-2 7a2 2 0 0 0 4 0c0 0 3 2 3 6a5 5 0 0 1-10 0c0-4 5-6 5-13z"/></svg>',
};

/* ---------------- storage ---------------- */
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

let settings = Object.assign({}, DEFAULT_SETTINGS, load(LS.settings, {}));
let bank = load(LS.bank, []);
let diary = load(LS.diary, {});
let water = load(LS.water, {});
let weights = load(LS.weights, []);
let currentImage = null;
let currentAnalysis = null;
let diaryDate = todayStr();

/* ---------------- helpers ---------------- */
function uid() { return (crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now() + Math.random().toString(16).slice(2)); }
function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function round1(v) { return Math.round(num(v) * 10) / 10; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function emptyState(msg) { return `<div class="empty"><span class="empty-mascot">${MASCOT}</span>${esc(msg)}</div>`; }
function todayStr(d) { const x = d ? new Date(d) : new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
function shiftDate(str, days) { const d = new Date(str + 'T00:00:00'); d.setDate(d.getDate() + days); return todayStr(d); }
function fmtDate(str) {
  const d = new Date(str + 'T00:00:00');
  const today = todayStr(); const yest = shiftDate(today, -1);
  if (str === today) return 'Today';
  if (str === yest) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: (d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined) });
}
function isImperial() { return settings.units === 'imperial'; }
function weightUnit() { return isImperial() ? 'oz' : 'g'; }
function toDisplay(g) { return isImperial() ? round1(g / 28.3495) : Math.round(g); }
function fromDisplay(v) { return isImperial() ? v * 28.3495 : v; }
function kgToDisplay(kg) { return settings.weightUnit === 'lb' ? round1(kg * 2.20462) : round1(kg); }
function displayToKg(v) { return settings.weightUnit === 'lb' ? v / 2.20462 : v; }

function computeItem(it) {
  const g = num(it.grams); const p = it.per100g || {}; const s = g / 100;
  return { kcal: (num(p.kcal) || 0) * s, protein: (num(p.protein) || 0) * s, carbs: (num(p.carbs) || 0) * s, fat: (num(p.fat) || 0) * s, grams: g };
}
function totals(items) {
  return (items || []).reduce((a, it) => { const c = computeItem(it); a.kcal += c.kcal; a.protein += c.protein; a.carbs += c.carbs; a.fat += c.fat; return a; }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}
function macroChips(t) {
  return `<span class="chip kcal">${Math.round(t.kcal)} kcal</span>
  <span class="chip p">P ${Math.round(t.protein)}g</span>
  <span class="chip c">C ${Math.round(t.carbs)}g</span>
  <span class="chip f">F ${Math.round(t.fat)}g</span>`;
}
function cloneItem(it) { return { name: it.name, grams: it.grams, per100g: Object.assign({}, it.per100g), confidence: it.confidence, note: it.note }; }

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ---------------- navigation ---------------- */
function goTab(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  if (name === 'bank') renderBank();
  if (name === 'diary') { diaryDate = todayStr(); renderDiary(); }
  if (name === 'settings') renderSettings();
  window.scrollTo(0, 0);
}

/* ---------------- image capture ---------------- */
function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const { dataUrl, base64, thumb } = compress(img);
      currentImage = { base64, thumb, dataUrl };
      showPreview(dataUrl);
      document.getElementById('analyzeBtn').disabled = false;
    };
    img.onerror = () => toast('Could not read that image.');
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function compress(img) {
  const max = 1280; let w = img.width, h = img.height;
  const r = Math.min(1, max / Math.max(w, h)); w = Math.round(w * r); h = Math.round(h * r);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  const dataUrl = c.toDataURL('image/jpeg', 0.82); const base64 = dataUrl.split(',')[1];
  const tw = 240, th = Math.round(240 * h / w);
  const tc = document.createElement('canvas'); tc.width = tw; tc.height = th;
  tc.getContext('2d').drawImage(img, 0, 0, tw, th);
  const thumb = tc.toDataURL('image/jpeg', 0.6);
  return { dataUrl, base64, thumb };
}
function showPreview(src) {
  document.getElementById('previewImg').src = src;
  document.getElementById('previewWrap').hidden = false;
}

/* ---------------- Claude call ---------------- */
async function callAnthropic(promptText, base64) {
  const body = {
    model: settings.model || DEFAULT_SETTINGS.model,
    max_tokens: 1500,
    temperature: 0.2,
    system: 'You are a precise nutritionist assistant. You analyze meal photos and return structured nutrition data. Respond with valid JSON only.',
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
      { type: 'text', text: promptText },
    ] }],
  };
  const res = await fetch(settings.apiEndpoint || DEFAULT_SETTINGS.apiEndpoint, {
    method: 'POST',
    headers: { 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try { const j = await res.json(); if (j && j.error && j.error.message) msg = j.error.message; } catch (e) {}
    if (res.status === 401) msg = 'Invalid API key. Check Settings.';
    if (res.status === 404) msg = 'Model not found. Try a different model in Settings.';
    throw new Error(msg);
  }
  const j = await res.json();
  return (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}
function parseMealJSON(text) {
  let t = (text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '');
  const s = t.indexOf('{'); const e = t.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('No JSON found in the model response.');
  t = t.slice(s, e + 1);
  const obj = JSON.parse(t);
  if (!Array.isArray(obj.items) || !obj.items.length) throw new Error('The model returned no food items.');
  obj.items = obj.items.map((it, i) => {
    const p = it.per100g || {};
    return { name: String(it.name || ('Item ' + (i + 1))), grams: num(it.grams), per100g: { kcal: num(p.kcal), protein: num(p.protein), carbs: num(p.carbs), fat: num(p.fat) }, confidence: ['high', 'medium', 'low'].includes(it.confidence) ? it.confidence : 'medium', note: it.note || '' };
  });
  obj.totalWeightGrams = num(obj.totalWeightGrams) || obj.items.reduce((a, b) => a + b.grams, 0);
  obj.notes = obj.notes || '';
  return obj;
}
async function analyze() {
  if (!settings.apiKey) { toast('Add your Anthropic API key in Settings.'); goTab('settings'); return; }
  if (!currentImage) { toast('Take or choose a photo first.'); return; }
  setLoading(true);
  try {
    const text = await callAnthropic(PROMPT, currentImage.base64);
    const parsed = parseMealJSON(text);
    parsed.thumb = currentImage.thumb;
    currentAnalysis = parsed;
    renderResults(parsed);
    toast('Analysis ready — tweak the grams if needed.');
  } catch (err) {
    toast('Analysis failed: ' + (err && err.message ? err.message : err));
  } finally { setLoading(false); }
}
function setLoading(on) {
  const btn = document.getElementById('analyzeBtn'); const spin = document.getElementById('analyzeSpinner'); const label = document.getElementById('analyzeLabel');
  btn.disabled = on; spin.hidden = !on; label.textContent = on ? 'Analyzing…' : 'Analyze with Claude';
}

/* ---------------- results ---------------- */
function renderResults(data) {
  const wrap = document.getElementById('results');
  wrap.innerHTML = `
    <div class="results-card">
      <input id="mealName" class="meal-name" placeholder="Name this meal (e.g. Chicken lunch)" />
      <div id="itemsList" class="items-list"></div>
      <div class="totals" id="totalsBox"></div>
      <div class="actions">
        <button class="btn primary" id="saveBankBtn">Save to Meal Bank</button>
        <button class="btn" id="logMealBtn">Log Meal</button>
        <button class="btn ghost" id="discardBtn">Discard</button>
      </div>
      ${data.notes ? `<p class="model-note">${esc(data.notes)}</p>` : ''}
    </div>`;
  renderItems(data.items);
  updateTotals();
  document.getElementById('saveBankBtn').onclick = saveToBank;
  document.getElementById('logMealBtn').onclick = () => logMeal(currentAnalysis);
  document.getElementById('discardBtn').onclick = () => { currentAnalysis = null; wrap.innerHTML = ''; };
}
function renderItems(items) {
  const list = document.getElementById('itemsList');
  list.innerHTML = items.map((it, idx) => {
    const c = computeItem(it);
    return `<div class="item" data-idx="${idx}">
      <div class="item-head"><span class="item-name">${esc(it.name)}</span><span class="badge ${it.confidence}">${it.confidence}</span></div>
      ${it.note ? `<div class="item-note">${esc(it.note)}</div>` : ''}
      <div class="grams-row">
        <input type="range" min="5" max="2000" step="5" value="${it.grams}" class="grams-slider" data-idx="${idx}" />
        <div class="grams-num"><input type="number" min="0" step="1" value="${toDisplay(it.grams)}" class="grams-input" data-idx="${idx}" /><span class="unit">${weightUnit()}</span></div>
      </div>
      <div class="item-macros" id="macros-${idx}">${macroChips(c)}</div>
    </div>`;
  }).join('');
  list.querySelectorAll('.grams-slider, .grams-input').forEach((el) => {
    el.addEventListener('input', (e) => {
      const idx = +e.target.dataset.idx;
      const v = Math.max(0, fromDisplay(Number(e.target.value) || 0));
      items[idx].grams = v;
      const slider = list.querySelector(`.grams-slider[data-idx="${idx}"]`);
      const numInp = list.querySelector(`.grams-input[data-idx="${idx}"]`);
      if (slider && slider !== e.target) slider.value = v;
      if (numInp && numInp !== e.target) numInp.value = toDisplay(v);
      document.getElementById('macros-' + idx).innerHTML = macroChips(computeItem(items[idx]));
      updateTotals();
    });
  });
}
function updateTotals() {
  const t = totals(currentAnalysis.items);
  document.getElementById('totalsBox').innerHTML = `<div class="total-kcal">${Math.round(t.kcal)} <span>kcal</span></div><div class="totals-macros">${macroChips(t)}</div>`;
}
function mealBasics(data, nameOverride) {
  const name = (nameOverride != null ? nameOverride : (document.getElementById('mealName') ? document.getElementById('mealName').value : '')).trim();
  const items = (data.items || []).map(cloneItem);
  const t = totals(items);
  return { name: name || 'Meal', kcal: Math.round(t.kcal), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat), items, thumb: data.thumb || '' };
}
function saveToBank() {
  const m = mealBasics(currentAnalysis);
  bank.unshift(Object.assign({ id: uid(), ts: Date.now() }, m));
  save(LS.bank, bank); renderBank();
  toast('Saved to Meal Bank ✓'); goTab('bank');
}
function logMeal(data) {
  const m = mealBasics(data);
  const entry = Object.assign({ id: uid(), ts: Date.now() }, m);
  const day = todayStr();
  diary[day] = diary[day] || [];
  diary[day].unshift(entry); save(LS.diary, diary);
  toast('Logged to ' + day + ' ✓');
  currentAnalysis = null; document.getElementById('results').innerHTML = '';
  diaryDate = day; renderDiary(); goTab('diary');
}

/* ---------------- meal bank ---------------- */
function renderBank() {
  const el = document.getElementById('bankList');
  if (!bank.length) { el.innerHTML = emptyState('No saved meals yet. Analyze a meal and tap “Save to Meal Bank”.'); return; }
  el.innerHTML = bank.map((m) => `
    <div class="bank-card">
      ${m.thumb ? `<img class="bank-thumb" src="${m.thumb}" alt="">` : `<div class="bank-thumb placeholder"></div>`}
      <div class="bank-info">
        <div class="bank-name">${esc(m.name)}</div>
        <div class="bank-kcal">${m.kcal} kcal</div>
        <div class="bank-sub">${m.items.length} items · P${m.protein}g C${m.carbs}g F${m.fat}g</div>
      </div>
      <div class="bank-actions">
        <button class="btn small primary" data-log="${m.id}">Log</button>
        <button class="btn small ghost" data-del="${m.id}">✕</button>
      </div>
    </div>`).join('');
  el.querySelectorAll('[data-log]').forEach((b) => b.onclick = () => { const m = bank.find((x) => x.id === b.dataset.log); if (m) logMeal(m); });
  el.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { bank = bank.filter((x) => x.id !== b.dataset.del); save(LS.bank, bank); renderBank(); });
}

/* ---------------- diary + water + weight ---------------- */
function macroTargets() {
  const cal = Number(settings.dailyGoal) || 2000;
  const s = settings.macroSplit || { p: 30, c: 40, f: 30 };
  return { protein: Math.round(cal * (s.p || 0) / 100 / 4), carbs: Math.round(cal * (s.c || 0) / 100 / 4), fat: Math.round(cal * (s.f || 0) / 100 / 9) };
}
function dietStatus() {
  const tdee = Number(settings.tdee) || 0; const goal = Number(settings.dailyGoal) || 0;
  if (!tdee) return null;
  const d = goal - tdee;
  if (d < -tdee * 0.05) return { label: 'Cutting · deficit', cls: 'cut' };
  if (d > tdee * 0.05) return { label: 'Bulking · surplus', cls: 'bulk' };
  return { label: 'Maintenance', cls: 'maint' };
}
function macroRow(label, key, got, want, color) {
  const pct = want > 0 ? clamp(Math.round(got / want * 100), 0, 100) : 0;
  return `<div class="macro-row"><span class="mlabel"><span class="dot" style="background:${color}"></span>${label}</span><span class="mtrack"><span class="mfill" style="width:${pct}%;background:${color}"></span></span><span class="mval">${Math.round(got)}/${Math.round(want)}g</span></div>`;
}

function renderDiary() {
  const el = document.getElementById('diaryView');
  const entries = diary[diaryDate] || [];
  const t = entries.reduce((a, e) => { a.kcal += e.kcal; a.protein += e.protein; a.carbs += e.carbs; a.fat += e.fat; return a; }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const goal = Number(settings.dailyGoal) || 2000;
  const pct = clamp(Math.round((t.kcal / goal) * 100), 0, 100);
  const wml = water[diaryDate] || 0;
  const wGoal = Number(settings.waterGoalMl) || 2000;
  const wpct = clamp(Math.round((wml / wGoal) * 100), 0, 100);

  const tg = macroTargets();
  const diet = dietStatus();
  el.innerHTML = `
    <div class="section-head-row">
      <h1>Diary</h1>
      <button class="btn small primary" id="exportBtn">${ICONS.download} CSV</button>
    </div>
    <div class="diary-nav">
      <button class="btn icon" id="prevDay">‹</button>
      <div class="diary-date">${fmtDate(diaryDate)}</div>
      <button class="btn icon" id="nextDay">›</button>
    </div>

    <div class="card">
      <div class="card-head"><span class="ico">${ICONS.flame}</span><h3>Calories</h3><span class="muted">${goal} goal${diet ? ` · <span class="diet-badge ${diet.cls}">${diet.label}</span>` : ''}</span></div>
      <div class="goal-num">${Math.round(t.kcal)} <span>kcal</span></div>
      <div class="progress"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="macros-block">
        ${macroRow('Protein', 'protein', t.protein, tg.protein, 'var(--p)')}
        ${macroRow('Carbs', 'carbs', t.carbs, tg.carbs, 'var(--c)')}
        ${macroRow('Fat', 'fat', t.fat, tg.fat, 'var(--f)')}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><span class="ico">${ICONS.drop}</span><h3>Water</h3><span class="muted" id="waterLabel">${wml} / ${wGoal} ml</span></div>
      <div class="water-body">
        <div class="bottle"><div class="bottle-fill" id="waterFill" style="height:${wpct}%"></div></div>
        <div class="water-right"><div class="water-actions" id="waterActions"></div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><span class="ico">${ICONS.scale}</span><h3>Weight</h3></div>
      <div class="weight-input-row">
        <input id="weightInput" type="number" step="0.1" placeholder="0" inputmode="decimal" />
        <span class="unit-lbl">${settings.weightUnit}</span>
        <button class="btn primary small" id="weightLog">Log</button>
      </div>
      <div class="spark" id="weightSpark">${weightSparkline()}</div>
      <div class="trend" id="weightTrend">${weightTrendText()}</div>
    </div>

    <div id="diaryList" class="diary-list"></div>`;

  const wa = document.getElementById('waterActions');
  wa.innerHTML = [{ l: '+250', v: 250 }, { l: '+500', v: 500 }, { l: '+1 cup', v: 240 }, { l: '−250', v: -250 }]
    .map((b) => `<button class="btn small" data-w="${b.v}">${b.l}</button>`).join('');
  wa.querySelectorAll('[data-w]').forEach((b) => b.onclick = () => addWater(Number(b.dataset.w)));

  const wInput = document.getElementById('weightInput');
  const todayW = todaysWeightKg();
  wInput.value = todayW != null ? kgToDisplay(todayW) : '';
  document.getElementById('weightLog').onclick = logWeightFromInput;

  const list = document.getElementById('diaryList');
  if (!entries.length) list.innerHTML = emptyState('Nothing logged for this day yet. Snap a meal to start.');
  else {
    list.innerHTML = entries.map((e) => `
      <div class="diary-entry">
        ${e.thumb ? `<img class="entry-thumb" src="${e.thumb}">` : ''}
        <div class="entry-info"><div class="entry-name">${esc(e.name)}</div><div class="entry-sub">${e.kcal} kcal · P${e.protein}g C${e.carbs}g F${e.fat}g</div></div>
        <button class="btn small ghost" data-rm="${e.id}">✕</button>
      </div>`).join('');
    list.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { diary[diaryDate] = (diary[diaryDate] || []).filter((x) => x.id !== b.dataset.rm); save(LS.diary, diary); renderDiary(); });
  }

  document.getElementById('prevDay').onclick = () => { diaryDate = shiftDate(diaryDate, -1); renderDiary(); };
  document.getElementById('nextDay').onclick = () => { diaryDate = shiftDate(diaryDate, 1); renderDiary(); };
  document.getElementById('exportBtn').onclick = exportCSV;
}
function addWater(ml) {
  const d = diaryDate;
  water[d] = Math.max(0, (water[d] || 0) + ml);
  save(LS.water, water);
  const lbl = document.getElementById('waterLabel'); const fill = document.getElementById('waterFill');
  const wGoal = Number(settings.waterGoalMl) || 2000;
  if (lbl) lbl.textContent = `${water[d]} / ${wGoal} ml`;
  if (fill) fill.style.height = clamp(Math.round((water[d] / wGoal) * 100), 0, 100) + '%';
  if (ml > 0) toast('+ ' + ml + ' ml 💧');
}
function todaysWeightKg() { const e = weights.find((w) => w.date === diaryDate); return e ? e.kg : null; }
function logWeightFromInput() {
  const v = Number(document.getElementById('weightInput').value);
  if (!v || v <= 0) { toast('Enter a weight first'); return; }
  const kg = displayToKg(v);
  const ex = weights.find((w) => w.date === diaryDate);
  if (ex) ex.kg = kg; else weights.push({ date: diaryDate, kg, ts: Date.now() });
  weights.sort((a, b) => (a.date < b.date ? -1 : 1));
  save(LS.weights, weights);
  renderDiary(); toast('Weight logged ✓');
}
function weightSparkline() {
  const recent = weights.slice(-14);
  if (!recent.length) return '<div class="muted center" style="height:100%;display:flex;align-items:center;justify-content:center">Log your weight to see the trend</div>';
  const vals = recent.map((w) => w.kg);
  const min = Math.min(...vals), max = Math.max(...vals); const span = (max - min) || 1;
  const W = 100, H = 40, pad = 4;
  const pts = recent.map((w, i) => {
    const x = recent.length === 1 ? W / 2 : pad + (W - 2 * pad) * i / (recent.length - 1);
    const y = H - pad - ((w.kg - min) / span) * (H - 2 * pad);
    return [x, y];
  });
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ` L ${pts[pts.length - 1][0].toFixed(1)} ${H} L ${pts[0][0].toFixed(1)} ${H} Z`;
  const last = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1FD65F" stop-opacity=".35"/><stop offset="1" stop-color="#1FD65F" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="currentColor" opacity="0.12"/>
    <path d="${line}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3" fill="currentColor"/>
  </svg>`;
}
function weightTrendText() {
  if (weights.length < 2) return weights.length ? 'First entry saved' : '';
  const a = weights[weights.length - 2].kg, b = weights[weights.length - 1].kg;
  const d = round1((b - a) * (settings.weightUnit === 'lb' ? 2.20462 : 1));
  if (d === 0) return 'No change since last entry';
  return (d < 0 ? '▼ ' : '▲ ') + Math.abs(d) + ' ' + settings.weightUnit + ' vs previous';
}

/* ---------------- CSV export ---------------- */
function csvCell(v) { v = v == null ? '' : String(v); if (/[",\n\r]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"'; return v; }
function exportCSV() {
  const rows = [['date', 'type', 'name', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'water_ml', 'weight_kg']];
  const wByDate = {}; weights.forEach((w) => { wByDate[w.date] = w.kg; });
  const dates = Array.from(new Set([...Object.keys(diary), ...Object.keys(water)])).sort();
  dates.forEach((d) => {
    (diary[d] || []).forEach((e) => rows.push([d, 'meal', e.name, e.kcal, e.protein, e.carbs, e.fat, '', '']));
    if (water[d]) rows.push([d, 'water', '', '', '', '', '', water[d], '']);
    if (wByDate[d] != null) rows.push([d, 'weight', '', '', '', '', '', '', wByDate[d]]);
  });
  if (rows.length === 1) { toast('Nothing to export yet'); return; }
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'caloscan-' + todayStr() + '.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Exported CSV ✓');
}

/* ---------------- barcode scanning ---------------- */
let scanner = null, scanningDone = false;
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
function openBarcode() {
  document.getElementById('barcodeModal').hidden = false;
  document.getElementById('barcodeStatus').textContent = '';
  startScanner();
}
function closeBarcode() { document.getElementById('barcodeModal').hidden = true; stopScanner(); }
async function startScanner() {
  const status = document.getElementById('barcodeStatus');
  status.textContent = 'Starting camera…';
  try {
    if (!window.Html5Qrcode) await loadScript('https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js');
    if (!window.Html5Qrcode) { status.textContent = 'Could not load scanner. Use manual entry below.'; return; }
    scanner = new window.Html5Qrcode('barcodeReader');
    scanningDone = false;
    const F = window.Html5QrcodeSupportedFormats;
    const formats = F ? [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39] : undefined;
    const config = { fps: 10, qrbox: { width: 240, height: 160 }, ...(formats ? { formatsToSupport: formats } : {}) };
    await scanner.start({ facingMode: 'environment' }, config, onScan, () => {});
    status.textContent = 'Point at a barcode…';
  } catch (e) { status.textContent = 'Camera unavailable. Type the barcode below.'; }
}
function onScan(text) { if (scanningDone) return; scanningDone = true; stopScanner(); document.getElementById('barcodeStatus').textContent = 'Found! Looking up…'; lookupBarcode(text); }
async function stopScanner() {
  try { if (scanner && scanner.getState && scanner.getState() === (window.Html5Qrcode && window.Html5Qrcode.ScannerState ? window.Html5Qrcode.ScannerState.SCANNING : 2)) await scanner.stop(); } catch (e) {}
  try { if (scanner) await scanner.clear(); } catch (e) {}
  scanner = null;
}
async function lookupBarcode(code) {
  code = String(code || '').trim();
  if (!code) return;
  try {
    const r = await fetch('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(code) + '.json');
    const j = await r.json();
    if (!j.product) { toast('No product found for ' + code); closeBarcode(); return; }
    const p = j.product; const n = p.nutriments || {};
    const kcal = n['energy-kcal_100g'] != null ? n['energy-kcal_100g'] : (n['energy_100g'] != null ? n['energy_100g'] / 4.184 : 0);
    const item = {
      name: p.product_name || ('Product ' + code),
      grams: n['serving_quantity'] || 100,
      per100g: { kcal: num(kcal), protein: num(n['proteins_100g']), carbs: num(n['carbohydrates_100g']), fat: num(n['fat_100g']) },
      confidence: 'high',
      note: 'Scanned barcode ' + code + (p.brands ? (' · ' + p.brands) : ''),
    };
    const meal = { items: [item], thumb: p.image_front_url || p.image_url || '', notes: 'From Open Food Facts barcode lookup.' };
    currentAnalysis = meal;
    closeBarcode(); goTab('camera'); renderResults(meal);
    toast('Product found ✓');
  } catch (e) { toast('Lookup failed (needs internet)'); closeBarcode(); }
}

/* ---------------- settings ---------------- */
function applyTheme() {
  const t = settings.theme;
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}
function updateThemeIcon() {
  const moon = settings.theme === 'dark';
  document.getElementById('themeIcon').innerHTML = moon
    ? '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>'
    : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
}
function setTheme(mode) { settings.theme = mode; save(LS.settings, settings); applyTheme(); updateThemeIcon(); }

function renderSettings() {
  const el = document.getElementById('settingsView');
  const modelOpts = MODELS.map((m) => `<option value="${m.id}">${esc(m.label)}</option>`).join('');
  const s = settings.macroSplit || { p: 30, c: 40, f: 30 };
  const presetMap = { balanced: { p: 30, c: 40, f: 30 }, highp: { p: 40, c: 30, f: 30 }, lowcarb: { p: 35, c: 20, f: 45 }, keto: { p: 25, c: 5, f: 70 } };
  let presetKey = 'custom';
  for (const k in presetMap) { if (presetMap[k].p === s.p && presetMap[k].c === s.c && presetMap[k].f === s.f) presetKey = k; }

  function macroSlider(key, label, val, color) {
    return `<div class="mslider">
      <div class="mslider-top"><span><span class="dot" style="background:${color}"></span>${label}</span><span class="mlbl-val" id="lbl-${key}"></span></div>
      <input type="range" min="0" max="100" value="${val}" id="set${key.toUpperCase()}" class="macro-range ${key}" />
    </div>`;
  }

  el.innerHTML = `
    <div class="field">
      <label>Anthropic API key</label>
      <div class="key-row"><input type="password" id="setKey" placeholder="sk-ant-..." value="${esc(settings.apiKey)}" autocomplete="off" /><button class="show-toggle" id="showKey" type="button">Show</button></div>
      <div class="hint">Stored only on this device. Get one at <a href="https://console.anthropic.com/" target="_blank" rel="noopener">console.anthropic.com</a>.</div>
    </div>
    <div class="field">
      <label>Vision model</label>
      <input type="text" id="setModel" list="modelList" value="${esc(settings.model)}" placeholder="claude-sonnet-4-6" />
      <datalist id="modelList">${modelOpts}</datalist>
      <div class="hint">Default Claude Sonnet 4.6. Use Opus 4.1 for max accuracy or Haiku 4.5 for speed.</div>
    </div>
    <div class="field">
      <label>Daily calorie goal</label>
      <input type="number" id="setGoal" value="${esc(settings.dailyGoal)}" min="0" step="50" />
    </div>
    <div class="field">
      <label>Maintenance calories (TDEE) — optional</label>
      <input type="number" id="setTdee" value="${settings.tdee ? esc(settings.tdee) : ''}" min="0" step="10" placeholder="e.g. 2200" />
      <div class="hint">Used with a Goal below to suggest a calorie target and label Cutting / Maintenance / Bulking.</div>
    </div>
    <div class="field">
      <label>Goal</label>
      <select id="setGoalType">
        <option value="">Custom / not set</option>
        <option value="cut">Cut · lose fat</option>
        <option value="maintain">Maintain</option>
        <option value="bulk">Build muscle · bulk</option>
      </select>
      <div class="hint">Auto‑sets your macro split and (if TDEE is entered) your calorie target. Fine‑tune with the sliders below.</div>
    </div>
    <div class="field">
      <label>Daily macro targets</label>
      <select id="setMacroPreset">
        <option value="balanced" ${presetKey === 'balanced' ? 'selected' : ''}>Balanced (30/40/30)</option>
        <option value="highp" ${presetKey === 'highp' ? 'selected' : ''}>High protein (40/30/30)</option>
        <option value="lowcarb" ${presetKey === 'lowcarb' ? 'selected' : ''}>Low carb (35/20/45)</option>
        <option value="keto" ${presetKey === 'keto' ? 'selected' : ''}>Keto (25/5/70)</option>
        <option value="custom" ${presetKey === 'custom' ? 'selected' : ''}>Custom</option>
      </select>
      <div class="macro-sliders">
        ${macroSlider('p', 'Protein', s.p, 'var(--p)')}
        ${macroSlider('c', 'Carbs', s.c, 'var(--c)')}
        ${macroSlider('f', 'Fat', s.f, 'var(--f)')}
      </div>
      <div class="hint" id="macroPreview"></div>
      <div class="hint">Drag one slider — the others move in tandem so they always total 100%.</div>
    </div>
    <div class="field">
      <label>Food units</label>
      <select id="setUnits"><option value="metric" ${settings.units === 'metric' ? 'selected' : ''}>Metric (grams)</option><option value="imperial" ${settings.units === 'imperial' ? 'selected' : ''}>Imperial (ounces)</option></select>
    </div>
    <div class="field">
      <label>Body weight unit</label>
      <select id="setWeightUnit"><option value="kg" ${settings.weightUnit === 'kg' ? 'selected' : ''}>Kilograms (kg)</option><option value="lb" ${settings.weightUnit === 'lb' ? 'selected' : ''}>Pounds (lb)</option></select>
    </div>
    <div class="field">
      <label>Daily water goal (ml)</label>
      <input type="number" id="setWaterGoal" value="${esc(settings.waterGoalMl)}" min="0" step="100" />
    </div>
    <div class="field">
      <label>Theme</label>
      <select id="setTheme"><option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Dark</option><option value="auto" ${settings.theme === 'auto' ? 'selected' : ''}>Auto (system)</option></select>
    </div>
    <div class="field">
      <label>How accurate is this?</label>
      <div class="hint">Claude is great at recognizing food and estimating portions, but a photo can't weigh your plate. For best results: shoot in good light, include a fork/coin for scale, and nudge the gram sliders. Meals in your Bank are exact by definition, and barcode scans pull real label data.</div>
    </div>
    <div class="field">
      <label>Install on your phone</label>
      <div class="hint">Open this app over <b>HTTPS</b>, then use your browser's “Add to Home Screen” / “Install app”. On iOS: Safari → Share → Add to Home Screen.</div>
      <button class="btn ghost danger block" id="clearBtn" style="margin-top:10px">Clear all data</button>
    </div>`;

  const set = (id, key, isNum) => { const n = document.getElementById(id); n.addEventListener('input', () => { settings[key] = isNum ? Number(n.value) : n.value; save(LS.settings, settings); if (key === 'theme') { applyTheme(); updateThemeIcon(); } }); };
  set('setKey', 'apiKey'); set('setModel', 'model'); set('setGoal', 'dailyGoal', true); set('setWaterGoal', 'waterGoalMl', true); set('setTdee', 'tdee', true);
  set('setUnits', 'units'); set('setWeightUnit', 'weightUnit'); set('setTheme', 'theme');

  function updateMacroLabels() {
    ['p', 'c', 'f'].forEach((k) => {
      const cal = Number(settings.dailyGoal) || 2000;
      const pct = Number(document.getElementById('set' + k.toUpperCase()).value) || 0;
      const g = Math.round(cal * pct / 100 / (k === 'f' ? 9 : 4));
      document.getElementById('lbl-' + k).textContent = pct + '% · ' + g + 'g';
    });
  }
  function updateMacroPreview() {
    const cal = Number(settings.dailyGoal) || 2000;
    const p = Number(document.getElementById('setP').value) || 0;
    const c = Number(document.getElementById('setC').value) || 0;
    const f = Number(document.getElementById('setF').value) || 0;
    const tg = { protein: Math.round(cal * p / 100 / 4), carbs: Math.round(cal * c / 100 / 4), fat: Math.round(cal * f / 100 / 9) };
    document.getElementById('macroPreview').textContent = `Target ≈ ${tg.protein}g protein · ${tg.carbs}g carbs · ${tg.fat}g fat`;
  }
  function rebalance(changed) {
    const ids = ['p', 'c', 'f']; const others = ids.filter((x) => x !== changed);
    const vals = { p: Number(document.getElementById('setP').value) || 0, c: Number(document.getElementById('setC').value) || 0, f: Number(document.getElementById('setF').value) || 0 };
    let v = Math.max(0, Math.min(100, Math.round(vals[changed]))); vals[changed] = v;
    const rem = 100 - v; const oSum = vals[others[0]] + vals[others[1]];
    let a, b;
    if (oSum <= 0) { a = Math.round(rem / 2); b = rem - a; } else { a = Math.round(rem * vals[others[0]] / oSum); b = rem - a; }
    vals[others[0]] = a; vals[others[1]] = b;
    const tot = vals.p + vals.c + vals.f; if (tot !== 100) vals[others[1]] += 100 - tot;
    document.getElementById('setP').value = vals.p; document.getElementById('setC').value = vals.c; document.getElementById('setF').value = vals.f;
    settings.macroSplit = { p: vals.p, c: vals.c, f: vals.f }; save(LS.settings, settings);
    updateMacroLabels(); updateMacroPreview();
  }
  function applyGoal(g) {
    const tdee = Number(settings.tdee) || 0;
    if (g === 'cut') { settings.macroSplit = { p: 40, c: 30, f: 30 }; if (tdee) settings.dailyGoal = Math.round(tdee * 0.8); }
    else if (g === 'bulk') { settings.macroSplit = { p: 40, c: 30, f: 30 }; if (tdee) settings.dailyGoal = Math.round(tdee * 1.15); }
    else { settings.macroSplit = { p: 30, c: 40, f: 30 }; if (tdee) settings.dailyGoal = Math.round(tdee); }
    save(LS.settings, settings); renderSettings();
  }

  document.getElementById('setGoalType').addEventListener('change', (e) => { if (e.target.value) applyGoal(e.target.value); });
  document.getElementById('setMacroPreset').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v !== 'custom' && presetMap[v]) { settings.macroSplit = Object.assign({}, presetMap[v]); save(LS.settings, settings); renderSettings(); }
  });
  ['p', 'c', 'f'].forEach((k) => { document.getElementById('set' + k.toUpperCase()).addEventListener('input', () => rebalance(k)); });
  updateMacroLabels(); updateMacroPreview();

  document.getElementById('setUnits').addEventListener('change', () => {
    settings.units = document.getElementById('setUnits').value;
    settings.weightUnit = settings.units === 'imperial' ? 'lb' : 'kg';
    save(LS.settings, settings); renderSettings();
  });
  const showKey = document.getElementById('showKey');
  showKey.onclick = () => { const k = document.getElementById('setKey'); if (k.type === 'password') { k.type = 'text'; showKey.textContent = 'Hide'; } else { k.type = 'password'; showKey.textContent = 'Show'; } };
  document.getElementById('clearBtn').onclick = () => {
    if (confirm('Delete all saved meals, diary, water, weight and your API key from this device?')) {
      bank = []; diary = {}; water = {}; weights = []; settings = Object.assign({}, DEFAULT_SETTINGS);
      save(LS.bank, bank); save(LS.diary, diary); save(LS.water, water); save(LS.weights, weights); save(LS.settings, settings);
      applyTheme(); renderSettings(); renderBank(); toast('All data cleared.');
    }
  };
}

/* ---------------- install ---------------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; const b = document.getElementById('installBtn'); if (b) b.hidden = false; });
window.addEventListener('appinstalled', () => { const b = document.getElementById('installBtn'); if (b) b.hidden = true; });

/* ---------------- init ---------------- */
function init() {
  applyTheme();
  updateThemeIcon();
  document.getElementById('brandMascot').innerHTML = MASCOT;
  document.getElementById('heroMascot').innerHTML = MASCOT;

  document.getElementById('takeBtn').onclick = () => document.getElementById('camInput').click();
  document.getElementById('chooseBtn').onclick = () => document.getElementById('fileInput').click();
  document.getElementById('camInput').onchange = (e) => { handleFile(e.target.files[0]); e.target.value = ''; };
  document.getElementById('fileInput').onchange = (e) => { handleFile(e.target.files[0]); e.target.value = ''; };
  document.getElementById('clearImg').onclick = () => { currentImage = null; document.getElementById('previewWrap').hidden = true; document.getElementById('analyzeBtn').disabled = true; };
  document.getElementById('analyzeBtn').onclick = analyze;
  document.getElementById('scanBarcodeBtn').onclick = openBarcode;
  document.getElementById('barcodeClose').onclick = closeBarcode;
  document.getElementById('barcodeModal').addEventListener('click', (e) => { if (e.target === document.getElementById('barcodeModal')) closeBarcode(); });
  document.getElementById('barcodeLookup').onclick = () => lookupBarcode(document.getElementById('barcodeManual').value);
  document.getElementById('themeToggle').onclick = () => setTheme(settings.theme === 'dark' ? 'light' : 'dark');

  document.querySelectorAll('.nav-btn').forEach((b) => b.onclick = () => goTab(b.dataset.tab));

  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a, .bank-card, .diary-entry')) { try { if (navigator.vibrate) navigator.vibrate(8); } catch (_) {} }
  }, { passive: true });

  const installBtn = document.getElementById('installBtn');
  installBtn.onclick = async () => { if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; installBtn.hidden = true; } };

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}
document.addEventListener('DOMContentLoaded', init);
