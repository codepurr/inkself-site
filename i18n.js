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
    tips: 'Пиши тёмной ручкой. Снимай лист прямо сверху, при хорошем свете.',
    demoChip: 'Пример листа', demoCtaText: 'Это пример.', demoCtaBtn: 'Загрузить своё фото',
    demoTitle: 'Как это работает', demoS1: 'Ты пишешь текст на листе', demoS2: 'Сайт находит каждую букву', demoS3: 'Ты получаешь свой шрифт',
    navGo: 'Создать шрифт',
    lead: 'Напиши три строки от руки и получи свой шрифт.',
    startAria: 'Начать',
    demoTop: 'или посмотри пример',
    s1h: 'Перепиши текст',
    s1sub: 'Выбери алфавит. Перепиши строки на лист печатными буквами.',
    segLatin: 'Latin', segCyr: 'Кириллица', segBoth: 'Обе', segOwn: 'Свой текст',
    ownText: 'Напечатай здесь то, что написал на листе',
    s2h: 'Загрузи фото',
    s2sub: 'Фото никуда не уходит: сайт читает его прямо в браузере.',
    dropT: 'Перетащи фото сюда',
    dropP: 'или нажми и выбери файл',
    demoBtn: 'Нет листа под рукой? Возьми пример почерка',
    s3h: 'Проверь буквы',
    s3sub: 'Если буква вышла плохо, нажми на неё и поправь.',
    legend: 'Пунктирная рамка: знак собран сайтом — из своей пары (заглавной или строчной) или из других знаков, например тире из дефиса. Бежевая: знака нет на фото.',
    missingTile: 'Этой буквы нет на фото',
    s4h: 'Готово',
    s4sub: 'Напечатай что-нибудь и посмотри на свой шрифт.',
    s4subDemo: 'Это шрифт из примера. Загрузи своё фото, чтобы сделать свой.',
    lblName: 'Название', lblSize: 'Размер', lblTrack: 'Межбуквенный',
    buyNote: 'Платишь один раз, файл .otf остаётся у тебя.',
    buyBtn: 'Скачать шрифт',
    buyPay: 'Купить и скачать',
    paidBtn: 'Скачать шрифт',
    payBusy: 'Открываем страницу оплаты…',
    payFail: 'Страница оплаты не открылась. Проверь интернет и попробуй ещё раз.',
    payCheck: 'Проверяем оплату…',
    payNotYet: 'Оплата пока не подтвердилась. Если деньги уже списались, обнови страницу через минуту.',
    paidNote: 'Оплачено. Шрифт твой: скачивай сколько угодно раз.',
    restored: 'Вернули твою прошлую работу. Она хранится только на этом устройстве.',
    delWork: 'Удалить',
    edLetter: 'Буква',
    edHint: 'Тяни за ручки, чтобы сдвинуть края буквы.',
    edCloseAria: 'Закрыть', edPrevAria: 'Предыдущий вариант', edNextAria: 'Следующий вариант', edGlyphAria: 'Превью буквы',
    edDrop: 'Убрать этот вариант', edReset: 'Сбросить', edApply: 'Применить',
    edBuilt: v => `Построена из «${v.ch}».`,
    edMany: v => `${plural(v.n, 'Нашёлся', 'Нашлось', 'Нашлось')} ${v.n} ${plural(v.n, 'вариант', 'варианта', 'вариантов')}. Выбери лучший.`,
    edOne: 'Нашёлся один вариант.',
    edVar: v => `вариант ${v.i} из ${v.n}`,
    edEmpty: 'Рамка пустая. Раздвинь её края.',
    edEmptyGlyph: 'пусто',
    stOpenFail: 'Фото не открылось. Нужен JPG или PNG. Фото с iPhone в формате HEIC сохрани как JPG.',
    stError: 'Что-то пошло не так при разборе фото. Попробуй другое фото или перезагрузи страницу.',
    stDemo: 'Готовим пример…',
    stSearching: 'Ищем буквы…',
    stNoText: 'Текст не найден. Сними лист ближе и при лучшем свете.',
    stFound: v => `Нашли ${v.found} из ${v.total}` + (v.cut ? ` · разрезано ${v.cut}` : '') +
      (v.low ? ' · часть букв не видна' : '') +
      ({ switched: ` · шаблон: ${t('tpl_' + v.tpl)}`, own: ` · совпал шаблон ${t('tpl_' + v.tpl)}` }[v.note] || ''),
    tpl_latin: 'Latin', tpl_cyrillic: 'Кириллица', tpl_both: 'Обе',
    mmOther: 'На листе написан другой текст, и буквы могли перепутаться. Выбери «Свой текст» и перепиши туда всё, что написано на листе.',
    mmMissing: 'Часть текста на фото не нашлась. Проверь, что на листе есть все строки, или выбери «Свой текст» и перепиши то, что написал.',
    mmBtn: 'Ввести свой текст',
    mmLine: v => `На листе нет строки «${v.line}». Шрифт собран без неё: этих знаков в нём не будет. Допиши строку и сфотографируй лист заново или выбери «Свой текст».`,
    footer: 'inkfont · шрифт сайта: General Sans',
  },
  en: {
    title: 'inkfont — your handwriting as a font',
    desc: 'Write three lines by hand, snap a photo, and get a real .otf font in a minute.',
    langBtn: 'RU', langAria: 'Переключить на русский',
    tips: 'Use a dark pen. Shoot the sheet from straight above, in good light.',
    demoChip: 'Sample sheet', demoCtaText: 'This is a sample.', demoCtaBtn: 'Upload your photo',
    demoTitle: 'How it works', demoS1: 'You write the text on paper', demoS2: 'The site finds each letter', demoS3: 'You get your own font',
    navGo: 'Make a font',
    lead: 'Write three lines by hand and get your own font.',
    startAria: 'Start',
    demoTop: 'or see an example',
    s1h: 'Copy the text by hand',
    s1sub: 'Pick an alphabet. Copy the lines onto paper in print letters.',
    segLatin: 'Latin', segCyr: 'Cyrillic', segBoth: 'Both', segOwn: 'Your own text',
    ownText: 'Type here what you wrote on the sheet',
    s2h: 'Upload a photo',
    s2sub: 'Your photo stays on your device. The site reads it in your browser.',
    dropT: 'Drop your photo here',
    dropP: 'or tap to choose a file',
    demoBtn: 'No sheet at hand? Try sample handwriting',
    s3h: 'Check the letters',
    s3sub: 'If a letter came out wrong, tap it and fix it.',
    legend: 'Dashed frame: the site made this sign itself — from its capital or small pair, or from other signs, like a dash from a hyphen. Beige: the sign is not in the photo.',
    missingTile: 'This letter is not in the photo',
    s4h: 'Done',
    s4sub: 'Type something to see your font.',
    s4subDemo: 'This font comes from the sample. Upload your photo to make your own.',
    lblName: 'Name', lblSize: 'Size', lblTrack: 'Spacing',
    buyNote: 'Pay once. The .otf file is yours to keep.',
    buyBtn: 'Download font',
    buyPay: 'Buy and download',
    paidBtn: 'Download font',
    payBusy: 'Opening the payment page…',
    payFail: 'The payment page didn’t open. Check your connection and try again.',
    payCheck: 'Checking your payment…',
    payNotYet: 'The payment isn’t confirmed yet. If you were charged, reload the page in a minute.',
    paidNote: 'Paid. The font is yours: download it as many times as you like.',
    restored: 'We brought back your last work. It is stored only on this device.',
    delWork: 'Delete',
    edLetter: 'Letter',
    edHint: 'Drag the handles to move the letter’s edges.',
    edCloseAria: 'Close', edPrevAria: 'Previous version', edNextAria: 'Next version', edGlyphAria: 'Letter preview',
    edDrop: 'Remove this version', edReset: 'Reset', edApply: 'Apply',
    edBuilt: v => `Built from “${v.ch}”.`,
    edMany: v => `Found ${v.n} versions. Pick the best one.`,
    edOne: 'Found one version.',
    edVar: v => `version ${v.i} of ${v.n}`,
    edEmpty: 'The frame is empty. Widen its edges.',
    edEmptyGlyph: 'empty',
    stOpenFail: 'The photo didn’t open. Use JPG or PNG. Save iPhone HEIC photos as JPG.',
    stError: 'Something went wrong while reading the photo. Try another photo or reload the page.',
    stDemo: 'Preparing the sample…',
    stSearching: 'Looking for letters…',
    stNoText: 'No text found. Shoot the sheet closer, in better light.',
    stFound: v => `Found ${v.found} of ${v.total}` + (v.cut ? ` · ${v.cut} cut` : '') +
      (v.low ? ' · some letters missing' : '') +
      ({ switched: ` · template: ${t('tpl_' + v.tpl)}`, own: ` · matched ${t('tpl_' + v.tpl)}` }[v.note] || ''),
    tpl_latin: 'Latin', tpl_cyrillic: 'Cyrillic', tpl_both: 'Both',
    mmOther: 'Your sheet has different text, so letters may be mixed up. Choose “Your own text” and type everything written on the sheet.',
    mmMissing: 'Part of the text is missing from the photo. Check that every line is on the sheet, or choose “Your own text” and type what you wrote.',
    mmBtn: 'Type my own text',
    mmLine: v => `The line “${v.line}” isn’t on your sheet. The font is built without it, so those signs won’t be in it. Add the line and take a new photo, or choose “Your own text”.`,
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
