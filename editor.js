/* Окно ручной правки буквы: фото вокруг буквы, две «косые» границы (по наклону почерка), превью. */
const ed = { el: $('#editor'), cv: $('#edCanvas'), gl: $('#edGlyph') };

function openEditor(ch, shownAs) {
  const list = state.instances[ch]; if (!list || !list.length) return;
  ed.ch = ch; ed.idx = state.choice[ch] % list.length;
  $('#edChar').textContent = ch;
  $('#edSub').textContent = shownAs !== ch
    ? `«${shownAs}» нет на фото — она построена из «${ch}». Правка изменит обе.`
    : list.length > 1 ? `На фото ${list.length} варианта этой буквы — выбери лучший.` : 'На фото один вариант этой буквы.';
  ed.el.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  loadVariant();
}
function closeEditor() { ed.el.classList.add('hidden'); document.body.style.overflow = ''; }

function loadVariant() {
  const list = state.instances[ed.ch], inst = list[ed.idx], it = inst.item;
  ed.L = state.analysis.lines[it.line];
  ed.it = it;
  if (!it.orig) it.orig = sxRange(it.px, ed.L);
  [ed.a, ed.b] = sxRange(it.px, ed.L);
  ed.pool = linePool(it, ed.L);
  // кадр: буква плюс соседи по бокам, по высоте — вся строка с выносными
  const L = ed.L, m = 1.3 * L.medH, W = state.W, H = state.photo.height, mid = L.centerAt(it.cx);
  ed.R = {
    x0: Math.max(0, Math.floor(it.box.x0 - m)), x1: Math.min(W - 1, Math.ceil(it.box.x1 + m)),
    y0: Math.max(0, Math.floor(Math.min(it.box.y0, mid - 1.2 * L.medH) - 0.2 * L.medH)),
    y1: Math.min(H - 1, Math.ceil(Math.max(it.box.y1, mid + 1.2 * L.medH))),
  };
  $('#edVar').textContent = `вариант ${ed.idx + 1} из ${list.length}`;
  $('#edPrev').disabled = $('#edNext').disabled = list.length < 2;
  $('#edDrop').disabled = list.length < 2;
  draw();
}

function draw() {
  const R = ed.R, rw = R.x1 - R.x0 + 1, rh = R.y1 - R.y0 + 1;
  const cssW = Math.min(ed.cv.parentElement.clientWidth - 20, 640), k = cssW / rw, cssH = Math.min(rh * k, 420);
  const kk = Math.min(k, cssH / rh), dpr = window.devicePixelRatio || 1;
  ed.k = kk;
  ed.cv.style.width = rw * kk + 'px'; ed.cv.style.height = rh * kk + 'px';
  ed.cv.width = Math.round(rw * kk * dpr); ed.cv.height = Math.round(rh * kk * dpr);
  const x = ed.cv.getContext('2d');
  x.setTransform(dpr * kk, 0, 0, dpr * kk, -R.x0 * dpr * kk, -R.y0 * dpr * kk);
  x.fillStyle = '#fff'; x.fillRect(R.x0, R.y0, rw, rh);
  x.globalAlpha = 0.28; x.drawImage(state.photo, 0, 0); x.globalAlpha = 1;

  // чернила: тёмным — что попадёт в шрифт, серым — соседи
  const W = state.W, L = ed.L, img = new ImageData(rw, rh), sel = [];
  for (const c of ed.pool) for (const p of c.px) {
    const px = p % W, py = p / W | 0;
    if (px < R.x0 || px > R.x1 || py < R.y0 || py > R.y1) continue;
    const s = L.shx(p), on = s >= ed.a && s <= ed.b, o = 4 * ((py - R.y0) * rw + (px - R.x0));
    if (on) sel.push(p);
    img.data.set(on ? [11, 31, 75, 255] : [178, 186, 206, 255], o);
  }
  const off = document.createElement('canvas'); off.width = rw; off.height = rh; off.getContext('2d').putImageData(img, 0, 0);
  x.imageSmoothingEnabled = false; x.drawImage(off, R.x0, R.y0);

  // границы: косые линии с наклоном почерка, ручка внизу
  const lx = (s, y) => s - (y - L.baseCy) * L.t;
  for (const s of [ed.a, ed.b]) {
    x.strokeStyle = '#1d3a8a'; x.lineWidth = 2 / kk; x.setLineDash([6 / kk, 5 / kk]);
    x.beginPath(); x.moveTo(lx(s, R.y0), R.y0); x.lineTo(lx(s, R.y1), R.y1); x.stroke(); x.setLineDash([]);
    const hy = R.y1 - 16 / kk;
    x.fillStyle = '#1d3a8a'; x.beginPath(); x.arc(lx(s, hy), hy, 11 / kk, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.fillRect(lx(s, hy) - 3.5 / kk, hy - 1 / kk, 2 / kk, 2 / kk); x.fillRect(lx(s, hy) + 1.5 / kk, hy - 1 / kk, 2 / kk, 2 / kk);
  }
  drawGlyph(sel);
}

// живое превью: выбранные пиксели, вписанные в квадрат
function drawGlyph(px) {
  const c = ed.gl, x = c.getContext('2d'), S = 96, dpr = window.devicePixelRatio || 1;
  c.width = S * dpr; c.height = S * dpr; c.style.width = c.style.height = S + 'px';
  x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
  if (!px.length) { x.fillStyle = '#b4541a'; x.font = '13px -apple-system, sans-serif'; x.fillText('пусто', 30, 52); return; }
  const W = state.W; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const p of px) { const a = p % W, b = p / W | 0; if (a < x0) x0 = a; if (a > x1) x1 = a; if (b < y0) y0 = b; if (b > y1) y1 = b; }
  const sc = (S - 16) / Math.max(x1 - x0 + 1, y1 - y0 + 1), ox = (S - (x1 - x0 + 1) * sc) / 2, oy = (S - (y1 - y0 + 1) * sc) / 2;
  x.fillStyle = '#0b1f4b';
  for (const p of px) x.fillRect(ox + (p % W - x0) * sc, oy + ((p / W | 0) - y0) * sc, Math.max(1, sc), Math.max(1, sc));
}

/* перетаскивание ближайшей границы */
function toSheared(ev) {
  const r = ed.cv.getBoundingClientRect();
  const ix = ed.R.x0 + (ev.clientX - r.left) / ed.k, iy = ed.R.y0 + (ev.clientY - r.top) / ed.k;
  return ix + (iy - ed.L.baseCy) * ed.L.t;
}
ed.cv.addEventListener('pointerdown', ev => {
  const s = toSheared(ev);
  ed.drag = Math.abs(s - ed.a) <= Math.abs(s - ed.b) ? 'a' : 'b';
  ed.cv.setPointerCapture(ev.pointerId); move(s);
});
ed.cv.addEventListener('pointermove', ev => ed.drag && move(toSheared(ev)));
ed.cv.addEventListener('pointerup', () => ed.drag = null);
ed.cv.addEventListener('pointercancel', () => ed.drag = null);
function move(s) {
  if (ed.drag === 'a') ed.a = Math.min(s, ed.b - 2); else ed.b = Math.max(s, ed.a + 2);
  draw();
}

$('#edPrev').onclick = () => { const n = state.instances[ed.ch].length; ed.idx = (ed.idx - 1 + n) % n; loadVariant(); };
$('#edNext').onclick = () => { ed.idx = (ed.idx + 1) % state.instances[ed.ch].length; loadVariant(); };
$('#edReset').onclick = () => { [ed.a, ed.b] = ed.it.orig; draw(); };
$('#edClose').onclick = closeEditor;
ed.el.addEventListener('click', ev => ev.target === ed.el && closeEditor());
document.addEventListener('keydown', ev => {
  if (ed.el.classList.contains('hidden')) return;
  if (ev.key === 'Escape') closeEditor();
});
$('#edDrop').onclick = () => {
  const list = state.instances[ed.ch]; list.splice(ed.idx, 1);
  state.choice[ed.ch] = 0; rebuild(); closeEditor();
};
$('#edApply').onclick = () => {
  const n = recut(ed.it, ed.a, ed.b, ed.L, state.W);
  const inst = n && traceItem(n, ed.L, state.W);
  if (!inst) { $('#edSub').textContent = 'Между границами нет чернил — раздвинь их.'; return; }
  n.orig = ed.it.orig; inst.item = n;
  state.instances[ed.ch][ed.idx] = inst;
  state.choice[ed.ch] = ed.idx;
  rebuild(); closeEditor();
};
window.addEventListener('resize', () => !ed.el.classList.contains('hidden') && draw());
