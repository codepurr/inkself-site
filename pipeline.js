/* inkfont pipeline: фото листа → список букв с пикселями.
   1. Маска чернил по контрасту с окрестностью (любой цвет ручки, без просвечивания).
   2. Блок текста: оставляем самую плотную группу пятен — цветочки, лента, ручка отпадают.
   3. Строки отслеживаем слева направо с учётом наклона строки.
   4. Наклон почерка (курсив) оцениваем на каждой строке, дальше режем «косыми» колонками.
   5. Сопоставляем слова, внутри слова — буквы; ширина слова задаёт масштаб.
      Слитный кусок на k букв режем по самым тонким местам. */

const median = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const pct = (a, q) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const isUpper = c => c !== c.toLowerCase() && c === c.toUpperCase();
const isLower = c => c !== c.toUpperCase() && c === c.toLowerCase();
const PUNCT = new Set('.,!?:-;');
const SMALL_PUNCT = new Set('.,:;-');

// Примерная ширина знака в долях «средней буквы» — нужна, чтобы резать слитные слова
function cw(c) {
  if ('.,:;!\''.includes(c)) return 0.25;
  if (c === '?') return 0.5;
  if (c === '-') return 0.45;
  if ('il'.includes(c)) return 0.32;
  if (c === 'j') return 0.4;
  if ('tfr'.includes(c)) return 0.48;
  if ('mwшщжюы'.includes(c)) return 0.98;
  if ('IÏ'.includes(c)) return 0.38;
  if (c === 'J') return 0.58;
  if ('MWЖШЩЮЫ'.includes(c)) return 1.08;
  if (isUpper(c)) return 0.8;
  return 0.64;
}

/* Поиск пятен и строк — один раз на фото; сопоставление с текстом — отдельно (alignText), чтобы проверить несколько шаблонов */
function segment(data, W, H) {
  const v = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) v[i] = Math.min(data[4 * i], data[4 * i + 1], data[4 * i + 2]);
  const { m: mask, d: contrast, hi } = inkMask(v, W, H);
  let comps = components(mask, W, H);
  // сила чернил пятна: средний контраст его пикселей с окрестностью
  for (const c of comps) { let s = 0, n = 0; for (let i = 0; i < c.px.length; i += 3) { s += contrast[c.px[i]]; n++; } c.ink = s / n / hi; }
  const minArea = Math.max(6, Math.round(W * H * 0.000004));
  // у края кадра выкидываем только крупное (тени, край листа, предметы): буква может касаться края
  const edge = c => c.x0 <= 1 || c.y0 <= 1 || c.x1 >= W - 2 || c.y1 >= H - 2;
  comps = comps.filter(c => c.area >= minArea && c.w < W * 0.6 && c.h < H * 0.35 && !(edge(c) && (c.w > W * 0.12 || c.h > H * 0.12)));
  if (comps.length < 5) return null;
  let medH = pct(comps.filter(c => c.area >= 3 * minArea).map(c => c.h), 0.6);
  // край листа, линейки, крупные рисунки
  comps = comps.filter(c => !(c.h > 4.5 * medH) && !(c.h > 2 * medH && c.h > 9 * c.w) && !(c.w > 2 * medH && c.w > 12 * c.h));
  // тени, край страниц, цветные предметы светлее настоящих чернил: отсекаем пятна слабее 75% от типичных
  const medInk = median(comps.filter(c => c.area >= 3 * minArea).map(c => c.ink));
  comps = comps.filter(c => c.ink >= 0.75 * medInk);
  comps = textBlock(comps, medH);
  medH = pct(comps.filter(c => c.area >= 3 * minArea).map(c => c.h), 0.6);
  const lines = buildLines(comps, medH, W);
  const obs = [];
  lines.forEach((L, li) => {
    estimateSlant(L, W);
    L.clusters = clusterLine(L, W);
    for (const word of splitWords(L.clusters, L.medH)) obs.push({ clusters: word, line: li });
  });
  return { lines, obs, comps };
}

function analyze(data, W, H, text) {
  const seg = segment(data, W, H);
  return seg && alignText(seg, text, W);
}

function alignText(seg, text, W) {
  const { items, total, cost } = alignChars(seg.obs, text, seg.lines, W);
  computeLineMetrics(seg.lines, items);
  return { items, lines: seg.lines, comps: seg.comps, total, fit: fitScore(items, total, cost) };
}

/* Насколько текст подходит к фото. Неверный текст всё равно «натягивается» на пятна,
   но тогда под одной буквой оказываются непохожие друг на друга пятна, и приходится много резать. */
function fitScore(items, total, cost) {
  const by = new Map();
  for (const it of items) (by.get(it.char) || by.set(it.char, []).get(it.char)).push(it.thumb);
  let sum = 0, pairs = 0;
  for (const th of by.values()) for (let a = 0; a < th.length; a++) for (let b = a + 1; b < th.length; b++) { sum += thumbDist(th[a], th[b]); pairs++; }
  const split = items.filter(i => i.split).length / Math.max(1, total);
  const found = items.length / Math.max(1, total);
  const unlike = pairs ? sum / pairs : 0.5;
  return { cost: cost / Math.max(1, total), split, found, unlike, score: unlike + 0.6 * split + 0.08 * cost / Math.max(1, total) + 0.8 * (1 - found) };
}
function thumbDist(a, b) { let x = 0, u = 0; for (let i = 0; i < a.length; i++) { x += a[i] !== b[i]; u += a[i] | b[i]; } return u ? x / u : 0; }

/* Маска: пиксель темнее среднего по окрестности на заметную долю от контраста самих чернил */
function inkMask(v, W, H) {
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) { row += v[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; }
  }
  const half = Math.max(10, Math.round(Math.max(W, H) / 30));
  const d = new Float32Array(W * H), hist = new Uint32Array(256);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(H - 1, y + half);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - half), x1 = Math.min(W - 1, x + half);
      const n = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = I[(y1 + 1) * (W + 1) + x1 + 1] - I[y0 * (W + 1) + x1 + 1] - I[(y1 + 1) * (W + 1) + x0] + I[y0 * (W + 1) + x0];
      const c = sum / n - v[y * W + x]; d[y * W + x] = c;
      if (c > 8) hist[Math.min(255, c | 0)]++;
    }
  }
  let total = 0; for (const h of hist) total += h;
  let acc = 0, hi = 60;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * 0.995) { hi = i; break; } }
  const thr = Math.max(18, 0.38 * hi);
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (d[i] > thr) m[i] = 1;
  return { m, d, hi };
}

function components(m, W, H) {
  const lab = new Int32Array(W * H), out = [], st = [];
  for (let s = 0; s < W * H; s++) {
    if (!m[s] || lab[s]) continue;
    const id = out.length + 1, px = [];
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    st.push(s); lab[s] = id;
    while (st.length) {
      const p = st.pop(); px.push(p);
      const x = p % W, y = (p / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (m[q] && !lab[q]) { lab[q] = id; st.push(q); }
      }
    }
    out.push({ px, x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, area: px.length, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
  }
  return out;
}

/* Блок текста: пятна, стоящие близко, объединяем; оставляем крупные группы */
function textBlock(comps, medH) {
  const n = comps.length, par = comps.map((_, i) => i);
  const find = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  const s = comps.map((c, i) => i).sort((a, b) => comps[a].x0 - comps[b].x0);
  const tx = 1.3 * medH, ty = 0.9 * medH;
  for (let a = 0; a < n; a++) {
    const A = comps[s[a]];
    for (let b = a + 1; b < n; b++) {
      const B = comps[s[b]];
      if (B.x0 > A.x1 + tx) break;
      const dx = Math.max(0, B.x0 - A.x1, A.x0 - B.x1), dy = Math.max(0, B.y0 - A.y1, A.y0 - B.y1);
      if (dx < tx && dy < ty) par[find(s[a])] = find(s[b]);
    }
  }
  const size = new Map();
  comps.forEach((c, i) => { if (c.h >= 0.4 * medH) size.set(find(i), (size.get(find(i)) || 0) + 1); });
  const max = Math.max(...size.values());
  const keep = new Set([...size].filter(([, n]) => n >= Math.max(3, 0.3 * max)).map(([r]) => r));
  // короткая строка, отставленная от основного блока («DOG», «wow!»), — тоже текст,
  // если в ней 2+ пятна высотой с букву, стоящие в одну линию под/над блоком; одиночные рисунки отпадают
  const box = { x0: 1e9, x1: -1, y0: 1e9, y1: -1 };
  comps.forEach((c, i) => { if (keep.has(find(i))) { box.x0 = Math.min(box.x0, c.x0); box.x1 = Math.max(box.x1, c.x1); box.y0 = Math.min(box.y0, c.y0); box.y1 = Math.max(box.y1, c.y1); } });
  const groups = new Map();
  comps.forEach((c, i) => { const r = find(i); if (!keep.has(r)) (groups.get(r) || groups.set(r, []).get(r)).push(c); });
  for (const [r, g] of groups) {
    const big = g.filter(c => c.h >= 0.4 * medH);
    if (big.length < 2) continue;
    const mh = median(big.map(c => c.h)), y0 = Math.min(...g.map(c => c.y0)), y1 = Math.max(...g.map(c => c.y1));
    const x0 = Math.min(...g.map(c => c.x0)), x1 = Math.max(...g.map(c => c.x1));
    const dy = Math.max(0, box.y0 - y1, y0 - box.y1);
    if (mh > 0.5 * medH && mh < 1.8 * medH && y1 - y0 < 2.2 * medH && dy < 4 * medH && x1 > box.x0 && x0 < box.x1) keep.add(r);
  }
  return comps.filter((c, i) => keep.has(find(i)));
}

/* Строки: берём «сердцевину» каждой буквы (без выносных), размазываем по горизонтали
   и ищем связные полосы — так g, y, h не сцепляют соседние строки, а наклонные строки не рвутся. */
function buildLines(comps, medH, W) {
  const big = comps.filter(c => c.h >= 0.45 * medH), small = comps.filter(c => c.h < 0.45 * medH);
  const cs = Math.max(2, Math.round(medH / 6));
  const gx0 = Math.min(...big.map(c => c.x0)), gy0 = Math.min(...big.map(c => c.y0));
  const gw = Math.ceil((Math.max(...big.map(c => c.x1)) - gx0 + 1) / cs) + 1, gh = Math.ceil((Math.max(...big.map(c => c.y1)) - gy0 + 1) / cs) + 1;
  const grid = new Uint8Array(gw * gh);
  // сердцевина буквы = самые плотные по чернилам ряды (зона строчных), а не середина рамки
  for (const c of big) {
    const rows = new Uint32Array(c.h);
    for (const p of c.px) rows[((p / W) | 0) - c.y0]++;
    const mx = Math.max(...rows); let a = -1, b = -1;
    rows.forEach((v, i) => { if (v >= 0.45 * mx) { if (a < 0) a = i; b = i; } });
    const mid = (a + b) / 2, half = Math.min((b - a) / 2, 0.3 * medH);
    c.core0 = c.y0 + mid - half; c.core1 = c.y0 + mid + half;
  }
  const core = c => [Math.floor((c.core0 - gy0) / cs), Math.floor((c.core1 - gy0) / cs)];
  for (const c of big) {
    const [r0, r1] = core(c);
    for (let r = r0; r <= r1; r++) for (let q = Math.floor((c.x0 - gx0) / cs); q <= Math.floor((c.x1 - gx0) / cs); q++) grid[r * gw + q] = 1;
  }
  const maxGap = Math.round(1.8 * medH / cs);
  for (let r = 0; r < gh; r++) {
    let last = -1;
    for (let q = 0; q < gw; q++) if (grid[r * gw + q] === 1) {
      if (last >= 0 && q - last - 1 <= maxGap) for (let t = last + 1; t < q; t++) grid[r * gw + t] = 2;
      last = q;
    }
  }
  const lab = new Int32Array(gw * gh); let nl = 0; const st = [];
  for (let s0 = 0; s0 < gw * gh; s0++) {
    if (!grid[s0] || lab[s0]) continue;
    nl++; lab[s0] = nl; st.push(s0);
    while (st.length) {
      const p = st.pop(), x = p % gw, y = p / gw | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const o = ny * gw + nx; if (grid[o] && !lab[o]) { lab[o] = nl; st.push(o); }
      }
    }
  }
  const byLab = new Map();
  for (const c of big) {
    const [r0, r1] = core(c), r = (r0 + r1) >> 1, q = Math.floor((c.cx - gx0) / cs);
    const l = lab[r * gw + q] || lab[r0 * gw + Math.floor((c.x0 - gx0) / cs)];
    if (!byLab.has(l)) byLab.set(l, { big: [], small: [], slope: 0 });
    byLab.get(l).big.push(c);
  }
  let lines = [...byLab.values()];
  const fit = L => {
    L.big.sort((a, b) => a.x0 - b.x0);
    const cy = c => (c.y0 + c.y1) / 2, sl = [], r = L.big;
    for (let a = 0; a < r.length; a++) for (let b = a + 1; b < r.length; b++) {
      const dx = r[b].cx - r[a].cx; if (Math.abs(dx) > medH) sl.push((cy(r[b]) - cy(r[a])) / dx);
    }
    L.slope = sl.length >= 3 ? Math.max(-0.2, Math.min(0.2, median(sl))) : 0;
    L.x0 = r[0].x0; L.x1 = Math.max(...r.map(c => c.x1));
    L.baseCx = r.reduce((a, c) => a + c.cx, 0) / r.length;
    L.baseCy = median(r.map(c => c.cy - L.slope * (c.cx - (r.reduce((a, k) => a + k.cx, 0) / r.length))));
    L.centerAt = x => L.baseCy + L.slope * (x - L.baseCx);
    r.forEach(c => c._line = L);
  };
  lines.forEach(fit);
  // «строки» из 1–2 букв, стоящие внутри другой строки (выносная g, y, буква «6»), присоединяем к ней
  for (const S of [...lines].sort((a, b) => a.big.length - b.big.length)) {
    if (S.big.length > 2 || !lines.includes(S)) continue;
    let best = null, bd = 0.7 * medH;
    for (const L of lines) {
      if (L === S || L.big.length <= S.big.length) continue;
      const ok = S.big.every(c => c.cx > L.x0 - 1.5 * medH && c.cx < L.x1 + 1.5 * medH);
      const d = Math.max(...S.big.map(c => Math.abs(c.cy - L.centerAt(c.cx))));
      if (ok && d < bd) { bd = d; best = L; }
    }
    if (best) { best.big.push(...S.big); fit(best); lines = lines.filter(x => x !== S); }
  }
  // высота строки рядом с точкой x: середина «сердцевины» трёх ближайших букв (без выносных и без продления наклона)
  const localCy = (L, x) => median([...L.big].sort((a, b) => Math.abs(a.cx - x) - Math.abs(b.cx - x)).slice(0, 3).map(c => (c.core0 + c.core1) / 2));
  // куски одной строки, разорванные большим пробелом (стёртое слово, широкий отступ), склеиваем,
  // если на стыке они стоят на одной высоте
  for (let merged = true; merged;) {
    merged = false;
    lines.sort((a, b) => a.x0 - b.x0);
    for (const A of lines) for (const B of lines) {
      if (A === B || merged || B.x0 < A.x1 - 0.3 * medH || B.x0 - A.x1 > 10 * medH) continue;
      if (Math.abs(localCy(A, A.x1) - localCy(B, B.x0)) > 0.4 * medH) continue;
      A.big.push(...B.big); fit(A); lines = lines.filter(x => x !== B); merged = true;
    }
  }
  for (const s of small) {
    let best = null, bd = 1e9;
    for (const b of big) {
      const dx = Math.max(0, b.x0 - s.x1, s.x0 - b.x1), dy = Math.max(0, b.y0 - s.y1, s.y0 - b.y1);
      const d = dx + 1.5 * dy; if (d < bd) { bd = d; best = b; }
    }
    if (best && bd < 2.5 * medH) best._line.small.push(s);
  }
  // высота строки — 75-й перцентиль: обрывки и точки её не занижают; слишком высокие пятна (край книги) — прочь
  for (const L of lines) {
    L.medH = pct(L.big.map(c => c.h), 0.75);
    const keep = L.big.filter(c => c.h <= 2.6 * L.medH);
    if (keep.length) L.big = keep;
  }
  // порядок строк: сравниваем высоту букв там, где строки ближе всего по горизонтали
  return lines.sort((a, b) => { const xm = (Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2; return localCy(a, xm) - localCy(b, xm); });
}

/* Наклон почерка: угол сдвига, при котором вертикальная проекция самая «острая» */
function estimateSlant(L, W) {
  const px = [];
  for (const c of L.big) for (let i = 0; i < c.px.length; i += 2) px.push(c.px[i]);
  let best = 0, bs = -1;
  for (let deg = -12; deg <= 36; deg += 3) {
    const t = Math.tan(deg * Math.PI / 180), hist = new Map();
    for (const p of px) { const x = Math.round(p % W + ((p / W | 0) - L.baseCy) * t); hist.set(x, (hist.get(x) || 0) + 1); }
    let s = 0; for (const h of hist.values()) s += h * h;
    if (s > bs) { bs = s; best = t; }
  }
  L.t = best;
  L.shx = p => p % W + ((p / W | 0) - L.baseCy) * L.t;
  for (const c of [...L.big, ...L.small]) {
    let a = 1e9, b = -1e9;
    for (const p of c.px) { const x = L.shx(p); if (x < a) a = x; if (x > b) b = x; }
    c.sx0 = a; c.sx1 = b; c.sw = b - a + 1;
  }
}

/* Знаки внутри строки: крупные пятна + точки над/под ними (i, j, !, ?, ё, й) */
function clusterLine(L, W) {
  const lmh = L.medH, mk = comps => {
    const k = { comps, sx0: Math.min(...comps.map(c => c.sx0)), sx1: Math.max(...comps.map(c => c.sx1)),
      y0: Math.min(...comps.map(c => c.y0)), y1: Math.max(...comps.map(c => c.y1)) };
    k.sw = k.sx1 - k.sx0 + 1; k.h = k.y1 - k.y0 + 1; return k;
  };
  let cl = [...L.big].sort((a, b) => a.sx0 - b.sx0).map(c => mk([c]));
  for (let i = 0; i + 1 < cl.length;) {
    const a = cl[i], b = cl[i + 1], ov = Math.min(a.sx1, b.sx1) - Math.max(a.sx0, b.sx0);
    if (ov > 0.7 * Math.min(a.sw, b.sw)) cl.splice(i, 2, mk([...a.comps, ...b.comps])); else i++;
  }
  const loose = [];
  for (const s of [...L.small].sort((a, b) => a.sx0 - b.sx0)) {
    let done = false;
    for (const k of cl) {
      const ov = Math.min(k.sx1, s.sx1) - Math.max(k.sx0, s.sx0);
      if (ov < 0.5 * s.sw) continue;
      let top = 1e9, bot = -1;
      for (const c of k.comps) for (const p of c.px) {
        const x = L.shx(p); if (x < s.sx0 || x > s.sx1) continue;
        const y = p / W | 0; if (y < top) top = y; if (y > bot) bot = y;
      }
      if (bot < 0) continue;
      const tol = 0.12 * lmh, mid = L.centerAt(s.cx);
      const above = s.y1 <= top + tol && s.cy < mid && top - s.y1 < 1.1 * lmh;
      const below = s.y0 >= bot - tol && bot - top > 0.4 * lmh && s.y0 - bot < 0.8 * lmh && s.y1 < mid + 0.6 * lmh;
      if (above || below) { k.comps.push(s); Object.assign(k, mk(k.comps)); done = true; break; }
    }
    if (!done) loose.push(s);
  }
  const sc = [];
  for (const s of loose) {
    const last = sc[sc.length - 1];
    if (last) {
      const ov = Math.min(last.sx1, s.sx1) - Math.max(last.sx0, s.sx0);
      if (ov > 0.4 * Math.min(last.sw, s.sw)) { sc[sc.length - 1] = mk([...last.comps, s]); continue; }
    }
    sc.push(mk([s]));
  }
  return [...cl, ...sc].sort((a, b) => a.sx0 - b.sx0);
}

function splitWords(cl, lmh) {
  const words = []; let cur = [], right = -1e9;
  for (const k of cl) {
    if (cur.length && k.sx0 - right > 0.42 * lmh) { words.push(cur); cur = []; }
    cur.push(k); right = Math.max(right, k.sx1);
  }
  if (cur.length) words.push(cur);
  return words;
}

/* Сопоставление (DP по всему тексту сразу):
   пятно → 1..10 букв (слитное письмо), 2–3 пятна → 1 буква (ы, рваные штрихи), шум, пропуск.
   Ширину букв ждём по общему масштабу почерка строки; пробелы из текста — мягкая подсказка. */
function alignChars(obs, text, lines, W) {
  const words = text.split(/\s+/).filter(Boolean), chars = [], sp = [];
  words.forEach((w, wi) => [...w].forEach((c, ci) => { chars.push(c); sp.push(ci === 0 && wi > 0); }));
  let spanSum = 0;
  for (const o of obs) spanSum += (Math.max(...o.clusters.map(k => k.sx1)) - Math.min(...o.clusters.map(k => k.sx0)) + 1) / lines[o.line].medH;
  const rho = spanSum / chars.reduce((a, c) => a + cw(c), 0);
  lines.forEach(L => L.alpha = rho * L.medH);
  const cl = []; lines.forEach((L, li) => L.clusters.forEach(k => { k.line = li; cl.push(k); }));
  let res = dpChars(cl, chars, sp, lines);
  // второй проход: уточняем масштаб каждой строки по уже найденным буквам
  lines.forEach((L, li) => {
    const gs = res.groups.filter(g => g.cl[0].line === li);
    const w = gs.reduce((a, g) => a + g.w, 0), s = gs.reduce((a, g) => a + g.chars.reduce((b, c) => b + cw(c), 0), 0);
    if (s > 3) L.alpha = Math.sqrt(L.alpha * (w / s));
  });
  res = dpChars(cl, chars, sp, lines);
  const items = [];
  for (const g of res.groups) {
    const L = lines[g.cl[0].line];
    if (g.chars.length === 1) {
      const px = g.cl.flatMap(k => k.comps.flatMap(c => c.px));
      items.push(mkItem(g.chars[0], px, g.cl[0].line, g.cost + (g.cl.length > 1 ? 0.3 : 0), false, W));
    } else {
      splitCluster(g.cl[0], g.chars, L, W).forEach((px, t) => px.length && items.push(mkItem(g.chars[t], px, g.cl[0].line, 1 + g.cost, true, W)));
    }
  }
  return { items, total: chars.length, cost: res.cost };
}

function dpChars(cl, chars, sp, lines) {
  const m = cl.length, n = chars.length, INF = 1e18, N1 = n + 1;
  const pre = [0]; chars.forEach((c, i) => pre.push(pre[i] + cw(c)));
  const spc = [0]; sp.forEach((s, i) => spc.push(spc[i] + (s ? 1 : 0)));
  const dp = new Float64Array((m + 1) * N1).fill(INF), bp = new Int8Array((m + 1) * N1), bq = new Int8Array((m + 1) * N1), bc = new Float32Array((m + 1) * N1);
  dp[0] = 0;
  const shape = (k, j, cnt, lmh) => {
    if (cnt > 1) return k.h < 0.3 * lmh ? 2 : 0;
    const ch = chars[j];
    // двоеточие и точка с запятой — две отметки одна над другой, по высоте почти как строчная буква
    if (ch === ':' || ch === ';') return k.h > 0.95 * lmh ? 2 : 0;
    if (SMALL_PUNCT.has(ch)) return (k.h > 0.6 * lmh ? 2 : 0) + (ch === '-' && k.h > 0.3 * lmh ? 1.2 : 0);
    if (!PUNCT.has(ch) && k.h < 0.28 * lmh) return 2;
    return 0;
  };
  // зазор перед пятном i против ожидаемого пробела перед буквой j
  const ctx = (i, j) => {
    if (i === 0 || j === 0) return 0;
    const a = cl[i - 1], b = cl[i];
    if (a.line !== b.line) return sp[j] ? 0 : 1.2;
    const g = (b.sx0 - a.sx1) / lines[b.line].alpha;
    if (sp[j] && g < 0.12) return 1.0;
    if (!sp[j] && g > 0.8) return 0.8;
    return 0;
  };
  const upd = (i, j, v, p, q, c) => { const o = i * N1 + j; if (v < dp[o]) { dp[o] = v; bp[o] = p; bq[o] = q; bc[o] = c; } };
  for (let i = 0; i <= m; i++) for (let j = 0; j <= n; j++) {
    const v = dp[i * N1 + j]; if (v >= INF) continue;
    if (i < m && j < n) {
      const L = lines[cl[i].line], al = L.alpha, u = 0.6 * al, c0 = ctx(i, j);
      for (let k = 1; k <= Math.min(10, n - j); k++) {
        const inside = spc[j + k] - spc[j + 1];
        const dev = (cl[i].sw - al * (pre[j + k] - pre[j])) / u;
        const c = Math.min(4, 0.5 * dev * dev) + (k > 1 ? 0.35 + 0.1 * (k - 1) : 0) + 2.5 * inside + shape(cl[i], j, k, L.medH) + c0;
        upd(i + 1, j + k, v + c, 1, k, c);
      }
      for (let p = 2; p <= 3 && i + p <= m; p++) {
        if (cl[i + p - 1].line !== cl[i].line) break;
        let w = 0, gapPen = 0;
        for (let t = i; t < i + p; t++) {
          w = Math.max(w, cl[t].sx1);
          if (t > i && cl[t].sx0 - cl[t - 1].sx1 > 0.6 * al) gapPen += 1;
          // мелкая точка ниже строки — скорее грязь, чем часть буквы
          if (cl[t].h < 0.35 * L.medH && (cl[t].y0 + cl[t].y1) / 2 > L.centerAt((cl[t].sx0 + cl[t].sx1) / 2) + 0.8 * L.medH) gapPen += 1.5;
        }
        const dev = (w - cl[i].sx0 + 1 - al * cw(chars[j])) / u;
        const c = Math.min(4, 0.5 * dev * dev) + 0.4 * (p - 1) + gapPen + c0;
        upd(i + p, j + 1, v + c, p, 1, c);
      }
    }
    if (i < m) upd(i + 1, j, v + (cl[i].h < 0.35 * lines[cl[i].line].medH ? 0.6 : 2.0), 1, 0, 0);
    if (j < n) upd(i, j + 1, v + 2.2, 0, 1, 0);
  }
  const groups = []; let i = m, j = n;
  while (i > 0 || j > 0) {
    const o = i * N1 + j, p = bp[o], q = bq[o];
    if (p && q) { const g = cl.slice(i - p, i); groups.push({ cl: g, chars: chars.slice(j - q, j), cost: bc[o], w: Math.max(...g.map(k => k.sx1)) - g[0].sx0 + 1 }); }
    i -= p; j -= q;
  }
  return { cost: dp[m * N1 + n], groups: groups.reverse() };
}

function mkItem(char, px, line, q, split, W) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const p of px) { const x = p % W, y = p / W | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  // миниатюра 20×20 (с сохранением пропорций) — чтобы сравнивать варианты одной буквы
  const S = 20, sc = (S - 1) / Math.max(x1 - x0, y1 - y0, 1), thumb = new Uint8Array(S * S);
  for (const p of px) thumb[Math.round(((p / W | 0) - y0) * sc) * S + Math.round((p % W - x0) * sc)] = 1;
  return { char, px, line, q, split, box: { x0, y0, x1, y1 }, cx: (x0 + x1) / 2, thumb };
}

/* Режем слитный кусок на k букв: «косые» колонки по наклону почерка, разрез — в самом тонком месте рядом с ожидаемым */
function splitCluster(k, chars, L, W) {
  const px = k.comps.flatMap(c => c.px), sx = px.map(L.shx);
  const a = Math.min(...sx), w = Math.ceil(Math.max(...sx) - a) + 1;
  // цена разреза в колонке: сколько чернил + сколько штрихов её пересекает (соединение = один тонкий штрих)
  const cols = Array.from({ length: w }, () => []);
  px.forEach((p, i) => cols[Math.min(w - 1, Math.floor(sx[i] - a))].push(p / W | 0));
  const prof = new Float32Array(w);
  cols.forEach((ys, i) => {
    if (!ys.length) return;
    ys.sort((u, v) => u - v);
    let runs = 1; for (let t = 1; t < ys.length; t++) if (ys[t] - ys[t - 1] > 2) runs++;
    prof[i] = ys.length + 6 * (runs - 1) * Math.sqrt(ys.length);
  });
  const sm = prof.map((_, i) => (prof[i - 2] || 0) + (prof[i - 1] || 0) * 2 + prof[i] * 3 + (prof[i + 1] || 0) * 2 + (prof[i + 2] || 0));
  const sumW = chars.reduce((s, c) => s + cw(c), 0), avg = w / chars.length;
  const cuts = []; let acc = 0, prev = 0;
  for (let t = 0; t < chars.length - 1; t++) {
    acc += cw(chars[t]);
    const e = acc / sumW * w;
    const lo = Math.max(prev + 0.25 * avg, e - 0.45 * avg), hi = Math.min(w - 0.25 * avg, e + 0.45 * avg);
    let best = Math.round(e), bv = 1e18;
    for (let x = Math.floor(lo); x <= Math.ceil(hi); x++) {
      const val = sm[x] * (1 + 0.6 * Math.abs(x - e) / avg);
      if (val < bv) { bv = val; best = x; }
    }
    cuts.push(best); prev = best;
  }
  const parts = chars.map(() => []);
  px.forEach((p, i) => { const x = sx[i] - a; let s = 0; while (s < cuts.length && x >= cuts[s]) s++; parts[s].push(p); });
  return parts;
}

/* Базовая линия строки — прямая по низам букв без выносных; масштаб — по высоте строчных или заглавных */
const X_LETTERS = new Set('acemnorsuvwxzавгежзиклмнопстхчшъыьэюя');
const DESC = new Set('gjpqyfрудфцщ,QДЦЩ');
const CAP_SKIP = new Set('QЙЁДЦЩJ');
function computeLineMetrics(lines, items) {
  lines.forEach(L => { L.pts = []; L.xh = []; L.cap = []; L.hs = []; });
  for (const it of items) {
    const L = lines[it.line], h = it.box.y1 - it.box.y0;
    L.hs.push(h);
    if (PUNCT.has(it.char)) continue;
    if (!DESC.has(it.char)) L.pts.push([it.cx, it.box.y1]);
    if (X_LETTERS.has(it.char)) L.xh.push(h);
    if (isUpper(it.char) && !CAP_SKIP.has(it.char)) L.cap.push(h);
  }
  for (const L of lines) {
    let a = median(L.pts.map(p => p[1])), b = 0;
    const fit = pts => {
      const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      let sxy = 0, sxx = 0; pts.forEach(p => { sxy += (p[0] - mx) * (p[1] - my); sxx += (p[0] - mx) ** 2; });
      b = sxx ? Math.max(-0.25, Math.min(0.25, sxy / sxx)) : 0; a = my - b * mx;
    };
    if (L.pts.length >= 3) {
      fit(L.pts);
      const good = L.pts.filter(p => Math.abs(p[1] - (a + b * p[0])) < 0.15 * L.medH);
      if (good.length >= 3) fit(good);
    }
    if (isNaN(a)) { a = Math.max(...L.big.map(c => c.y1)); b = 0; }
    L.baseAt = x => a + b * x;
    const XH = 500, CH = 720;
    if (L.xh.length >= 2) L.scale = XH / median(L.xh);
    else if (L.cap.length >= 2) L.scale = CH / median(L.cap);
    else L.scale = XH / (0.6 * (median(L.hs) || L.medH));
    L.refPx = XH / L.scale;
  }
}

/* Векторизация буквы */
function traceItem(it, L, W) {
  const b = it.box, pad = 2;
  const cw_ = b.x1 - b.x0 + 1 + 2 * pad, chh = b.y1 - b.y0 + 1 + 2 * pad;
  let mask = new Uint8Array(cw_ * chh);
  for (const p of it.px) mask[((p / W | 0) - b.y0 + pad) * cw_ + (p % W - b.x0 + pad)] = 1;
  mask = dropFragments(mask, cw_, chh, it.split ? 0.07 : 0.02);
  const small = document.createElement('canvas'); small.width = cw_; small.height = chh;
  const sctx = small.getContext('2d'), id = sctx.createImageData(cw_, chh);
  for (let i = 0; i < mask.length; i++) if (mask[i]) id.data[4 * i + 3] = 255;
  sctx.putImageData(id, 0, 0);
  const k = Math.max(1, Math.min(8, 110 / L.refPx)), P = Math.ceil(3 * k);
  const big = document.createElement('canvas');
  big.width = Math.ceil(cw_ * k) + 2 * P; big.height = Math.ceil(chh * k) + 2 * P;
  const bctx = big.getContext('2d', { willReadFrequently: true });
  bctx.imageSmoothingEnabled = true; bctx.imageSmoothingQuality = 'high';
  bctx.filter = `blur(${(0.45 * k).toFixed(2)}px)`;
  bctx.drawImage(small, P, P, cw_ * k, chh * k);
  const bd = bctx.getImageData(0, 0, big.width, big.height).data;
  const vals = new Float64Array(big.width * big.height);
  for (let i = 0; i < vals.length; i++) vals[i] = bd[4 * i + 3] / 255;
  const mp = d3.contours().size([big.width, big.height]).thresholds([0.5])(vals)[0];
  const s = L.scale, base = L.baseAt(it.cx), rings = [];
  for (const poly of mp.coordinates) for (const ring of poly) {
    let pts = ring.slice(0, -1).map(([x, y]) => {
      const px = b.x0 - pad + (x - P) / k, py = b.y0 - pad + (y - P) / k;
      return [(px - b.x0) * s, (base - py) * s];
    });
    pts = rdpClosed(pts, 3.2);
    if (pts.length >= 3 && Math.abs(ringArea(pts)) > 120) rings.push(pts);
  }
  return rings.length ? { rings, q: it.q, split: it.split, thumb: it.thumb } : null;
}

function dropFragments(m, w, h, frac) {
  const lab = new Int32Array(w * h), areas = [0], st = [];
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || lab[s]) continue;
    const id = areas.length; let a = 0; st.push(s); lab[s] = id;
    while (st.length) {
      const p = st.pop(); a++;
      const x = p % w, y = p / w | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx; if (m[q] && !lab[q]) { lab[q] = id; st.push(q); }
      }
    }
    areas.push(a);
  }
  const max = Math.max(...areas), out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (lab[i] && areas[lab[i]] >= Math.max(3, frac * max)) out[i] = 1;
  return out;
}

function ringArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return a / 2; }
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  let md = 0, mi = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
    if (d > md) { md = d; mi = i; }
  }
  if (md <= eps) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, mi + 1), eps).slice(0, -1), ...rdp(pts.slice(mi), eps)];
}
function rdpClosed(pts, eps) {
  if (pts.length < 8) return pts;
  let far = 0, fd = 0;
  pts.forEach((p, i) => { const d = Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]); if (d > fd) { fd = d; far = i; } });
  const a = rdp(pts.slice(0, far + 1), eps), b = rdp([...pts.slice(far), pts[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/* Подсветка на фото: синие — отдельные буквы, оранжевые — вырезаны из слитного слова */
function drawItems(ctx, items, lines) {
  const W = ctx.canvas.width;
  ctx.lineWidth = Math.max(1.5, W / 900);
  const fs = Math.max(12, W / 80);
  ctx.font = `600 ${fs}px -apple-system, sans-serif`;
  ctx.globalAlpha = 0.35; ctx.strokeStyle = '#3f5a2c';
  for (const L of lines) { ctx.beginPath(); ctx.moveTo(L.big[0].x0, L.baseAt(L.big[0].x0)); ctx.lineTo(L.x1, L.baseAt(L.x1)); ctx.stroke(); }
  ctx.globalAlpha = 1;
  for (const it of items) {
    const b = it.box;
    ctx.strokeStyle = it.split ? 'rgba(166,93,38,.9)' : 'rgba(63,90,44,.85)';
    ctx.strokeRect(b.x0 - 2, b.y0 - 2, b.x1 - b.x0 + 4, b.y1 - b.y0 + 4);
    ctx.fillStyle = it.split ? '#a65d26' : '#3f5a2c';
    ctx.fillText(it.char, b.x0, b.y0 - 4);
  }
}

/* Из нескольких вариантов буквы первым ставим самый типичный: неверно нарезанный вариант не похож на остальные */
function rankInstances(list) {
  const d = (a, b) => { let x = 0, u = 0; for (let i = 0; i < a.length; i++) { x += a[i] !== b[i]; u += a[i] | b[i]; } return u ? x / u : 0; };
  for (const it of list) it.score = it.q + (list.length > 1 ? 3 * list.reduce((s, o) => s + (o === it ? 0 : d(it.thumb, o.thumb)), 0) / (list.length - 1) : 0);
  return list.sort((a, b) => a.score - b.score);
}

/* Ручная правка: пиксели строки между двумя «косыми» границами a..b
   (координата по горизонтали с поправкой на наклон почерка, как при автоматической нарезке) */
function linePool(it, L) {
  const m = 2 * L.medH, b = it.box;
  return [...L.big, ...L.small].filter(c => c.x1 > b.x0 - m && c.x0 < b.x1 + m);
}
function sxRange(px, L) {
  let a = 1e9, b = -1e9;
  for (const p of px) { const x = L.shx(p); if (x < a) a = x; if (x > b) b = x; }
  return [a, b];
}
function recut(it, a, b, L, W) {
  const px = [];
  for (const c of linePool(it, L)) for (const p of c.px) { const x = L.shx(p); if (x >= a && x <= b) px.push(p); }
  return px.length ? mkItem(it.char, px, it.line, it.q, it.split, W) : null;
}
