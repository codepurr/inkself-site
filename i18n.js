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
    navGo: 'Создать шрифт',
    lead: 'Три строчки от руки и одно фото — через минуту у тебя настоящий шрифт .otf.',
    askP: 'Без шаблонов и таблиц. Всё считается в браузере: твой почерк никуда не уходит.',
    startAria: 'Начать',
    demoTop: 'или посмотреть на демо-почерке',
    s1h: 'Перепиши строки на бумаге',
    s1sub: 'Обычной ручкой, печатными буквами. Последняя строка — заглавными: так получатся и большие, и маленькие буквы.',
    segLatin: 'Latin', segCyr: 'Кириллица', segBoth: 'Обе', segOwn: 'Свой текст',
    tip1b: 'Буквы не касаются', tip1: 'Небольшой зазор между буквами, без слитного письма.',
    tip2b: 'Тёмная ручка', tip2: 'Гелевая или линер. Карандаш распознаётся хуже.',
    tip3b: 'Ровный свет', tip3: 'Снимай сверху, без тени от телефона, лист целиком.',
    tip4b: 'Переносы — можно', tip4: 'Пиши в своём размере, строки мы найдём сами.',
    ownText: 'Напиши здесь то, что написано на листе,\nстрока в строку.\nИ ЕЩЁ СТРОКУ ЗАГЛАВНЫМИ!',
    s2h: 'Загрузи фото',
    s2sub: 'Обработка идёт прямо в браузере — твой почерк никуда не уходит.',
    dropT: 'Перетащи фото сюда',
    dropP: 'или нажми, чтобы выбрать · JPG, PNG, HEIC-скриншот',
    demoBtn: 'Нет листа под рукой? Сгенерировать демо-почерк',
    s3h: 'Проверь буквы',
    s3sub: 'Нажми на букву: увидишь, где мы её нашли на фото, и сможешь подвинуть границы или выбрать другой вариант.',
    legend: 'Пунктир — буква достроена автоматически (например, заглавная из строчной). Бежевый — не нашли, будет системный шрифт.',
    missingTile: 'Этой буквы нет на фото',
    s4h: 'Готово. Попробуй',
    s4sub: 'Печатай ниже — это уже твой шрифт.',
    lblName: 'Название', lblSize: 'Размер', lblTrack: 'Межбуквенный',
    buyNote: 'Один раз за шрифт · .otf · личное и коммерческое использование',
    buyBtn: 'Скачать шрифт',
    edLetter: 'Буква',
    edHint: 'Тяни ручки, чтобы сдвинуть границы. Тёмным — то, что попадёт в шрифт, серым — соседние буквы.',
    edCloseAria: 'Закрыть', edPrevAria: 'Предыдущий вариант', edNextAria: 'Следующий вариант', edGlyphAria: 'Превью буквы',
    edDrop: 'Убрать этот вариант', edReset: 'Сбросить', edApply: 'Применить',
    edBuilt: v => `«${v.shown}» нет на фото — она построена из «${v.ch}». Правка изменит обе.`,
    edMany: v => `На фото ${v.n} ${plural(v.n, 'вариант', 'варианта', 'вариантов')} этой буквы — выбери лучший.`,
    edOne: 'На фото один вариант этой буквы.',
    edVar: v => `вариант ${v.i} из ${v.n}`,
    edEmpty: 'Между границами нет чернил — раздвинь их.',
    edEmptyGlyph: 'пусто',
    stOpenFail: 'Не получилось открыть файл. Попробуй JPG или PNG.',
    stDemo: 'Пишем демо-лист…',
    stSearching: 'Ищем буквы…',
    stNoText: 'На фото почти нет текста. Сфотографируй лист ближе и при хорошем свете.',
    stFound: v => `Нашли ${v.found} из ${v.total} знаков, ${v.kinds} разных символов` +
      (v.cut ? `, ${v.cut} вырезали из слитных слов (оранжевые).` : '.') +
      (v.low ? ' Часть букв не видна — проверь их ниже или пересними фото.' : ''),
    footer: 'inkfont · всё считается локально в браузере · шрифт сайта: General Sans с Fontshare',
  },
  en: {
    title: 'inkfont — your handwriting as a font',
    desc: 'Write three lines by hand, snap a photo, and get a real .otf font in a minute.',
    langBtn: 'RU', langAria: 'Переключить на русский',
    navGo: 'Make a font',
    lead: 'Three handwritten lines and one photo. A minute later, you have a real .otf font.',
    askP: 'No templates, no grids. Everything runs in your browser, so your handwriting never leaves it.',
    startAria: 'Start',
    demoTop: 'or try it with demo handwriting',
    s1h: 'Copy these lines onto paper',
    s1sub: 'Any pen, print letters. Write the last line in capitals, so you get both upper and lower case.',
    segLatin: 'Latin', segCyr: 'Cyrillic', segBoth: 'Both', segOwn: 'Your own text',
    tip1b: 'Letters don’t touch', tip1: 'Leave a small gap between letters; no joined-up writing.',
    tip2b: 'Dark pen', tip2: 'A gel pen or fineliner. Pencil works worse.',
    tip3b: 'Even light', tip3: 'Shoot from above, with no phone shadow and the whole sheet in frame.',
    tip4b: 'Line breaks are fine', tip4: 'Write at your own size; we find the lines ourselves.',
    ownText: 'Type here exactly what is on your sheet,\nline by line.\nAND ONE MORE LINE IN CAPITALS!',
    s2h: 'Upload a photo',
    s2sub: 'Processing happens right in your browser. Your handwriting never leaves it.',
    dropT: 'Drop your photo here',
    dropP: 'or click to choose · JPG, PNG, HEIC screenshot',
    demoBtn: 'No paper at hand? Generate demo handwriting',
    s3h: 'Check the letters',
    s3sub: 'Tap a letter to see where we found it in the photo, move its edges or pick another version.',
    legend: 'Dashed: built automatically (for example, a capital made from a lowercase letter). Beige: not found, a system font will stand in.',
    missingTile: 'This letter isn’t in the photo',
    s4h: 'Done. Try it',
    s4sub: 'Type below. This is already your font.',
    lblName: 'Name', lblSize: 'Size', lblTrack: 'Spacing',
    buyNote: 'One-time per font · .otf · personal and commercial use',
    buyBtn: 'Download font',
    edLetter: 'Letter',
    edHint: 'Drag the handles to move the edges. Dark is what goes into the font; grey is the neighbouring letters.',
    edCloseAria: 'Close', edPrevAria: 'Previous version', edNextAria: 'Next version', edGlyphAria: 'Letter preview',
    edDrop: 'Remove this version', edReset: 'Reset', edApply: 'Apply',
    edBuilt: v => `“${v.shown}” isn’t in the photo; it’s built from “${v.ch}”. Editing changes both.`,
    edMany: v => `This letter appears ${v.n} times in the photo. Pick the best one.`,
    edOne: 'This letter appears once in the photo.',
    edVar: v => `version ${v.i} of ${v.n}`,
    edEmpty: 'There’s no ink between the edges. Move them apart.',
    edEmptyGlyph: 'empty',
    stOpenFail: 'Couldn’t open the file. Try JPG or PNG.',
    stDemo: 'Writing a demo sheet…',
    stSearching: 'Looking for letters…',
    stNoText: 'There’s hardly any text in the photo. Take it closer, in good light.',
    stFound: v => `Found ${v.found} of ${v.total} characters, ${v.kinds} different ones` +
      (v.cut ? `; ${v.cut} were cut out of joined-up words (orange).` : '.') +
      (v.low ? ' Some letters are missing. Check them below or retake the photo.' : ''),
    footer: 'inkfont · everything runs locally in your browser · site font: General Sans from Fontshare',
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
