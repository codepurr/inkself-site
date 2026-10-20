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
const PUNCT = new Set(".,!?:-;'");
const SMALL_PUNCT = new Set(".,:;-'");

// Примерная ширина знака в долях «средней буквы» — нужна, чтобы резать слитные слова
function cw(c) {
  if ('.,:;!\''.includes(c)) return 0.25;
  if (c === '?') return 0.5;
  if (c === '1') return 0.4;
  if ('()'.includes(c)) return 0.36;
  if (/[0-9]/.test(c)) return 0.62;
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
  // буквы ниже ~0.6% кадра (12 пикселей на 2000) — это не текст, а шум, сетка или мелкий узор
  if (!(medH >= Math.max(W, H) * 0.006)) return null;
  // край листа, линейки, крупные рисунки
  comps = comps.filter(c => !(c.h > 4.5 * medH) && !(c.h > 2 * medH && c.h > 9 * c.w) && !(c.w > 2 * medH && c.w > 12 * c.h));
  // тени, край страниц, цветные предметы светлее настоящих чернил: отсекаем пятна слабее 75% от типичных
  const medInk = median(comps.filter(c => c.area >= 3 * minArea).map(c => c.ink));
  comps = comps.filter(c => c.ink >= 0.75 * medInk);
  // клякса, залитое пятно, корешок книги: широкое и плотно залитое чернилами (буквы — штрихи, у них заливка 15–40%);
  // узкие плотные штрихи (l, i, !) и мелкие точки не трогаем
  // Клякса — это не плотность (жирный маркер и кисть тоже плотные), а толщина: у буквы штрих одной толщины
  // на всём листе, а в кляксу помещается круг в разы больше. Меряем самый большой вписанный круг каждого пятна
  for (const c of comps) c.thick = c.area >= 3 * minArea ? maxInscribed(c, W) : 0;
  const strokeR = median(comps.filter(c => c.thick).map(c => c.thick));
  comps = comps.filter(c => !(c.thick > 2.4 * strokeR && c.thick > 0.12 * medH && c.area / (c.w * c.h) > 0.45));
  comps = textBlock(comps, medH);
  medH = pct(comps.filter(c => c.area >= 3 * minArea).map(c => c.h), 0.6);
  const lines = buildLines(comps, medH, W);
  lines.forEach(L => { estimateSlant(L, W); L.clusters = clusterLine(L, W); });
  // Масштаб почерка строки. Высота пятен не годится: в прописи пятно — целое слово, и строка
  // без хвостатых букв выходит вдвое «ниже» соседней. Берём общий размер листа и поправляем его
  // по высоте основной полосы букв (там, где строчные без хвостов), — она от слов не зависит
  lines.forEach(L => L.coreH = median(L.big.map(c => c.core1 - c.core0)));
  const gH = median(lines.map(L => L.medH)), gC = median(lines.map(L => L.coreH));
  lines.forEach(L => L.unit = gC > 0 ? gH * L.coreH / gC : L.medH);
  return { lines, comps };
}

function analyze(data, W, H, text) {
  const seg = segment(data, W, H);
  return seg && alignText(seg, text, W);
}

function alignText(seg, text, W) {
  const obs = wordsOnPhoto(seg.lines, text.split(/\s+/).filter(Boolean).length);
  const { items, total, cost } = alignChars(obs, text, seg.lines, W);
  computeLineMetrics(seg.lines, items);
  const fit = fitScore(items, total, cost);
  // other — на листе другой текст (или дописано лишнее); missing — часть текста на листе не нашлась
  const warn = fit.match > MATCH_MAX ? 'other' : fit.found < 0.93 ? 'missing' : '';
  return { items, obs, lines: seg.lines, comps: seg.comps, total, fit, warn };
}

/* Насколько текст подходит к фото. Неверный текст всё равно «натягивается» на пятна,
   но тогда под одной буквой оказываются непохожие друг на друга пятна, и приходится много резать. */
const MATCH_MAX = 1.92;
function fitScore(items, total, cost) {
  const by = new Map();
  for (const it of items) (by.get(it.char) || by.set(it.char, []).get(it.char)).push(it.thumb);
  let sum = 0, pairs = 0;
  for (const th of by.values()) for (let a = 0; a < th.length; a++) for (let b = a + 1; b < th.length; b++) { sum += thumbDist(th[a], th[b]); pairs++; }
  const split = items.filter(i => i.split).length / Math.max(1, total);
  const found = items.length / Math.max(1, total);
  const unlike = pairs ? sum / pairs : 0.5;
  const c = cost / Math.max(1, total);
  // match — насколько текст совпал с листом: цена сопоставления на букву + непохожесть экземпляров одной буквы.
  // На 40 тестовых листах верный текст даёт не больше 1.86, чужой текст или лишняя строка на листе — от 1.95
  const match = c / 0.3 + unlike / 0.65;
  return { cost: c, split, found, unlike, match, score: unlike + 0.6 * split + 0.08 * c + 0.8 * (1 - found) };
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

/* Радиус самого большого круга внутри пятна (двухпроходное расстояние до фона, шахматная метрика 3-4) */
function maxInscribed(c, W) {
  const w = c.w + 2, h = c.h + 2, d = new Float32Array(w * h);
  for (const p of c.px) d[((p / W | 0) - c.y0 + 1) * w + (p % W - c.x0 + 1)] = 1e9;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (!d[i]) continue;
    d[i] = Math.min(d[i], d[i - 1] + 3, d[i - w] + 3, d[i - w - 1] + 4, d[i - w + 1] + 4);
  }
  let mx = 0;
  for (let y = h - 2; y > 0; y--) for (let x = w - 2; x > 0; x--) {
    const i = y * w + x; if (!d[i]) continue;
    d[i] = Math.min(d[i], d[i + 1] + 3, d[i + w] + 3, d[i + w + 1] + 4, d[i + w - 1] + 4);
    if (d[i] > mx) mx = d[i];
  }
  return mx / 3;
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
  // в прописи слово — одно пятно, поэтому блок прописи мал по числу пятен. Оставляем и группу,
  // где много чернил, если её пятна по высоте как буквы основного блока (рисунки обычно крупнее и реже)
  const stat = new Map();
  comps.forEach((c, i) => { if (c.h < 0.4 * medH) return; const r = find(i); const st = stat.get(r) || stat.set(r, { area: 0, hs: [] }).get(r); st.area += c.area; st.hs.push(c.h); });
  const mainH = median([...stat].filter(([r]) => keep.has(r)).flatMap(([, st]) => st.hs));
  const maxArea = Math.max(...[...stat.values()].map(st => st.area));
  for (const [r, st] of stat) {
    if (keep.has(r) || st.hs.length < 4) continue;
    const mh = median(st.hs);
    if (st.area >= 0.2 * maxArea && mh > 0.6 * mainH && mh < 1.6 * mainH) keep.add(r);
  }
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
  // черта «!» или «?», вынесенная высоко над строкой, получается отдельной «строкой» из одного пятна.
  // Если прямо под ней стоит точка, а точка ближе к соседней строке — переносим черту в ту строку
  for (const S of [...lines]) {
    if (S.big.length > 2) continue;
    for (const c of [...S.big]) {
      const dot = small.find(d => d.x1 > c.x0 - 0.3 * c.w && d.x0 < c.x1 + 0.3 * c.w && d.y0 >= c.y1 - 0.1 * medH && d.y0 - c.y1 < 1.0 * medH);
      if (!dot) continue;
      let host = null, hd = 1e9;
      for (const b of big) {
        if (b._line === S) continue;
        const dx = Math.max(0, b.x0 - dot.x1, dot.x0 - b.x1), dy = Math.max(0, b.y0 - dot.y1, dot.y0 - b.y1), d = dx + 1.5 * dy;
        if (d < hd) { hd = d; host = b._line; }
      }
      if (!host || hd > 2.5 * medH) continue;
      S.big = S.big.filter(k => k !== c); host.big.push(c); fit(host);
    }
    if (!S.big.length) lines = lines.filter(x => x !== S); else fit(S);
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

/* Слова на фото. Порог пробела у каждого почерка свой (в прописи зазоры внутри слова почти нулевые,
   в печатных буквах — заметные), поэтому берём его с самого листа: в тексте K слов на N строках,
   значит, пробелов внутри строк около K − N. Сортируем все зазоры по убыванию и ставим порог
   у ранга K − N, на самом заметном скачке рядом с ним. */
function wordGaps(lines) {
  const gaps = [];
  lines.forEach(L => {
    let right = -1e9;
    L.clusters.forEach((k, i) => { if (i) gaps.push((k.sx0 - right) / L.medH); right = Math.max(right, k.sx1); });
  });
  return gaps;
}
function wordThreshold(lines, nWords) {
  const g = wordGaps(lines).sort((a, b) => b - a);
  const r = Math.max(1, Math.min(g.length - 1, nWords - lines.length));
  if (g.length < 2) return 0.42;
  let best = r, bv = -1e9;
  for (let i = Math.max(1, Math.round(r * 0.6)); i <= Math.min(g.length - 1, Math.round(r * 1.5) + 1); i++) {
    const hi = Math.max(g[i - 1], 0.02), lo = Math.max(g[i], 0.02);
    const v = Math.log(hi / lo) - 0.6 * Math.abs(Math.log(i / r));
    if (v > bv) { bv = v; best = i; }
  }
  const t = (g[best - 1] + Math.max(g[best], 0)) / 2;
  return Math.max(0.12, Math.min(0.9, t));
}
function wordsOnPhoto(lines, nWords) {
  const thr = wordThreshold(lines, nWords), obs = [];
  lines.forEach((L, li) => {
    let cur = [], right = -1e9;
    for (const k of L.clusters) {
      if (cur.length && (k.sx0 - right) / L.medH > thr) { obs.push({ clusters: cur, line: li }); cur = []; }
      cur.push(k); right = Math.max(right, k.sx1);
    }
    if (cur.length) obs.push({ clusters: cur, line: li });
  });
  return obs;
}

/* Сопоставление (DP по всему тексту сразу):
   пятно → 1..10 букв (слитное письмо), 2–3 пятна → 1 буква (ы, рваные штрихи), шум, пропуск.
   Ширину букв ждём по общему масштабу почерка строки; пробелы из текста — мягкая подсказка. */
function alignChars(obs, text, lines, W) {
  const words = text.split(/\s+/).filter(Boolean), chars = [], sp = [];
  words.forEach((w, wi) => [...w].forEach((c, ci) => { chars.push(c); sp.push(ci === 0 && wi > 0); }));
  let spanSum = 0;
  for (const o of obs) spanSum += (Math.max(...o.clusters.map(k => k.sx1)) - Math.min(...o.clusters.map(k => k.sx0)) + 1) / lines[o.line].unit;
  const rho = spanSum / chars.reduce((a, c) => a + cw(c), 0);
  lines.forEach(L => L.alpha = rho * L.unit);
  lines.forEach((L, li) => L.clusters.forEach(k => { k.line = li; }));
  const tw = []; let j0 = 0;
  for (const w of words) { tw.push({ chars: [...w], j0 }); j0 += [...w].length; }
  let res = dpWords(obs, tw, lines);
  // второй проход: уточняем масштаб каждой строки по уже найденным буквам
  lines.forEach((L, li) => {
    const gs = res.groups.filter(g => g.cl[0].line === li);
    const w = gs.reduce((a, g) => a + g.w, 0), s = gs.reduce((a, g) => a + g.chars.reduce((b, c) => b + cw(c), 0), 0);
    if (s > 3) L.alpha = Math.sqrt(L.alpha * (w / s));
  });
  res = dpWords(obs, tw, lines);
  const items = [];
  // кусок фото → его буквы. Отдельное пятно = одна буква (так надёжнее всего);
  // слипшийся кусок режем решёткой разрезов, а модель почерка учится на самом листе за несколько проходов
  const units = res.groups.map(g => ({ cl: g.cl, chars: g.chars, j0: g.j0, line: g.cl[0].line, cost: g.cost, single: g.chars.length === 1 }));
  const NP = 3;
  let model = null, cuts = null;
  for (let pass = 0; pass < NP; pass++) {
    cuts = units.map(u => cutWord(u, lines[u.line], W, model));
    model = learnModel(cuts, lines);
  }
  units.forEach((u, ui) => {
    const c = cuts[ui];
    if (u.single) return items.push(Object.assign(mkItem(u.chars[0], c.parts[0], u.line, u.cost + (u.cl.length > 1 ? 0.3 : 0), false, W), { idx: u.j0 }));
    c.parts.forEach((px, t) => px.length && items.push(Object.assign(mkItem(u.chars[t], px, u.line, 1 + u.cost, true, W), { idx: u.j0 + t })));
  });
  return { items, total: chars.length, cost: res.cost, model };
}

/* Нарезка слова на буквы — «решётка разрезов».
   Слово выпрямляем по наклону почерка и делим на колонки. Перебираем все расстановки разрезов
   (динамическое программирование) и берём самую дешёвую. Цена складывается из:
   — чернил под разрезом (разрез по тонкой связке дешёвый, через петлю или ножку дорогой);
   — ширины буквы против ожидаемой (сначала по таблице, потом по этому же почерку);
   — непохожести куска на другие экземпляры той же буквы на листе (каждая буква в панграмме 2–3 раза).
   Модель почерка (ширины и образцы букв) уточняется за несколько проходов. */
const RAST_R = 24, THUMB_B = 10;
// веса решётки подобраны на 40 синтетических листах и проверены на 40 других (tools/bench)
const CUT_W = 0.3, POS_W = 1.6, WID_W = 1.0, PROTO_W = 6;
function wordRaster(cl, L, W) {
  const px = cl.flatMap(k => k.comps.flatMap(c => c.px));
  const sx = px.map(L.shx);
  let a = 1e9, b = -1e9; for (const x of sx) { if (x < a) a = x; if (x > b) b = x; }
  const step = Math.max(1, L.alpha / 14), ncol = Math.floor((b - a) / step) + 1;
  const top = 1.25 * L.medH, span = 2.3 * L.medH;
  const PS = new Float32Array((ncol + 1) * RAST_R), cols = Array.from({ length: ncol }, () => []);
  const col = new Int32Array(px.length);
  px.forEach((p, i) => {
    const c = Math.min(ncol - 1, Math.floor((sx[i] - a) / step)); col[i] = c;
    const y = p / W | 0, yc = y - L.centerAt(p % W);
    const r = Math.max(0, Math.min(RAST_R - 1, Math.floor((yc + top) / span * RAST_R)));
    PS[(c + 1) * RAST_R + r]++; cols[c].push(y);
  });
  for (let c = 1; c <= ncol; c++) for (let r = 0; r < RAST_R; r++) PS[c * RAST_R + r] += PS[(c - 1) * RAST_R + r];
  // цена разреза: сколько чернил в колонке и сколько штрихов её пересекает; нормируем на толщину штриха
  const thick = Math.max(1.5, 0.07 * L.medH), cut = new Float32Array(ncol + 1);
  const raw = cols.map(ys => {
    if (!ys.length) return 0;
    ys.sort((u, v) => u - v);
    let runs = 1; for (let t = 1; t < ys.length; t++) if (ys[t] - ys[t - 1] > 2) runs++;
    return ys.length / (step * thick) + 1.5 * (runs - 1);
  });
  for (let x = 0; x <= ncol; x++) { const v = ((raw[x - 1] || 0) + (raw[x] || 0)) / 2; cut[x] = Math.min(12, v); }
  return { px, col, a, step, ncol, PS, cut };
}
function thumbOf(R, u, v) {
  const t = new Float32Array(THUMB_B * RAST_R);
  let n2 = 0;
  for (let bi = 0; bi < THUMB_B; bi++) {
    let c0 = u + Math.floor((v - u) * bi / THUMB_B), c1 = u + Math.floor((v - u) * (bi + 1) / THUMB_B);
    if (c1 <= c0) c1 = c0 + 1;
    for (let r = 0; r < RAST_R; r++) { const s = R.PS[c1 * RAST_R + r] - R.PS[c0 * RAST_R + r]; t[bi * RAST_R + r] = s; n2 += s * s; }
  }
  const k = n2 ? 1 / Math.sqrt(n2) : 0;
  for (let i = 0; i < t.length; i++) t[i] *= k;
  return t;
}
function cutWord(m, L, W, model) {
  const R = wordRaster(m.cl, L, W), n = m.chars.length, X = R.ncol, INF = 1e18;
  const wexp = m.chars.map(c => L.alpha * (model?.w[c] ?? cw(c)));
  const proto = m.chars.map(c => model?.proto[c] || null);
  const inkAt = (u, v) => { let s = 0; for (let r = 0; r < RAST_R; r++) s += R.PS[v * RAST_R + r] - R.PS[u * RAST_R + r]; return s; };
  const f = new Float64Array((n + 1) * (X + 1)).fill(INF), from = new Int32Array((n + 1) * (X + 1));
  f[0] = 0;
  if (n === 1) return finish([0, X]);
  // ожидаемое место каждого разреза — пропорционально ожидаемым ширинам букв
  const sumW = wexp.reduce((a, b) => a + b, 0), avg = X / n, expAt = []; let acc = 0;
  for (let t = 0; t < n - 1; t++) { acc += wexp[t]; expAt.push(acc / sumW * X); }
  for (let t = 1; t <= n; t++) {
    const we = wexp[t - 1] / R.step, lo = Math.max(1, Math.floor(0.2 * we)), hi = Math.ceil(2.4 * we) + 2, pr = proto[t - 1];
    const xs = t === n ? [X] : null;
    for (let x = t; x <= X - (n - t); x++) {
      if (xs && x !== X) continue;
      let best = INF, bu = -1;
      for (let u = Math.max(t - 1, x - hi); u <= x - lo; u++) {
        const fu = f[(t - 1) * (X + 1) + u]; if (fu >= INF) continue;
        const dev = (x - u - we) / (0.35 * we + 1);
        let c = fu + Math.min(6, WID_W * dev * dev);
        if (inkAt(u, x) < 2) c += 4;
        if (pr) { const th = thumbOf(R, u, x); let d = 0; for (let i = 0; i < th.length; i++) d += th[i] * pr[i]; c += PROTO_W * (1 - d); }
        if (c < best) { best = c; bu = u; }
      }
      if (bu < 0) continue;
      const pos = t < n ? (x - expAt[t - 1]) / (0.45 * avg) : 0;
      f[t * (X + 1) + x] = best + (t < n ? CUT_W * R.cut[x] + POS_W * pos * pos : 0); from[t * (X + 1) + x] = bu;
    }
  }
  const cuts = [X]; for (let t = n, x = X; t > 0; t--) { x = from[t * (X + 1) + x]; cuts.unshift(x); }
  return finish(cuts);
  function finish(cuts) {
  const parts = m.chars.map(() => []);
  R.px.forEach((p, i) => { let t = 0; while (t < n - 1 && R.col[i] >= cuts[t + 1]) t++; parts[t].push(p); });
  const costs = [], split = [];
  for (let t = 0; t < n; t++) {
    // буква отрезана от соседней (разрез прошёл по чернилам), а не стоит отдельно
    split.push((t > 0 && R.cut[cuts[t]] > 0.3) || (t < n - 1 && R.cut[cuts[t + 1]] > 0.3));
    costs.push(split[t] ? 1 : 0);
  }
  return { parts, cuts, R, wexp, costs, split, chars: m.chars, L, single: n === 1 };
  }
}
// модель почерка: ширина каждой буквы в долях масштаба строки и средний образец (миниатюра)
function learnModel(cuts, lines) {
  const ws = {}, th = {};
  for (const c of cuts) {
    if (!c) continue;
    c.chars.forEach((ch, t) => {
      const u = c.cuts[t], v = c.cuts[t + 1];
      (ws[ch] ||= []).push((v - u) * c.R.step / c.L.alpha);
      (th[ch] ||= []).push(thumbOf(c.R, u, v));
    });
  }
  const model = { w: {}, proto: {} };
  for (const ch in ws) {
    const k = ws[ch].length, med = median(ws[ch]);
    model.w[ch] = (k * med + 2 * cw(ch)) / (k + 2);
    if (k >= 2) {
      const p = new Float32Array(th[ch][0].length);
      for (const t of th[ch]) for (let i = 0; i < p.length; i++) p[i] += t[i];
      let n2 = 0; for (const v of p) n2 += v * v; const q = n2 ? 1 / Math.sqrt(n2) : 0;
      for (let i = 0; i < p.length; i++) p[i] *= q;
      model.proto[ch] = p;
    }
  }
  return model;
}

/* Сначала слова, потом буквы. Пробел между словами на фото надёжен даже в прописи,
   поэтому ошибка внутри слова не может утянуть за собой остальной текст.
   Ходы: слово фото ↔ слово текста; два слова фото ↔ одно (лишний зазор, перенос «well-» / «done»);
   одно слово фото ↔ два (пробел не виден); слово фото без текста (дописано, рисунок) и слово текста без фото (не написано). */
const W_JOIN = 1.2, W_SKIP_CL = 1.6, W_SKIP_DOT = 0.5, W_SKIP_CH = 1.6;
function dpWords(obs, tw, lines) {
  const P = obs.length, T = tw.length, INF = 1e18, T1 = T + 1;
  const dp = new Float64Array((P + 1) * T1).fill(INF), from = new Int32Array((P + 1) * T1 * 2);
  const best = new Array((P + 1) * T1);
  dp[0] = 0;
  const skipP = a => obs[a].clusters.reduce((s, k) => s + (k.h < 0.35 * lines[k.line].medH ? W_SKIP_DOT : W_SKIP_CL), 0);
  const inner = (a, pa, b, tb) => {
    const cl = [], chars = [], sp = [];
    for (let t = a; t < a + pa; t++) cl.push(...obs[t].clusters);
    for (let t = b; t < b + tb; t++) tw[t].chars.forEach((c, i) => { chars.push(c); sp.push(i === 0 && t > b); });
    const r = dpChars(cl, chars, sp, lines);
    r.groups.forEach(g => g.j0 += tw[b].j0);
    r.match = { cl, chars, j0: tw[b].j0, line: cl[0].line, oneLine: cl.every(k => k.line === cl[0].line) };
    return r;
  };
  const MOVES = [];
  for (let pa = 1; pa <= 3; pa++) for (let tb = 1; tb <= 3; tb++) MOVES.push([pa, tb, W_JOIN * (pa - 1 + tb - 1)]);
  for (let a = 0; a <= P; a++) for (let b = 0; b <= T; b++) {
    const v = dp[a * T1 + b]; if (v >= INF) continue;
    const put = (a2, b2, c, r) => { const o = a2 * T1 + b2; if (v + c < dp[o]) { dp[o] = v + c; from[2 * o] = a; from[2 * o + 1] = b; best[o] = r; } };
    for (const [pa, tb, pen] of MOVES) {
      if (a + pa > P || b + tb > T) continue;
      // склейка слов фото через строку — только перенос по дефису
      if (pa > 1 && obs[a + pa - 1].line !== obs[a].line && !tw.slice(b, b + tb).some(t => t.chars.includes('-'))) continue;
      // слово с дефисом часто пишут тремя кусками («well», «-», «done»): такая склейка почти бесплатна
      const p2 = pa > 1 && tw.slice(b, b + tb).some(t => t.chars.includes('-')) ? pen - 0.75 * W_JOIN * (pa - 1) : pen;
      const r = inner(a, pa, b, tb);
      put(a + pa, b + tb, r.cost + p2, r);
    }
    if (a < P) put(a + 1, b, skipP(a), null);
    if (b < T) put(a, b + 1, W_SKIP_CH * tw[b].chars.length, null);
  }
  const groups = [], matches = []; let a = P, b = T;
  while (a > 0 || b > 0) {
    const o = a * T1 + b, r = best[o];
    if (r) { groups.unshift(...r.groups); matches.unshift(Object.assign(r.match, { groups: r.groups })); }
    const pa = from[2 * o], pb = from[2 * o + 1]; a = pa; b = pb;
  }
  return { cost: dp[P * T1 + T], groups, matches };
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
    if (p && q) { const g = cl.slice(i - p, i); groups.push({ cl: g, j0: j - q, chars: chars.slice(j - q, j), cost: bc[o], w: Math.max(...g.map(k => k.sx1)) - g[0].sx0 + 1 }); }
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
const DESC = new Set('gjpqyfрудфцщ,QДЦЩ()');
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
