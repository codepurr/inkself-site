/* inkfont — почерк → шрифт, целиком в браузере.
   Идея: пользователь пишет ИЗВЕСТНЫЙ текст. Нам не нужно распознавать буквы (OCR):
   мы находим пятна чернил, раскладываем их по строкам слева направо и сопоставляем
   с ожидаемыми символами через динамическое программирование. */

const CONFIG = {
  // Ссылка на оплату (Stripe Payment Link / Lemon Squeezy). Пусто = тестовый режим, скачивание сразу.
  paymentLink: '',
};

const TEMPLATES = {
  latin: [
    'the quick brown fox jumps over the lazy dog.',
    'well-done, right? yes: wow!',
    'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG',
    "0123456789 (it's)",
  ],
  cyrillic: [
    'съешь же ещё этих мягких французских булок, да выпей чаю.',
    'супер-шрифт? да: вау!',
    'СЪЕШЬ ЖЕ ЕЩЁ ЭТИХ МЯГКИХ ФРАНЦУЗСКИХ БУЛОК, ДА ВЫПЕЙ ЧАЮ',
    '0123456789 (ок)',
  ],
};
// в «Обе» цифры и скобки нужны один раз
TEMPLATES.both = [...TEMPLATES.latin, ...TEMPLATES.cyrillic.slice(0, 3)];
// что написано на листе примера (assets/demo-sheet.jpg) — он сделан до строки с цифрами
const DEMO_TEXT = TEMPLATES.latin.slice(0, 3).join('\n');

// Метрики шрифта (единицы при unitsPerEm = 1000)
const UPM = 1000, XH = 500, CH = 720;

const $ = s => document.querySelector(s);
const state = { script: 'latin', image: null, instances: {}, choice: {}, charset: [], font: null, previewFamily: null };

/* ---------- Шаг 1: текст-шаблон ---------- */
const expectedEl = $('#expected');
function setScript(s) {
  if (state.script === 'own' && s !== 'own') state.ownText = expectedEl.value;   // чтобы свой текст не пропал при переключении
  state.script = s;
  document.querySelectorAll('#scriptSeg button').forEach(b => b.classList.toggle('on', b.dataset.s === s));
  if (s === 'own') {
    expectedEl.readOnly = false;
    expectedEl.value = expectedEl.dataset.own && state.ownText != null ? state.ownText : expectedEl.dataset.own ? expectedEl.value : t('ownText');
    expectedEl.focus();
  } else {
    expectedEl.readOnly = true;
    expectedEl.value = TEMPLATES[s].join('\n');
  }
  autosize();
}
function autosize() { expectedEl.style.height = 'auto'; expectedEl.style.height = expectedEl.scrollHeight + 'px'; }
// фото уже загружено и человек поправил текст — пересчитываем буквы сами, без повторной загрузки
let redo;
const rerun = () => { clearTimeout(redo); if (state.lastImg) redo = setTimeout(() => process(state.lastImg), 900); };
expectedEl.addEventListener('input', () => { expectedEl.dataset.own = 1; autosize(); rerun(); });
document.querySelectorAll('#scriptSeg button').forEach(b => b.onclick = () => { setScript(b.dataset.s); rerun(); });
setScript('latin');

/* ---------- Шаг 2: загрузка ---------- */
const drop = $('#drop'), fileIn = $('#file');
fileIn.onchange = () => fileIn.files[0] && loadFile(fileIn.files[0]);
['dragenter', 'dragover'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', ev => ev.dataTransfer.files[0] && loadFile(ev.dataTransfer.files[0]));
$('#demoBtn').onclick = () => runDemo({ tour: true });
$('#demoTop').onclick = () => runDemo({ tour: true });
// из демо — сразу к выбору своего фото (вызов в том же клике, иначе Safari не откроет окно выбора)
$('#demoCtaBtn').onclick = () => { $('#upload').scrollIntoView({ behavior: 'smooth' }); fileIn.click(); };

// режим демо: метка «Демо-лист», вместо покупки — «Загрузить своё фото»
function setDemo(on) {
  state.demo = on;
  $('#demoChip').classList.toggle('hidden', !on);
  $('#demoCta').classList.toggle('hidden', !on);
  $('#buy').classList.toggle('hidden', on);
  const sub = $('#result .sub'); sub.dataset.i18n = on ? 's4subDemo' : 's4sub'; sub.textContent = t(sub.dataset.i18n);
}

function loadFile(f) {
  setDemo(false); clearInterval(typing);
  const img = new Image();
  img.onload = () => process(img);
  img.onerror = () => setStatus('stOpenFail', 'warn');
  img.src = URL.createObjectURL(f);
}

// статус храним ключом, чтобы перевести его при смене языка
function setStatus(key, cls = '', vars = {}) {
  state.status = { key, cls, vars };
  const s = $('#status'); s.textContent = t(key, vars); s.className = 'status ' + cls; $('#scanWrap').style.display = 'block';
}

/* Пример: настоящий лист, написанный от руки (латиница), и шрифт, собранный из него */
async function runDemo({ tour = false } = {}) {
  setDemo(true); clearInterval(typing);
  setScript('latin');
  setStatus('stDemo');
  const url = 'assets/demo-sheet.jpg', prevFam = state.previewFamily;
  // событие load, а не img.decode(): decode ждёт кадра отрисовки и в фоновой вкладке может не завершиться
  const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; })
    .catch(() => null);
  if (!img) return setStatus('stOpenFail', 'warn');
  await process(img, DEMO_TEXT);
  if (tour) await openDemo(url, prevFam);
}

/* Окно демо: лист → найденные буквы → фраза, напечатанная получившимся шрифтом. Страница не прыгает. */
const sleep = ms => new Promise(r => setTimeout(r, ms));
let typing;
async function openDemo(url, prevFam) {
  // шрифт подключается асинхронно — ждём, пока появится новый
  for (let i = 0; i < 60 && state.previewFamily === prevFam; i++) await sleep(50);
  $('#demoSheet').src = url;
  const box = $('#demoLetters'); box.innerHTML = '';
  const sample = [...'aAbgGkQRy?!:'].filter(ch => state.instances[ch]).concat(state.charset.filter(ch => state.instances[ch])).filter((c, i, a) => a.indexOf(c) === i).slice(0, 12);
  for (const ch of sample) {
    const tile = document.createElement('div'), cv = document.createElement('canvas');
    tile.className = 'tile'; cv.className = 'gc'; tile.appendChild(cv); box.appendChild(tile); drawTile(cv, ch);
  }
  const out = $('#demoType'); out.style.fontFamily = `'${state.previewFamily}', -apple-system, sans-serif`;
  $('#demoModal').classList.remove('hidden'); document.body.style.overflow = 'hidden';
  // лист примера латинский, поэтому и фраза латиницей: иначе часть букв выйдет системным шрифтом
  const text = 'This is my new font.';
  clearInterval(typing); out.textContent = ''; let i = 0;
  await sleep(500);
  typing = setInterval(() => { out.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(typing); }, 60);
}
function closeDemo() { clearInterval(typing); $('#demoModal').classList.add('hidden'); document.body.style.overflow = ''; }
$('#demoClose').onclick = closeDemo;
$('#demoModal').addEventListener('click', e => e.target === $('#demoModal') && closeDemo());
document.addEventListener('keydown', e => e.key === 'Escape' && !$('#demoModal').classList.contains('hidden') && closeDemo());
// из окна демо — сразу к выбору своего фото (в том же нажатии, иначе Safari не откроет выбор файла)
$('#demoGo').onclick = () => { closeDemo(); $('#upload').scrollIntoView(); fileIn.click(); };

function expectedText() { return expectedEl.value; }

/* Текст на листе не совпал с выбранным: буквы могли перепутаться. Говорим, что делать, и даём кнопку */
function showMismatch(kind) {
  const box = $('#mismatch');
  box.classList.toggle('hidden', !kind);
  if (!kind) return;
  box.querySelector('p').dataset.i18n = kind === 'other' ? 'mmOther' : 'mmMissing';
  box.querySelector('p').textContent = t(box.querySelector('p').dataset.i18n);
}
$('#mismatchBtn').onclick = () => { setScript('own'); $('#write').scrollIntoView({ behavior: 'smooth' }); };

/* ---------- Обработка изображения ---------- */
// любая неожиданная ошибка распознавания — понятное сообщение, а не вечное «Ищем буквы…»
async function process(img, fixedText) {
  try { await processPhoto(img, fixedText); }
  catch (e) { console.error(e); setStatus('stError', 'warn'); }
}
async function processPhoto(img, fixedText) {
  state.lastImg = fixedText ? null : img;
  setStatus('stSearching');
  await new Promise(r => setTimeout(r, 30));
  const maxSide = 2000, k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * k), H = Math.round(img.naturalHeight * k);
  const cv = $('#scan'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  const seg = segment(data, W, H);
  if (!seg) return setStatus('stNoText', 'warn');
  // Выбранный текст всегда можно «натянуть» на пятна, поэтому сверяем фото со всеми шаблонами
  // и берём тот, что совпадает лучше (у верного текста экземпляры одной буквы похожи и резать почти не нужно)
  const cands = fixedText ? [{ key: state.script, text: fixedText }] : ['latin', 'cyrillic', 'both'].map(k => ({ key: k, text: TEMPLATES[k].join('\n') }));
  if (state.script === 'own' && !fixedText) cands.unshift({ key: 'own', text: expectedText() });
  for (const c of cands) c.fit = alignText(seg, c.text, W).fit;
  const best = cands.reduce((a, b) => (b.fit.match < a.fit.match ? b : a));
  let note = '', tpl = '';
  // свой текст оставляем, если он не хуже шаблонов; если на листе явно шаблон — переключаем на него
  const keep = state.script === 'own' && (best.key === 'own' || cands[0].fit.match - best.fit.match <= 0.3);
  const used = keep ? cands[0] : best;
  if (used.key !== state.script) { note = state.script === 'own' ? 'own' : 'switched'; tpl = used.key; setScript(used.key); }
  const res = alignText(seg, used.text, W);   // заново: разметка строк должна соответствовать выбранному тексту
  if (!res.items.length) return setStatus('stNoText', 'warn');
  showMismatch(res.warn);
  const chars = [...used.text.replace(/\s+/g, '')];
  state.analysis = res; state.W = W;
  // чистая копия фото — для окна правки (на #scan рисуются рамки)
  state.photo = document.createElement('canvas'); state.photo.width = W; state.photo.height = H;
  state.photo.getContext('2d').drawImage(img, 0, 0, W, H);

  // Экземпляры: для каждого символа — все вхождения, лучшие (отдельные, не вырезанные) первыми
  state.instances = {}; state.choice = {};
  for (const it of res.items) {
    const inst = traceItem(it, res.lines[it.line], W);
    if (inst) { inst.item = it; (state.instances[it.char] ||= []).push(inst); }
  }
  for (const ch in state.instances) { rankInstances(state.instances[ch]); state.choice[ch] = 0; }

  drawItems(ctx, res.items, res.lines);
  const found = res.items.length, ratio = found / res.total;
  const cut = res.items.filter(i => i.split).length;
  const low = ratio < 0.85;
  setStatus('stFound', low || res.warn ? 'warn' : 'ok', { found, total: res.total, kinds: Object.keys(state.instances).length, cut, low, note, tpl });

  buildCharset(chars);
  rebuild();
  $('#review').classList.remove('hidden'); $('#result').classList.remove('hidden');
}

/* ---------- Сборка шрифта ---------- */
// Знаки, которые сайт собирает сам из уже написанных: кавычки из апострофа, тире из дефиса,
// многоточие из точки, точку с запятой из двоеточия и запятой. В сетке они с пунктиром, как буквы из пары
const DERIVED = { '"': ["'"], '‘': ["'"], '’': ["'"], '“': ["'"], '”': ["'"], '—': ['-'], '–': ['-'], '…': ['.'], ';': [':', ','] };
function buildCharset(chars) {
  const set = new Set();
  for (const c of chars) { set.add(c); if (isLower(c)) set.add(c.toUpperCase()); if (isUpper(c)) set.add(c.toLowerCase()); }
  for (const [d, need] of Object.entries(DERIVED)) if (need.every(c => set.has(c))) set.add(d);
  state.charset = [...set].sort((a, b) => {
    const r = c => (!/\p{L}/u.test(c) ? (/\d/.test(c) ? 2.5 : 3) : isUpper(c) ? 1 : 2) * 10000 + c.codePointAt(0);
    return r(a) - r(b);
  });
}

// Источник глифа: свой экземпляр, иначе пара по регистру с масштабом (решение проблемы заглавных)
function glyphSource(ch) {
  const own = state.instances[ch];
  if (own) return { rings: own[state.choice[ch] % own.length].rings, sc: 1, auto: false, count: own.length, from: ch };
  if (isUpper(ch) && state.instances[ch.toLowerCase()]) {
    const o = state.instances[ch.toLowerCase()];
    return { rings: o[state.choice[ch.toLowerCase()] % o.length].rings, sc: CH / XH * 0.92, auto: true, from: ch.toLowerCase() };
  }
  if (isLower(ch) && state.instances[ch.toUpperCase()]) {
    const o = state.instances[ch.toUpperCase()];
    return { rings: o[state.choice[ch.toUpperCase()] % o.length].rings, sc: XH / CH, auto: true, from: ch.toUpperCase() };
  }
  if (DERIVED[ch]) return derivedSource(ch);
  return null;
}

// производный знак: копии контуров исходного знака, сдвинутые или растянутые (в единицах шрифта)
function derivedSource(ch) {
  const base = c => { const o = state.instances[c]; return o && o[state.choice[c] % o.length].rings; };
  const span = rings => { let lo = 1e9, hi = -1e9, bot = 1e9, top = -1e9; for (const r of rings) for (const [x, y] of r) { lo = Math.min(lo, x); hi = Math.max(hi, x); bot = Math.min(bot, y); top = Math.max(top, y); } return { lo, hi, bot, top, w: hi - lo }; };
  const move = (rings, dx, dy, kx = 1, x0 = 0) => rings.map(r => r.map(([x, y]) => [x0 + (x - x0) * kx + dx, y + dy]));
  const from = DERIVED[ch][0], a = base(from); if (!a) return null;
  const b = span(a);
  let rings;
  if ('"“”'.includes(ch)) rings = [...a, ...move(a, b.w + 70, 0)];
  else if ('‘’'.includes(ch)) rings = a;
  else if (ch === '—') rings = move(a, 0, 0, 2.3, b.lo);
  else if (ch === '–') rings = move(a, 0, 0, 1.5, b.lo);
  else if (ch === '…') rings = [...a, ...move(a, b.w + 90, 0), ...move(a, 2 * (b.w + 90), 0)];
  else if (ch === ';') {
    // верхняя точка двоеточия над запятой
    const colon = a, comma = base(','); if (!comma) return null;
    const top = colon.reduce((m, r) => (span([r]).top > span([m]).top ? r : m)), t = span([top]), c = span(comma);
    rings = [...comma, ...move([top], (c.lo + c.hi) / 2 - (t.lo + t.hi) / 2, 0)];
  }
  return { rings, sc: 1, auto: true, from };
}

// горизонтальный размах контура в полосе 0…top (точки на рёбрах берём с шагом, чтобы не пропустить длинные отрезки)
function bodyRange(rings, sc, top) {
  let lo = 1e9, hi = -1e9;
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * sc / 12));
    for (let t = 0; t <= steps; t++) {
      const x = (x1 + (x2 - x1) * t / steps) * sc, y = (y1 + (y2 - y1) * t / steps) * sc;
      if (y >= -0.04 * top && y <= 1.06 * top) { if (x < lo) lo = x; if (x > hi) hi = x; }
    }
  }
  return hi - lo > 40 ? [lo, hi] : null;
}

function makeGlyph(ch, src) {
  const pts = src.rings.flat().map(([x, y]) => [x * src.sc, y * src.sc]);
  // края и центр буквы считаем по её «телу» — от линии строки до высоты строчных (у заглавных — до их высоты).
  // Хвосты и крючки (y, g, j, f) могут заходить под соседей, как в настоящем почерке, и не раздвигают строку.
  const [minX, maxX] = bodyRange(src.rings, src.sc, isUpper(ch) ? CH : XH) || [Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0]))];
  const sb = PUNCT.has(ch) ? 34 : 46, dx = sb - minX;
  const path = new opentype.Path();
  for (const r of src.rings) {
    const p = r.map(([x, y]) => [x * src.sc + dx, y * src.sc]), n = p.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const s = mid(p[n - 1], p[0]);
    path.moveTo(s[0], s[1]);
    for (let i = 0; i < n; i++) { const m = mid(p[i], p[(i + 1) % n]); path.quadraticCurveTo(p[i][0], p[i][1], m[0], m[1]); }
    path.close();
  }
  const cp = ch.codePointAt(0);
  return new opentype.Glyph({ name: 'uni' + cp.toString(16).toUpperCase().padStart(4, '0'), unicode: cp, advanceWidth: Math.round(maxX - minX + 2 * sb), path });
}

function rebuild() {
  const name = ($('#fontName').value || 'My Handwriting').trim();
  const glyphs = [
    new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
    new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 300, path: new opentype.Path() }),
  ];
  let yMax = 800, yMin = -250;
  for (const ch of state.charset) {
    const src = glyphSource(ch); if (!src) continue;
    const g = makeGlyph(ch, src); glyphs.push(g);
    const bb = g.getBoundingBox(); yMax = Math.max(yMax, bb.y2 + 20); yMin = Math.min(yMin, bb.y1 - 20);
  }
  const year = new Date().getFullYear();
  state.font = new opentype.Font({
    familyName: name, styleName: 'Regular', unitsPerEm: UPM, ascender: Math.round(yMax), descender: Math.round(yMin), glyphs,
    designer: 'inkfont', manufacturer: 'inkfont', version: '1.0',
    copyright: `© ${year} the owner of this handwriting`, description: 'Handwriting font made with inkfont',
    license: 'The owner of this handwriting may use this font for any personal or commercial purpose.',
  });
  const fam = 'inkfont-' + Date.now();
  const face = new FontFace(fam, state.font.toArrayBuffer());
  face.load().then(f => {
    document.fonts.add(f);
    if (state.previewFamily) for (const old of document.fonts) if (old.family === state.previewFamily) document.fonts.delete(old);
    state.previewFamily = fam;
    document.documentElement.style.setProperty('--userfont', `'${fam}'`);
    $('#previewText').style.fontFamily = `'${fam}', -apple-system, sans-serif`;
    fitPreview();
    renderGrid(fam);
  });
}

// плитка: буква из готового шрифта на общей линии строки + линия высоты строчных и края буквы (ширина знака)
function drawTile(cv, ch) {
  const g = state.font.charToGlyph(ch), S = 96, dpr = window.devicePixelRatio || 1;
  cv.width = cv.height = S * dpr;   // размер на экране задаёт CSS (на всю плитку)
  const x = cv.getContext('2d'); x.scale(dpr, dpr);
  const top = 1080, bot = -620, k = (S - 8) / (top - bot), base = 4 + top * k;
  const adv = g.advanceWidth * k, ox = (S - adv) / 2;
  x.lineWidth = 1;
  x.strokeStyle = 'rgba(63,90,44,.45)'; x.beginPath(); x.moveTo(0, Math.round(base) + .5); x.lineTo(S, Math.round(base) + .5); x.stroke();
  x.strokeStyle = 'rgba(27,29,24,.12)'; x.setLineDash([2, 3]);
  const xh = Math.round(base - (isUpper(ch) ? CH : XH) * k) + .5;
  x.beginPath(); x.moveTo(0, xh); x.lineTo(S, xh); x.stroke();
  x.beginPath(); x.moveTo(Math.round(ox) + .5, 0); x.lineTo(Math.round(ox) + .5, S); x.moveTo(Math.round(ox + adv) - .5, 0); x.lineTo(Math.round(ox + adv) - .5, S); x.stroke();
  x.setLineDash([]);
  const path = g.getPath(ox, base, UPM * k); path.fill = '#1b1d18'; path.draw(x);
}

function renderGrid(fam) {
  const grid = $('#grid'); grid.innerHTML = '';
  for (const ch of state.charset) {
    const src = glyphSource(ch), tile = document.createElement('div');
    tile.className = 'tile' + (!src ? ' miss' : src.auto ? ' auto' : '');
    tile.innerHTML = `<span class="k"></span><span class="g"></span><span class="n"></span>`;
    tile.querySelector('.k').textContent = ch;
    if (src) { const cv = document.createElement('canvas'); cv.className = 'gc'; tile.querySelector('.g').replaceWith(cv); drawTile(cv, ch); }
    else tile.querySelector('.g').textContent = ch;
    if (src && src.count > 1) tile.querySelector('.n').textContent = `${(state.choice[ch] % src.count) + 1}/${src.count}`;
    if (src) tile.onclick = () => openEditor(src.from, ch);
    else tile.title = t('missingTile');
    grid.appendChild(tile);
  }
}

/* ---------- Шаг 4 ---------- */
// поле «Попробуй»: высота растёт по тексту, клик в любом месте рамки ставит курсор
const preview = $('#previewText');
function fitPreview() { preview.style.height = 'auto'; preview.style.height = preview.scrollHeight + 'px'; }
preview.addEventListener('input', fitPreview);
preview.addEventListener('focus', () => clearInterval(typing));
$('.preview').addEventListener('mousedown', e => { if (e.target !== preview) { e.preventDefault(); preview.focus(); preview.setSelectionRange(preview.value.length, preview.value.length); } });
$('#size').oninput = e => { preview.style.fontSize = e.target.value + 'px'; fitPreview(); };
$('#track').oninput = e => { preview.style.letterSpacing = (e.target.value / 1000) + 'em'; fitPreview(); };
$('#fontName').onchange = () => state.font && rebuild();
$('#buyBtn').onclick = () => {
  if (!state.font) return;
  if (CONFIG.paymentLink) { location.href = CONFIG.paymentLink; return; }
  state.font.download(($('#fontName').value || 'MyHandwriting').replace(/\s+/g, '') + '-Regular.otf');
};

// для тестов и записи роликов
window.inkfont = { state, runDemo, setScript, process };

// смена языка: статус, плитки и текст-заготовка «Свой текст»
langHooks.push(() => {
  if (state.status) setStatus(state.status.key, state.status.cls, state.status.vars);
  if (state.previewFamily) renderGrid(state.previewFamily);
  if (state.script === 'own' && !expectedEl.dataset.own) { expectedEl.value = t('ownText'); autosize(); }
});
