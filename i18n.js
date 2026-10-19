/* Тексты сайта на русском и английском.
   Разметка: data-i18n="ключ" — текст элемента, data-i18n-aria="ключ" — aria-label.
   В скриптах: t('ключ', {переменные}). Язык запоминается; при первом заходе — по языку браузера. */

const plural = (n, one, few, many) => {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
};

const I18N = {
  ru: {
    title: 'inkfont — твой почерк как шрифт',
    desc: 'Напиши три строчки от руки, сфотографируй — получи готовый шрифт .otf за минуту.',
    langBtn: 'EN', langAria: 'Switch to English',
    tips: 'Печатными буквами · тёмной ручкой · фото сверху',
    demoChip: 'Демо-лист', demoCtaText: 'Это демо.', demoCtaBtn: 'Загрузить своё фото',
    navGo: 'Создать шрифт',
    lead: 'Три строчки от руки — и у тебя шрифт .otf.',
    startAria: 'Начать',
    demoTop: 'или попробовать демо',
    s1h: 'Перепиши на бумаге',
    s1sub: 'Последняя строка — заглавными.',
    segLatin: 'Latin', segCyr: 'Кириллица', segBoth: 'Обе', segOwn: 'Свой текст',
    ownText: 'Перепиши сюда текст с листа',
    s2h: 'Загрузи фото',
    s2sub: 'Фото не покидает браузер.',
    dropT: 'Перетащи фото',
    dropP: 'или нажми',
    demoBtn: 'Нет листа? Демо-почерк',
    s3h: 'Проверь буквы',
    s3sub: 'Нажми на букву, чтобы поправить.',
    legend: 'Пунктир — достроена автоматически. Бежевый — нет на фото.',
    missingTile: 'Этой буквы нет на фото',
    s4h: 'Готово',
    s4sub: 'Печатай — это твой шрифт.',
    s4subDemo: 'Это шрифт из демо-листа.',
    lblName: 'Название', lblSize: 'Размер', lblTrack: 'Межбуквенный',
    buyNote: 'Один раз · навсегда · .otf',
    buyBtn: 'Скачать шрифт',
    edLetter: 'Буква',
    edHint: 'Тяни ручки, чтобы сдвинуть границы.',
    edCloseAria: 'Закрыть', edPrevAria: 'Предыдущий вариант', edNextAria: 'Следующий вариант', edGlyphAria: 'Превью буквы',
    edDrop: 'Убрать этот вариант', edReset: 'Сбросить', edApply: 'Применить',
    edBuilt: v => `Построена из «${v.ch}».`,
    edMany: v => `${v.n} ${plural(v.n, 'вариант', 'варианта', 'вариантов')} — выбери лучший.`,
    edOne: 'Один вариант.',
    edVar: v => `вариант ${v.i} из ${v.n}`,
    edEmpty: 'Пусто — раздвинь границы.',
    edEmptyGlyph: 'пусто',
    stOpenFail: 'Не открылось. Нужен JPG или PNG.',
    stDemo: 'Пишем демо…',
    stSearching: 'Ищем буквы…',
    stNoText: 'Текста не видно. Сними ближе и светлее.',
    stFound: v => `Нашли ${v.found} из ${v.total}` + (v.cut ? ` · разрезано ${v.cut}` : '') +
      (v.low ? ' · часть букв не видна' : '') +
      ({ switched: ` · шаблон: ${t('tpl_' + v.tpl)}`, own: ` · совпал шаблон ${t('tpl_' + v.tpl)}`, poor: ' · текст плохо совпадает с фото' }[v.note] || ''),
    tpl_latin: 'Latin', tpl_cyrillic: 'Кириллица', tpl_both: 'Обе',
    footer: 'inkfont · шрифт сайта: General Sans',
  },
  en: {
    title: 'inkfont — your handwriting as a font',
    desc: 'Write three lines by hand, snap a photo, and get a real .otf font in a minute.',
    langBtn: 'RU', langAria: 'Переключить на русский',
    tips: 'Print letters · dark pen · shoot from above',
    demoChip: 'Demo sheet', demoCtaText: 'This is a demo.', demoCtaBtn: 'Upload your photo',
    navGo: 'Make a font',
    lead: 'Three handwritten lines. One .otf font.',
    startAria: 'Start',
    demoTop: 'or try a demo',
    s1h: 'Copy onto paper',
    s1sub: 'Last line in capitals.',
    segLatin: 'Latin', segCyr: 'Cyrillic', segBoth: 'Both', segOwn: 'Your own text',
    ownText: 'Type the text from your sheet',
    s2h: 'Upload a photo',
    s2sub: 'The photo stays in your browser.',
    dropT: 'Drop a photo',
    dropP: 'or click',
    demoBtn: 'No paper? Try demo handwriting',
    s3h: 'Check the letters',
    s3sub: 'Tap a letter to fix it.',
    legend: 'Dashed: built automatically. Beige: not in the photo.',
    missingTile: 'This letter isn’t in the photo',
    s4h: 'Done',
    s4sub: 'Type. It’s your font.',
    s4subDemo: 'This font comes from the demo sheet.',
    lblName: 'Name', lblSize: 'Size', lblTrack: 'Spacing',
    buyNote: 'One-time · forever · .otf',
    buyBtn: 'Download font',
    edLetter: 'Letter',
    edHint: 'Drag the handles to move the edges.',
    edCloseAria: 'Close', edPrevAria: 'Previous version', edNextAria: 'Next version', edGlyphAria: 'Letter preview',
    edDrop: 'Remove this version', edReset: 'Reset', edApply: 'Apply',
    edBuilt: v => `Built from “${v.ch}”.`,
    edMany: v => `${v.n} versions. Pick the best.`,
    edOne: 'One version.',
    edVar: v => `version ${v.i} of ${v.n}`,
    edEmpty: 'Empty. Widen the edges.',
    edEmptyGlyph: 'empty',
    stOpenFail: 'Couldn’t open it. Use JPG or PNG.',
    stDemo: 'Writing a demo…',
    stSearching: 'Looking for letters…',
    stNoText: 'No text found. Shoot closer, in better light.',
    stFound: v => `Found ${v.found} of ${v.total}` + (v.cut ? ` · ${v.cut} cut` : '') +
      (v.low ? ' · some letters missing' : '') +
      ({ switched: ` · template: ${t('tpl_' + v.tpl)}`, own: ` · matched ${t('tpl_' + v.tpl)}`, poor: ' · text barely matches the photo' }[v.note] || ''),
    tpl_latin: 'Latin', tpl_cyrillic: 'Cyrillic', tpl_both: 'Both',
    footer: 'inkfont · site font: General Sans',
  },
};

let LANG = (() => {
  try { const s = localStorage.getItem('inkfont-lang') || localStorage.getItem('inkself-lang'); if (s === 'ru' || s === 'en') return s; } catch (e) {}
  return (navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
})();

function t(key, vars = {}) {
  const s = I18N[LANG][key] ?? I18N.ru[key] ?? key;
  return typeof s === 'function' ? s(vars) : s;
}

// скрипты подписываются, чтобы перерисовать свои тексты (статус, плитки, окно правки)
const langHooks = [];

function applyLang() {
  document.documentElement.lang = LANG;
  document.title = t('title');
  document.querySelector('meta[name=description]')?.setAttribute('content', t('desc'));
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  const b = document.getElementById('langBtn');
  if (b) { b.textContent = t('langBtn'); b.setAttribute('aria-label', t('langAria')); }
  langHooks.forEach(f => f());
}

function setLang(l) {
  LANG = l;
  try { localStorage.setItem('inkfont-lang', l); } catch (e) {}
  applyLang();
}

document.getElementById('langBtn')?.addEventListener('click', () => setLang(LANG === 'ru' ? 'en' : 'ru'));
