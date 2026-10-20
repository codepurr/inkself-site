/* Работа хранится только на этом устройстве (IndexedDB браузера): фото листа, текст, правки букв, покупка.
   После перезагрузки или возврата со страницы оплаты сайт разбирает то же фото заново и повторяет правки.
   Правки привязаны к месту буквы в тексте (item.idx), поэтому не зависят от порядка вариантов. */
const WORK = (() => {
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((ok, fail) => {
    const r = indexedDB.open('inkfont', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('work');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  }));
  const run = async (mode, fn) => {
    const d = await db();
    return new Promise((ok, fail) => {
      const t = d.transaction('work', mode), req = fn(t.objectStore('work'));
      t.oncomplete = () => ok(req.result);
      t.onerror = () => fail(t.error);
    });
  };
  // в приватном окне или без места хранилище может не работать — тогда сайт просто ничего не помнит
  return {
    get: () => run('readonly', s => s.get('current')).catch(() => null),
    put: v => run('readwrite', s => s.put(v, 'current')).catch(() => {}),
    clear: () => run('readwrite', s => s.delete('current')).catch(() => {}),
  };
})();

// правки окна буквы: cut — новые границы, drop — убрать вариант, choose — основной вариант
function applyEdits(edits) {
  const W = state.W;
  for (const e of edits || []) {
    const list = state.instances[e.ch]; if (!list) continue;
    const i = list.findIndex(x => x.item.idx === e.pos); if (i < 0) continue;
    if (e.op === 'drop' && list.length > 1) { list.splice(i, 1); state.choice[e.ch] = 0; }
    else if (e.op === 'choose') state.choice[e.ch] = i;
    else if (e.op === 'cut') {
      const it = list[i].item, L = state.analysis.lines[it.line];
      const off = new Set(e.off || []), n = recut(it, e.a, e.b, L, W, off), inst = n && traceItem(n, L, W);
      if (inst) { n.orig = it.orig || sxRange(it.px, L); n.off = [...off]; inst.item = n; list[i] = inst; }
    }
  }
}

function logEdit(e) {
  if (!state.work) return;
  state.work.edits.push(e);
  saveWork();
}

let saveTimer = null;
function saveWork() {
  if (!state.work) return Promise.resolve();
  clearTimeout(saveTimer);
  return new Promise(ok => { saveTimer = setTimeout(() => WORK.put(state.work).then(ok), 300); });
}
