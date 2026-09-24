/* ===== РЕЖИМ РЕВЬЮ =====
   Две вещи поверх прототипа, ничего внутри app.js не трогаем:
   1) переключатель экрана: телефон / горизонтальный планшет (рамка устройства);
   2) комментарии-пины «как в Фигме»: точка на экране + текст, список — в правой панели.

   Хранение — сервер комментариев, в localStorage лежат копия и очередь неотправленного.
   Привязка пина: (экран, режим устройства, ближайший скроллящийся контейнер,
   координаты в его контенте). Поэтому пин не уезжает при прокрутке списков. */
(function () {
  'use strict';

  // Два режима, оба горизонтальные: телефон и планшет (решение владельца от
  // 21 сентября 2026 года; вертикальные телефон 'mobile' и планшет 'tablet-v'
  // убраны). Ключ 'tablet' менять нельзя: на него ссылаются уже поставленные
  // комментарии. Комментарии, поставленные в убранных режимах, остаются в
  // хранилище, но на макете больше не показываются.
  var DEVICES = {
    // ︎ — просим текстовое начертание стрелки, а не эмодзи-картинку.
    'mobile-h': { w: 844,  h: 390, label: 'Телефон ↔︎', icon: '📱', hint: '844 × 390' },
    tablet:     { w: 1194, h: 834, label: 'Планшет ↔︎', icon: '🖥', hint: '1194 × 834' }
  };

  // Режим ?comments=local держит свою копию и свою очередь: иначе тестовые правки
  // для местного сервера при следующем обычном открытии уехали бы в общую стопку.
  var LS_SUFFIX = isLocalPage() && wantsLocalComments() ? '-local' : '';
  var LS_COMMENTS = 'razgovor-comments-v1' + LS_SUFFIX;   // локальная копия (страховка)
  var LS_UI = 'razgovor-review-ui-v1';
  var LS_QUEUE = 'razgovor-comments-queue-v1' + LS_SUFFIX; // что не доехало до сервера
  var LS_IDMAP = 'razgovor-comments-idmap-v1' + LS_SUFFIX; // локальный id → серверный
  var LS_AUTHOR = 'razgovor-review-author-v1';

  // Экраны без своего заголовка в разметке; остальные подписываются по заголовку.
  var SCREEN_TITLES = {
    'aac-main': 'Главный экран',
    'menu-screen': 'Меню',
    'search-screen': 'Поиск',
    'pick-screen': 'Выбор из списка'
  };

  // ---------- состояние ----------
  var state = {
    on: false,
    device: 'mobile-h',
    panelOpen: true,
    pinsHidden: false,   // пины сняты с макета — смотрим прототип «как есть»
    filter: 'open',
    adding: false,
    focusId: null,
    openId: null,
    draft: null,
    comments: []
  };

  var frame, viewport, pinsLayer, toolbar, panel, listEl, countEls = [], hintEl;

  // ---------- хранилище ----------
  // Сервер — источник правды (комментарии общие для всех, кто открыл ссылку).
  // Любая правка сначала применяется на месте и пишется в localStorage, а потом
  // уходит на сервер через очередь: пропала сеть — ничего не теряется, очередь
  // доедет сама, когда связь вернётся.
  var store = {
    mode: 'local',   // 'server' — есть API, 'local' — статичный хостинг/файл
    degraded: false, // сервер был, но сейчас не отвечает
    lsBroken: false, // браузер отказался сохранять (память заполнена)
    author: ''
  };

  function lsGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  function localComments() {
    var arr = lsGet(LS_COMMENTS, []);
    return Array.isArray(arr) ? arr : [];
  }
  function saveComments() { lsSet(LS_COMMENTS, state.comments); }

  // Очередь живёт в localStorage, а не только в памяти вкладки: две открытые
  // вкладки пишут в одну очередь и не затирают правки друг друга. У каждой
  // операции свой opId — по нему её и вычёркивают после отправки.
  var queue = [];
  var idMap = {};
  function saveQueue() {
    store.lsBroken = !lsSet(LS_QUEUE, queue);
    lsSet(LS_IDMAP, idMap);
  }
  function readQueue() {
    if (store.lsBroken) return queue;              // хранилище врёт — верим памяти
    var q = lsGet(LS_QUEUE, null);
    var m = lsGet(LS_IDMAP, null);
    if (m && typeof m === 'object') for (var k in m) if (!idMap[k]) idMap[k] = m[k];
    return Array.isArray(q) ? q : queue;
  }
  function realId(id) { return idMap[id] || id; }

  // Комментарии лежат там, откуда открыт макет: на своей машине — на своём сервере,
  // на боевом адресе — нигде, потому что там только файлы и сервера нет. Общего
  // хранилища на стороне больше нет: 24 сентября 2026 года мы ушли с Railway, куда
  // прототип ходил за общей стопкой. Вернуть общие комментарии = поднять сервер там,
  // откуда он открывается и в России, — это отдельная задача.
  function apiUrl(p) {
    // Относительный путь — работает и в корне домена, и в подкаталоге.
    return new URL(p, location.href.replace(/[^/]*$/, '')).toString();
  }
  function apiFetch(p, opts) {
    var o = opts || {};
    o.cache = 'no-store';
    if (o.body) o.headers = { 'Content-Type': 'application/json' };
    // Зависший запрос не должен держать очередь вечно.
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 20000) : null;
    if (ctl) o.signal = ctl.signal;
    return fetch(apiUrl(p), o).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) { var err = new Error('HTTP ' + r.status); err.status = r.status; throw err; }
      return r.json();
    }, function (e) { clearTimeout(timer); throw e; });
  }
  /** Сервер отказал насовсем (комментарий уже удалили, пустой текст): повтор не поможет. */
  function isPermanent(err) {
    var st = err && err.status;
    return st >= 400 && st < 500 && st !== 408 && st !== 429;
  }

  /** Первая загрузка: пробуем сервер, иначе живём локально. */
  function initStore() {
    queue = lsGet(LS_QUEUE, []);
    if (!Array.isArray(queue)) queue = [];
    idMap = lsGet(LS_IDMAP, {}) || {};
    // Операции из прежних версий приходят без opId — выдаём, чтобы их можно было вычеркнуть.
    var patched = false;
    queue.forEach(function (op) { if (!op.opId) { op.opId = newId(); patched = true; } });
    if (patched) saveQueue();
    store.author = (lsGet(LS_AUTHOR, '') || '').toString().slice(0, 60);
    state.comments = localComments();
    return apiFetch('api/comments').then(function (arr) {
      store.mode = 'server';
      store.degraded = false;
      if (queue.length) return flushQueue();      // сначала досылаем несохранённое
      state.comments = Array.isArray(arr) ? arr : [];
      saveComments();
    }).catch(function () {
      store.mode = 'local';                        // сервера нет — только этот браузер
    });
  }

  /** Свежие данные с сервера (опрос + после отправки очереди). */
  function refresh() {
    if (store.mode !== 'server' || flushing || readQueue().length) return Promise.resolve();
    var gen = editGen;
    return apiFetch('api/comments').then(function (arr) {
      store.degraded = false;
      if (!Array.isArray(arr)) return;
      // Пока ответ шёл, здесь что-то поправили: ответ уже устарел и вернул бы
      // удалённое или отменил «решено». Свежее придёт следующим опросом.
      if (gen !== editGen || readQueue().length) return;
      remapOpen();
      var changed = JSON.stringify(arr) !== JSON.stringify(state.comments);
      state.comments = arr;
      saveComments();
      if (changed) { renderPins(); renderPanel(); }
      else renderStatus();
    }).catch(function () {
      store.degraded = true;
      renderStatus();
    });
  }

  /** Отправка накопленных операций по порядку. Сбой связи — прерываемся и повторим
   *  позже. Отказ сервера насовсем — операцию выбрасываем, иначе она заперла бы
   *  очередь навсегда. Отправка всегда одна: второй вызов ждёт первую. */
  var flushing = null;
  var editGen = 0;
  function flushQueue() {
    if (flushing) return flushing;
    flushing = sendAll().then(function () {
      flushing = null;
      if (!queue.length) return refresh();
      renderStatus();
    });
    return flushing;
  }
  function sendAll() {
    queue = readQueue();
    if (store.mode !== 'server' || !queue.length) return Promise.resolve();
    var op = queue[0];
    return sendOp(op).then(function () {
      store.degraded = false;
      dropOp(op);
      return sendAll();
    }, function (err) {
      if (isPermanent(err)) { dropOp(op); return sendAll(); }
      store.degraded = true;                       // не выбрасываем: попробуем ещё раз
    });
  }
  function dropOp(op) {
    queue = readQueue().filter(function (o) { return o.opId !== op.opId; });
    saveQueue();
  }
  /** Если id комментария сменился на серверный, открытое окошко идёт за ним. */
  function remapOpen() {
    if (state.openId && idMap[state.openId]) state.openId = idMap[state.openId];
    if (state.focusId && idMap[state.focusId]) state.focusId = idMap[state.focusId];
  }
  function sendOp(op) {
    var req;
    var base = 'api/comments/' + encodeURIComponent(realId(op.id));
    if (op.op === 'create') {
      req = apiFetch('api/comments', { method: 'POST', body: JSON.stringify(op.rec) })
        .then(function (rec) { idMap[op.rec.id] = rec.id; });
    } else if (op.op === 'patch') {
      req = apiFetch(base, { method: 'PATCH', body: JSON.stringify(op.patch) });
    } else if (op.op === 'reply') {
      // id ответа задаём мы — повторная отправка не создаст дубликат.
      req = apiFetch(base + '/replies', { method: 'POST', body: JSON.stringify(op.reply) });
    } else if (op.op === 'editreply') {
      req = apiFetch(base + '/replies/' + encodeURIComponent(op.rid), {
        method: 'PATCH', body: JSON.stringify({ text: op.text })
      });
    } else if (op.op === 'unreply') {
      req = apiFetch(base + '/replies/' + encodeURIComponent(op.rid), { method: 'DELETE' });
    } else {
      req = apiFetch(base, { method: 'DELETE' });
    }
    return req;
  }

  function pushOp(op) {
    // Копим всегда, даже если сервера сейчас нет: как только он появится,
    // очередь уедет сама. Ограничение — просто предохранитель от бесконечного роста.
    editGen++;
    op.opId = newId();
    queue = readQueue();
    queue.push(op);
    if (queue.length > 1000) queue.splice(0, queue.length - 1000);
    saveQueue();
    flushQueue();
  }

  /** Сервер не ответил при загрузке — тихо проверяем, не появился ли он. */
  function watchForServer() {
    setInterval(function () {
      if (store.mode === 'server') return;
      apiFetch('api/comments').then(function () {
        store.mode = 'server';
        store.degraded = false;
        return queue.length ? flushQueue() : refresh();
      }).then(function () {
        renderPins(); renderPanel();
      }).catch(function () { /* сервера всё ещё нет */ });
    }, 15000);
  }

  function loadUI() {
    try { return JSON.parse(localStorage.getItem(LS_UI) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveUI() {
    try {
      localStorage.setItem(LS_UI, JSON.stringify({
        device: state.device, panelOpen: state.panelOpen,
        pinsHidden: state.pinsHidden, filter: state.filter
      }));
    } catch (e) {}
  }
  function newId() {
    try { return crypto.randomUUID(); } catch (e) { return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  }

  // ---------- помощники по DOM прототипа ----------
  // Меню, настройки и поиск открываются панелью поверх доски, и доска под ними
  // тоже остаётся «активной». Экран комментария — верхний: панель, если открыта.
  function activeScreenId() {
    var act = document.querySelectorAll('#phoneScreen .screen.active');
    for (var i = act.length - 1; i >= 0; i--) if (act[i].id !== 'aac-main') return act[i].id;
    return act.length ? act[0].id : '';
  }
  function screenTitle(id) {
    if (SCREEN_TITLES[id]) return SCREEN_TITLES[id];
    var sc = document.getElementById(id);
    if (id && !sc) return 'Убранный экран (' + id + ')';
    var h = sc && sc.querySelector('h2, .onboarding-title, .intro-heading');
    var t = h && h.textContent.trim();
    return t || id || 'Экран';
  }
  /** Путь до элемента внутри рамки — переживает перерисовку списков (структура та же). */
  function elPath(el) {
    if (!el || el === frame) return null;
    var parts = [];
    var node = el;
    while (node && node !== frame && node.nodeType === 1) {
      if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
      var p = node.parentNode;
      if (!p) break;
      var i = 1, sib = node;
      while ((sib = sib.previousElementSibling)) i++;
      parts.unshift(node.tagName.toLowerCase() + ':nth-child(' + i + ')');
      node = p;
    }
    return parts.length ? parts.join('>') : null;
  }
  function resolvePath(path) {
    if (!path) return null;
    try { return frame.querySelector(path); } catch (e) { return null; }
  }
  /** Ближайший прокручиваемый предок внутри рамки. */
  function scrollerOf(el) {
    var node = el;
    while (node && node !== frame && node.nodeType === 1) {
      var cs = getComputedStyle(node);
      var scrollableY = /(auto|scroll)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight + 2;
      if (scrollableY) return node;
      node = node.parentNode;
    }
    return null;
  }
  /** Короткое описание того, куда поставлен пин — чтобы карточка в панели была понятной. */
  function describe(el) {
    var host = el && el.closest(
      '.picto-card, .core-btn, .pred-card, .strip-item, .mode-card, .role-card, .form-chip, ' +
      '.cg-item, .set-row, button, a, li, h1, h2, h3, h4, p, label'
    );
    var node = host || el;
    // innerText (а не textContent) — соседние строки не слипаются в одно слово.
    var txt = (node && (node.innerText || node.textContent) || '').replace(/\s+/g, ' ').trim();
    return txt.slice(0, 90);
  }

  // ---------- геометрия ----------
  function scale() {
    var s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rv-scale'));
    return s > 0 ? s : 1;
  }
  function fitScale() {
    if (!state.on) return;
    var d = DEVICES[state.device];
    var cs = getComputedStyle(viewport);
    var availW = viewport.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var availH = viewport.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var s = Math.min(1, availW / d.w, availH / d.h);
    if (!isFinite(s) || s <= 0) s = 1;
    var root = document.documentElement.style;
    root.setProperty('--rv-w', d.w + 'px');
    root.setProperty('--rv-h', d.h + 'px');
    root.setProperty('--rv-scale', String(s));
    root.setProperty('--rv-inv', String(1 / s));
    var lbl = document.getElementById('rvScaleLabel');
    if (lbl) lbl.textContent = d.hint + ' · ' + Math.round(s * 100) + '%';
  }
  /** Точка клика → координаты в системе рамки (без учёта масштаба). */
  function toFrame(clientX, clientY) {
    var r = frame.getBoundingClientRect();
    var s = scale();
    return { x: (clientX - r.left) / s, y: (clientY - r.top) / s };
  }
  /** Где рисовать пин: возвращает {x, y, visible}. */
  function pinPos(c) {
    if (!c.scroller) return { x: c.x, y: c.y, visible: true };
    var sc = resolvePath(c.scroller);
    // Списка, к которому привязан пин, больше нет: его координаты считаны внутри
    // списка, и на макете пин встал бы мимо. Прячем; в панели он остаётся.
    if (!sc) return { x: c.x, y: c.y, visible: false, lost: true };
    var fr = frame.getBoundingClientRect();
    var sr = sc.getBoundingClientRect();
    var s = scale();
    var ox = (sr.left - fr.left) / s, oy = (sr.top - fr.top) / s;
    var x = ox + c.x - sc.scrollLeft;
    var y = oy + c.y - sc.scrollTop;
    var visible = y > oy - 14 && y < oy + sc.clientHeight + 14;
    return { x: x, y: y, visible: visible };
  }

  // ---------- разметка режима ревью ----------
  function buildChrome() {
    toolbar = document.getElementById('reviewToolbar');
    toolbar.innerHTML =
      '<div class="rv-brand">Разговор <span>прототип</span></div>' +
      '<div class="rv-seg" id="rvSeg">' +
        Object.keys(DEVICES).map(function (k) {
          return '<button type="button" data-device="' + k + '">' +
            DEVICES[k].icon + ' ' + DEVICES[k].label + '</button>';
        }).join('') +
      '</div>' +
      '<button type="button" class="rv-btn" id="rvRestartBtn" title="Открыть прототип так, будто его запустили впервые">Начать сначала</button>' +
      '<span class="rv-scale-label" id="rvScaleLabel"></span>' +
      '<div class="rv-spacer"></div>' +
      '<button type="button" class="rv-btn primary" id="rvAddBtn">＋ Комментарий</button>' +
      '<button type="button" class="rv-btn" id="rvPinsBtn" title="Скрыть пины на макете (H)">👁 Пины</button>' +
      '<button type="button" class="rv-btn" id="rvPanelBtn">💬 Все <span class="rv-badge" data-count>0</span></button>';

    panel = document.getElementById('reviewPanel');
    panel.innerHTML =
      '<div class="rv-panel-head">' +
        '<h2>Комментарии</h2><span class="rv-badge" data-count>0</span>' +
        '<div class="rv-spacer"></div>' +
        '<button type="button" class="rv-icon-btn" id="rvPanelClose" aria-label="Закрыть">✕</button>' +
      '</div>' +
      '<div class="rv-status" id="rvStatus"></div>' +
      '<div class="rv-filters" id="rvFilters">' +
        '<button type="button" data-filter="open">Открытые</button>' +
        '<button type="button" data-filter="resolved">Решённые</button>' +
        '<button type="button" data-filter="all">Все</button>' +
      '</div>' +
      '<div class="rv-list" id="rvList"></div>' +
      '<div class="rv-author">' +
        '<label for="rvAuthor">Подписывать как</label>' +
        '<input id="rvAuthor" type="text" maxlength="60" placeholder="ваше имя">' +
      '</div>';

    listEl = document.getElementById('rvList');
    countEls = [].slice.call(document.querySelectorAll('[data-count]'));

    document.getElementById('rvSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-device]');
      if (b) setDevice(b.dataset.device);
    });
    document.getElementById('rvAddBtn').addEventListener('click', function () {
      // Ставить пин вслепую нельзя — если они спрятаны, сначала возвращаем.
      if (!state.adding && state.pinsHidden) setPinsHidden(false);
      setAdding(!state.adding);
    });
    document.getElementById('rvPinsBtn').addEventListener('click', function () { setPinsHidden(!state.pinsHidden); });
    document.getElementById('rvPanelBtn').addEventListener('click', function () { setPanel(!state.panelOpen); });
    document.getElementById('rvRestartBtn').addEventListener('click', onRestartClick);
    document.getElementById('rvPanelClose').addEventListener('click', function () { setPanel(false); });
    document.getElementById('rvFilters').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-filter]');
      if (b) { state.filter = b.dataset.filter; saveUI(); renderPanel(); }
    });

    var authorInput = document.getElementById('rvAuthor');
    authorInput.value = store.author || '';
    authorInput.addEventListener('input', function () {
      store.author = authorInput.value.slice(0, 60);
      lsSet(LS_AUTHOR, store.author);
    });
  }

  // ---------- переключатели ----------
  function setReview(on) {
    state.on = !!on;
    document.body.setAttribute('data-review', on ? 'on' : 'off');
    if (!on) setAdding(false);
    setPanel(state.panelOpen);
    fitScale();
    renderPins();
    saveUI();
  }
  function setDevice(mode) {
    if (!DEVICES[mode]) return;
    state.device = mode;
    document.body.setAttribute('data-device', mode);
    [].forEach.call(toolbar.querySelectorAll('[data-device]'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.device === mode));
    });
    fitScale();
    // Боковой столбец подгоняется под высоту при отрисовке, поэтому после смены
    // рамки просим приложение перерисоваться так же, как при повороте устройства.
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    renderPins();
    renderPanel();
    saveUI();
  }
  // ---------- «Начать сначала» ----------
  // Показывает прототип таким, каким его увидит человек, открывший приложение впервые:
  // стирает сохранённое состояние приложения и перезагружает страницу. Комментарии
  // ревью, имя автора и настройки самого режима при этом остаются на месте. Адрес
  // «?reset=1» сносит больше (все ключи приложения и кэш), но ревью тоже не трогает.
  //
  // Подтверждение сделано вторым нажатием на ту же кнопку, а не окном браузера: окно
  // здесь чужеродно, а случайно стереть настроенный словарь не хочется.
  var APP_KEYS = ['razgovor_state_v1', 'razgovor-model-nudge-v1'];
  var restartArmed = false, restartTimer = null;
  function disarmRestart() {
    restartArmed = false;
    clearTimeout(restartTimer);
    var b = document.getElementById('rvRestartBtn');
    if (b) { b.textContent = 'Начать сначала'; b.classList.remove('armed'); }
  }
  function onRestartClick() {
    var b = document.getElementById('rvRestartBtn');
    if (!restartArmed) {
      restartArmed = true;
      if (b) { b.textContent = 'Стереть и начать?'; b.classList.add('armed'); }
      restartTimer = setTimeout(disarmRestart, 6000);   // время прочитать вопрос и решить
      return;
    }
    disarmRestart();
    // Флаг обязателен: без него приложение при уходе со страницы допишет текущее
    // состояние обратно в хранилище, и сброс не состоится.
    try { window.__resetting = true; } catch (e) {}
    try {
      APP_KEYS.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
    location.reload();
  }

  // Отступ под панель меняется плавно, и сразу после переключения его ещё не
  // видно. Поэтому масштаб рамки пересчитываем и в конце этого перехода.
  function onViewportTransition(e) {
    if (e.target === viewport && e.propertyName === 'padding-right') { fitScale(); renderPins(); }
  }

  function setPanel(open) {
    state.panelOpen = !!open;
    document.body.classList.toggle('rv-panel-open', state.on && state.panelOpen);
    document.documentElement.style.setProperty(
      '--rv-panel-w',
      (state.on && state.panelOpen && window.innerWidth > 720) ? '340px' : '0px'
    );
    requestAnimationFrame(function () { fitScale(); renderPins(); });
    saveUI();
    renderPanel();
  }
  // Пины прячутся только с макета: комментарии никуда не деваются, панель справа
  // работает как обычно. Это режим «посмотреть прототип чистым», а не «выключить
  // ревью» — поэтому состояние живёт в UI-настройках и переживает перезагрузку.
  function setPinsHidden(hidden) {
    state.pinsHidden = !!hidden;
    if (state.pinsHidden) {
      setAdding(false);
      if (state.draft) cancelDraft();   // черновик без пина превратился бы в невидимку
      state.openId = null;
      state.focusId = null;
    }
    document.body.classList.toggle('rv-pins-hidden', state.pinsHidden);
    var b = document.getElementById('rvPinsBtn');
    if (b) {
      b.textContent = state.pinsHidden ? '👁 Пины скрыты' : '👁 Пины';
      b.classList.toggle('off', state.pinsHidden);
      b.title = (state.pinsHidden ? 'Показать пины на макете' : 'Скрыть пины на макете') + ' (H)';
    }
    renderPins();
    renderPanel();
    saveUI();
  }
  function setAdding(on) {
    state.adding = !!on;
    document.body.classList.toggle('rv-adding', state.adding);
    var b = document.getElementById('rvAddBtn');
    if (b) {
      b.textContent = state.adding ? '✕ Отменить' : '＋ Комментарий';
      b.classList.toggle('primary', !state.adding);
    }
  }

  // ---------- добавление пина ----------
  function onFrameCapture(e) {
    if (!state.on) return;
    if (e.target.closest('#reviewPins')) return;
    // Пин ставится по pointerdown, но прототип слушает click/mousedown/touchstart —
    // гасим весь «хвост» жеста, иначе тап заодно нажмёт кнопку под пином.
    if (state.swallow) {
      e.preventDefault();
      e.stopPropagation();
      // Мышь заканчивает жест кликом. Касание — отпусканием пальца: клика после
      // него не будет, мы его уже отменили на touchstart.
      if (e.type === 'click' || e.type === 'touchend') state.swallow = false;
      return;
    }
    if (!state.adding) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type !== 'pointerdown' && e.type !== 'mousedown') return;
    state.swallow = true;
    setTimeout(function () { state.swallow = false; }, 700);

    var p = toFrame(e.clientX, e.clientY);
    var el = document.elementFromPoint(e.clientX, e.clientY);
    var sc = scrollerOf(el);
    var draft = {
      id: '__draft__',
      screen: activeScreenId(),
      mode: state.device,
      anchor: describe(el),
      scroller: null,
      x: p.x, y: p.y,
      text: '', resolved: false
    };
    if (sc) {
      var fr = frame.getBoundingClientRect(), sr = sc.getBoundingClientRect(), s = scale();
      draft.scroller = elPath(sc);
      draft.x = p.x - (sr.left - fr.left) / s + sc.scrollLeft;
      draft.y = p.y - (sr.top - fr.top) / s + sc.scrollTop;
      if (!draft.scroller) { draft.x = p.x; draft.y = p.y; }
    }
    state.draft = draft;
    state.openId = '__draft__';
    setAdding(false);
    renderPins();
  }

  function commitDraft(text) {
    var d = state.draft;
    if (!d || !text.trim()) return;
    var rec = {
      id: newId(),
      screen: d.screen, mode: d.mode, anchor: d.anchor,
      scroller: d.scroller, x: d.x, y: d.y,
      text: text.trim(), author: store.author || null, resolved: false,
      createdAt: new Date().toISOString()
    };
    state.comments.push(rec);
    saveComments();
    pushOp({ op: 'create', rec: rec });
    state.draft = null;
    state.openId = null;
    renderPins();
    renderPanel();
  }
  function cancelDraft() {
    state.draft = null;
    if (state.openId === '__draft__') state.openId = null;
    renderPins();
  }

  function updateComment(id, patch) {
    var c = state.comments.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var sent = {};
    if (typeof patch.text === 'string' && patch.text !== c.text) {
      c.text = patch.text;
      c.updatedAt = new Date().toISOString();
      sent.text = patch.text;
    }
    if (typeof patch.resolved === 'boolean') {
      c.resolved = patch.resolved;
      c.resolvedAt = patch.resolved ? new Date().toISOString() : null;
      sent.resolved = patch.resolved;
    }
    saveComments();
    if (Object.keys(sent).length) pushOp({ op: 'patch', id: id, patch: sent });
    renderPins(); renderPanel();
  }
  function removeComment(id) {
    state.comments = state.comments.filter(function (c) { return c.id !== id; });
    if (state.openId === id) state.openId = null;
    saveComments();
    pushOp({ op: 'delete', id: id });
    renderPins(); renderPanel();
  }

  // ---------- ответы внутри пина ----------
  function byId(id) {
    return state.comments.filter(function (c) { return c.id === id; })[0];
  }
  function addReply(id, text) {
    var c = byId(id);
    if (!c || !text.trim()) return;
    if (!Array.isArray(c.replies)) c.replies = [];
    var reply = {
      id: 'r_' + newId(),
      text: text.trim(),
      author: store.author || null,
      createdAt: new Date().toISOString()
    };
    c.replies.push(reply);
    saveComments();
    pushOp({ op: 'reply', id: id, reply: reply });
    renderPins(); renderPanel();
  }
  function editReply(id, rid, text) {
    var c = byId(id);
    if (!c) return;
    var r = repliesOf(c).filter(function (x) { return x.id === rid; })[0];
    if (!r) return;
    r.text = text;
    saveComments();
    pushOp({ op: 'editreply', id: id, rid: rid, text: text });
    renderPins(); renderPanel();
  }
  function removeReply(id, rid) {
    var c = byId(id);
    if (!c) return;
    c.replies = repliesOf(c).filter(function (x) { return x.id !== rid; });
    saveComments();
    pushOp({ op: 'unreply', id: id, rid: rid });
    renderPins(); renderPanel();
  }

  // ---------- отрисовка пинов ----------
  // ВАЖНО: слой не пересобирается целиком. Пины живут между перерисовками, и
  // открытое окошко с текстом НЕ трогается — иначе набранный комментарий
  // стирался бы каждый раз, когда прототип что-то перерисовал, приехал ответ
  // сервера или экран прокрутили (renderPins зовётся часто).
  var pinCache = {};   // id → { wrap, open, sig }

  /** Приметы, при смене которых пин надо пересобрать. У открытого пина текст
   *  в приметы не входит: его как раз сейчас правит человек. Номер тоже — он
   *  меняется, когда кто-то другой добавил комментарий, и это не повод
   *  выбрасывать набранное (номер обновляем на месте). */
  function pinSignature(c, num, open) {
    return open
      ? ['open', c.resolved ? 1 : 0, c.author || ''].join('|')
      : [c.text || '', c.resolved ? 1 : 0, c.author || '', num, repliesOf(c).length].join('|');
  }

  function renderPins() {
    if (!pinsLayer) return;
    if (!state.on || state.pinsHidden) {
      pinsLayer.innerHTML = '';
      pinCache = {};
      return;
    }
    var screen = activeScreenId();
    var items = state.comments.filter(function (c) {
      if (c.screen !== screen || c.mode !== state.device) return false;
      var byFilter = state.filter === 'all' ? true : state.filter === 'resolved' ? c.resolved : !c.resolved;
      return byFilter || state.openId === c.id || state.focusId === c.id;
    });
    if (state.draft && state.draft.screen === screen && state.draft.mode === state.device) {
      items = items.concat([state.draft]);
    }

    var alive = {};
    items.forEach(function (c, i) {
      var num = i + 1;
      var open = state.openId === c.id;
      var sig = pinSignature(c, num, open);
      var entry = pinCache[c.id];
      alive[c.id] = true;

      if (!entry || entry.open !== open || entry.sig !== sig) {
        // Открытое окошко пересобирается, если кто-то другой отметил ветку
        // решённой: недописанный ответ переносим в новое поле.
        var oldTa = entry && entry.open && open ? entry.wrap.querySelector('.rv-reply-input') : null;
        var wrap = pinNode(c, num);           // содержимое изменилось — пересобираем
        var newTa = oldTa && wrap.querySelector('.rv-reply-input');
        if (newTa && oldTa.value) {
          newTa.value = oldTa.value;
          if (document.activeElement === oldTa) setTimeout(function () { newTa.focus(); }, 0);
        }
        if (entry && entry.wrap.parentNode) pinsLayer.replaceChild(wrap, entry.wrap);
        else pinsLayer.appendChild(wrap);
        pinCache[c.id] = { wrap: wrap, open: open, sig: sig };
      } else {
        placePin(entry.wrap, c, num);         // всё то же — только сдвигаем на место
        if (open) syncThread(entry.wrap, c);  // чужой ответ подхватываем на лету
      }
    });

    Object.keys(pinCache).forEach(function (id) {
      if (alive[id]) return;
      var el = pinCache[id].wrap;
      if (el.parentNode) el.parentNode.removeChild(el);
      delete pinCache[id];
    });
  }

  /** Положение, подсветка и номер — единственное, что меняется у «живого» пина. */
  function placePin(wrap, c, num) {
    var pos = pinPos(c);
    // Окошко высокое, поэтому у нижнего края окна раскрываем его вверх.
    var fr = frame.getBoundingClientRect();
    var lowOnScreen = fr.top + pos.y * scale() > window.innerHeight - 380;
    wrap.className = 'rv-pin' + (c.resolved ? ' resolved' : '') +
      (state.focusId === c.id ? ' focus' : '') +
      (pos.x > DEVICES[state.device].w * 0.55 ? ' flip' : '') +
      (lowOnScreen ? ' up' : '');
    wrap.style.left = pos.x + 'px';
    wrap.style.top = pos.y + 'px';
    wrap.style.display = pos.visible ? '' : 'none';
    var dot = wrap.firstChild;
    if (dot && dot.className.indexOf('rv-dot') === 0) {
      if (!c.resolved) dot.textContent = String(num);
      var n = repliesOf(c).length;          // метка «сколько сообщений в ветке»
      dot.classList.toggle('threaded', n > 0);
      if (n > 0) dot.dataset.count = String(1 + n); else delete dot.dataset.count;
    }
    return pos;
  }

  function pinNode(c, num) {
    var draft = c.id === '__draft__';
    var open = state.openId === c.id;
    var wrap = document.createElement('div');
    var pos = placePin(wrap, c, num);

    var dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'rv-dot';
    var nReplies = repliesOf(c).length;
    dot.textContent = c.resolved ? '✓' : String(num);
    dot.title = (c.text ? c.text.slice(0, 120) : 'Новый комментарий') +
      (nReplies ? '\n(в ветке ещё ' + nReplies + ')' : '');
    dot.addEventListener('click', function (e) {
      e.stopPropagation();
      if (draft) return;
      state.openId = open ? null : c.id;
      state.focusId = c.id;
      renderPins(); renderPanel();
    });
    wrap.appendChild(dot);
    placePin(wrap, c, num);   // ещё раз: метку ветки ставим уже по готовой точке

    if (open) wrap.appendChild(draft ? draftPopover() : popover(c));
    return wrap;
  }

  /** Один пин — ветка обсуждения: первое сообщение и ответы к нему. */
  function popover(c) {
    var pop = document.createElement('div');
    pop.className = 'rv-pop';
    pop.addEventListener('click', function (e) { e.stopPropagation(); });
    pop.addEventListener('pointerdown', function (e) { e.stopPropagation(); });

    var head = document.createElement('div');
    head.className = 'rv-pop-head';
    head.innerHTML = '<span>Обсуждение · ' + (1 + repliesOf(c).length) + '</span><div class="rv-spacer"></div>';
    var resolveBtn = mkIconBtn(c.resolved ? '✓ Решён' : '✓ Решить', function () {
      updateComment(c.id, { resolved: !c.resolved });
    });
    if (c.resolved) resolveBtn.style.color = 'var(--rv-ok)';
    var delBtn = mkIconBtn('🗑', function () {
      if (repliesOf(c).length && !confirm('Удалить всю ветку вместе с ответами?')) return;
      removeComment(c.id);
    });
    delBtn.classList.add('danger');
    delBtn.title = 'Удалить всю ветку';
    head.appendChild(resolveBtn); head.appendChild(delBtn);
    pop.appendChild(head);

    if (c.anchor) {
      var a = document.createElement('div');
      a.className = 'rv-anchor';
      a.textContent = 'у элемента: «' + c.anchor + '»';
      pop.appendChild(a);
    }

    var thread = document.createElement('div');
    thread.className = 'rv-thread';
    pop.appendChild(thread);
    fillThread(thread, c);

    var ta = document.createElement('textarea');
    ta.className = 'rv-reply-input';
    ta.placeholder = 'Ответить…';
    pop.appendChild(ta);

    var actions = document.createElement('div');
    actions.className = 'rv-pop-actions';
    actions.appendChild(mkBtn('Ответить', 'primary', function () {
      if (!ta.value.trim()) return;
      addReply(c.id, ta.value);
      ta.value = '';
    }));
    actions.appendChild(mkBtn('Закрыть', '', function () { state.openId = null; renderPins(); }));
    pop.appendChild(actions);

    ta.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && ta.value.trim()) {
        addReply(c.id, ta.value);
        ta.value = '';
      }
    });
    return pop;
  }

  function repliesOf(c) {
    return Array.isArray(c.replies) ? c.replies : [];
  }

  /** Обновить список сообщений в уже открытом окошке, не трогая поле ввода. */
  function syncThread(wrap, c) {
    var thread = wrap.querySelector('.rv-thread');
    if (!thread) return;
    if (thread.querySelector('.rv-msg-edit')) return;   // сейчас правят сообщение — не мешаем
    if (thread.dataset.sig === threadSig(c)) return;
    fillThread(thread, c);
    var head = wrap.querySelector('.rv-pop-head span');
    if (head) head.textContent = 'Обсуждение · ' + (1 + repliesOf(c).length);
  }
  /** Приметы ветки: по ним видно, что список сообщений изменился. */
  function threadSig(c) {
    return [c.text || '', c.author || ''].concat(
      repliesOf(c).map(function (r) { return r.id + ':' + (r.text || ''); })
    ).join('§');
  }

  /** Список сообщений ветки. Перерисовывается отдельно от поля ввода —
   *  чужой ответ, приехавший во время набора, не мешает писать. */
  function fillThread(thread, c) {
    thread.innerHTML = '';
    thread.dataset.sig = threadSig(c);

    var msgs = [{ id: null, text: c.text, author: c.author, createdAt: c.createdAt, root: true }]
      .concat(repliesOf(c));

    msgs.forEach(function (m) {
      var box = document.createElement('div');
      box.className = 'rv-msg' + (m.root ? ' root' : '');

      var meta = document.createElement('div');
      meta.className = 'rv-msg-meta';
      meta.innerHTML = (m.author ? '<span class="rv-who">' + escapeHtml(m.author) + '</span>' : '<span>Без подписи</span>') +
        '<span>' + fmtDate(m.createdAt) + '</span><div class="rv-spacer"></div>';

      var edit = mkIconBtn('✎', function () { editMessage(thread, c, m); });
      edit.title = 'Изменить';
      meta.appendChild(edit);
      if (!m.root) {
        var del = mkIconBtn('🗑', function () { removeReply(c.id, m.id); });
        del.classList.add('danger');
        del.title = 'Удалить ответ';
        meta.appendChild(del);
      }
      box.appendChild(meta);

      var body = document.createElement('div');
      body.className = 'rv-msg-text';
      body.textContent = m.text;
      box.appendChild(body);

      thread.appendChild(box);
    });
  }

  /** Правка сообщения прямо в ветке. Открытый редактор всегда один: перед
   *  началом ветку перерисовываем, после сохранения — тоже. */
  function editMessage(thread, c, m) {
    var fresh = function () { return byId(c.id) || c; };
    fillThread(thread, fresh());

    var boxes = [].slice.call(thread.querySelectorAll('.rv-msg'));
    var idx = 0;
    if (!m.root) {
      var at = repliesOf(fresh()).findIndex(function (r) { return r.id === m.id; });
      if (at < 0) return;                 // ответ уже удалили у другого участника
      idx = at + 1;
    }
    var box = boxes[idx];
    if (!box) return;

    var body = box.querySelector('.rv-msg-text');
    var ta = document.createElement('textarea');
    ta.className = 'rv-msg-edit';
    ta.value = m.text || '';
    box.replaceChild(ta, body);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);

    var row = document.createElement('div');
    row.className = 'rv-pop-actions';
    row.appendChild(mkBtn('Сохранить', 'primary', function () {
      if (m.root) updateComment(c.id, { text: ta.value });
      else editReply(c.id, m.id, ta.value);
      fillThread(thread, fresh());        // возвращаем обычный вид
    }));
    row.appendChild(mkBtn('Отмена', '', function () { fillThread(thread, fresh()); }));
    box.appendChild(row);
  }

  function draftPopover() {
    var pop = document.createElement('div');
    pop.className = 'rv-pop';
    pop.addEventListener('click', function (e) { e.stopPropagation(); });
    pop.addEventListener('pointerdown', function (e) { e.stopPropagation(); });

    if (state.draft.anchor) {
      var a = document.createElement('div');
      a.className = 'rv-anchor';
      a.textContent = 'у элемента: «' + state.draft.anchor + '»';
      pop.appendChild(a);
    }
    var ta = document.createElement('textarea');
    ta.placeholder = 'Что поправить?';
    // Черновик держим в state: если окошко всё же пересоберётся (сменили формат
    // устройства, ушли на другой экран), набранное вернётся на место.
    ta.value = state.draft.text || '';
    ta.addEventListener('input', function () {
      if (state.draft) state.draft.text = ta.value;
    });
    pop.appendChild(ta);

    var actions = document.createElement('div');
    actions.className = 'rv-pop-actions';
    actions.appendChild(mkBtn('Добавить', 'primary', function () { commitDraft(ta.value); }));
    actions.appendChild(mkBtn('Отмена', '', cancelDraft));
    pop.appendChild(actions);

    setTimeout(function () {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }, 0);
    ta.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') commitDraft(ta.value);
    });
    return pop;
  }

  function mkBtn(label, cls, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'rv-btn' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }
  function mkIconBtn(label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'rv-icon-btn';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }
  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch (e) { return ''; }
  }

  // ---------- правая панель ----------
  /** Строка состояния: где сейчас живут комментарии и всё ли доехало. */
  function renderStatus() {
    var el = document.getElementById('rvStatus');
    if (!el) return;
    var cls, text, retry = false;
    if (store.lsBroken && queue.length) {
      cls = 'warn';
      text = 'Память браузера заполнена. Не отправлено: ' + queue.length + ' — не закрывайте вкладку, пока не отправится.';
      retry = store.mode === 'server';
    } else if (store.mode !== 'server' && queue.length) {
      cls = 'warn';
      text = 'Сервер недоступен. Не отправлено: ' + queue.length + ' — всё цело в этом браузере, отправим сами, когда связь вернётся.';
      retry = true;
    } else if (store.mode !== 'server') {
      cls = 'local';
      text = 'Только в этом браузере: сервер комментариев недоступен. Отправим сами, когда он появится.';
    } else if (queue.length) {
      cls = 'warn';
      text = 'Не доехало до сервера: ' + queue.length + '. Комментарии целы, отправим при связи.';
      retry = true;
    } else if (store.degraded) {
      cls = 'warn';
      text = 'Сервер не отвечает — показываю последнее, что видел.';
      retry = true;
    } else {
      cls = 'ok';
      text = 'Общие: видны всем, у кого есть ссылка.';
    }
    el.className = 'rv-status ' + cls;
    el.innerHTML = '<span class="rv-dotmark"></span><span>' + escapeHtml(text) + '</span>';
    if (retry) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'rv-retry';
      b.textContent = 'Повторить';
      b.addEventListener('click', function () { flushQueue().then(refresh); });
      el.appendChild(b);
    }
  }

  function renderPanel() {
    var openCount = state.comments.filter(function (c) { return !c.resolved; }).length;
    countEls.forEach(function (el) { el.textContent = String(openCount); });
    renderStatus();
    if (!listEl) return;

    [].forEach.call(panel.querySelectorAll('[data-filter]'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.filter === state.filter));
    });

    var shown = state.comments.filter(function (c) {
      return state.filter === 'all' ? true : state.filter === 'open' ? !c.resolved : c.resolved;
    }).sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });

    listEl.innerHTML = '';
    if (!shown.length) {
      var p = document.createElement('p');
      p.className = 'rv-empty';
      p.textContent = state.comments.length
        ? 'В этом фильтре пусто.'
        : 'Пока нет комментариев. Нажмите «＋ Комментарий» и кликните в нужное место экрана.';
      listEl.appendChild(p);
      return;
    }

    var cur = activeScreenId();
    var groups = {};
    var order = [];
    shown.forEach(function (c) {
      if (!groups[c.screen]) { groups[c.screen] = []; order.push(c.screen); }
      groups[c.screen].push(c);
    });
    order.sort(function (a, b) {
      if (a === cur) return -1;
      if (b === cur) return 1;
      return screenTitle(a).localeCompare(screenTitle(b), 'ru');
    });

    order.forEach(function (screen) {
      var sec = document.createElement('div');
      sec.className = 'rv-group';
      var h = document.createElement('h3');
      h.innerHTML = '<span>' + escapeHtml(screenTitle(screen)) + '</span>' +
        (screen === cur ? '<span class="rv-here">· вы здесь</span>' : '');
      sec.appendChild(h);
      groups[screen].forEach(function (c) { sec.appendChild(cardNode(c)); });
      listEl.appendChild(sec);
    });
  }

  function cardNode(c) {
    var card = document.createElement('div');
    card.className = 'rv-card' + (c.resolved ? ' resolved' : '') + (state.focusId === c.id ? ' focus' : '');
    card.addEventListener('click', function () { jumpTo(c); });

    var meta = document.createElement('div');
    meta.className = 'rv-card-meta';
    meta.innerHTML = '<span class="rv-chip">' + (DEVICES[c.mode] ? DEVICES[c.mode].icon + ' ' + DEVICES[c.mode].label : escapeHtml(c.mode)) + '</span>' +
      (c.author ? '<span class="rv-who">' + escapeHtml(c.author) + '</span>' : '') +
      '<span>' + fmtDate(c.createdAt) + '</span>' +
      (c.resolved ? '<span style="color:var(--rv-ok)">решён</span>' : '');
    card.appendChild(meta);

    var t = document.createElement('div');
    t.className = 'rv-card-text';
    t.textContent = c.text;
    card.appendChild(t);

    var nReplies = repliesOf(c).length;
    if (nReplies) {
      var last = repliesOf(c)[nReplies - 1];
      var thread = document.createElement('div');
      thread.className = 'rv-card-thread';
      thread.innerHTML = '<span class="rv-card-more">+' + nReplies + ' ' + plural(nReplies, 'ответ', 'ответа', 'ответов') + '</span> ' +
        (last.author ? '<span class="rv-who">' + escapeHtml(last.author) + '</span>: ' : '') +
        escapeHtml(last.text.slice(0, 60)) + (last.text.length > 60 ? '…' : '');
      card.appendChild(thread);
    }

    if (c.anchor) {
      var a = document.createElement('div');
      a.className = 'rv-card-anchor';
      a.textContent = 'у элемента: «' + c.anchor + '»';
      card.appendChild(a);
    }

    var acts = document.createElement('div');
    acts.className = 'rv-card-actions';
    var res = mkIconBtn(c.resolved ? '↺' : '✓', function (e) {
      e.stopPropagation();
      updateComment(c.id, { resolved: !c.resolved });
    });
    res.title = c.resolved ? 'Вернуть в открытые' : 'Отметить решённым';
    if (c.resolved) res.style.color = 'var(--rv-ok)';
    var del = mkIconBtn('🗑', function (e) {
      e.stopPropagation();
      if (repliesOf(c).length && !confirm('Удалить всю ветку вместе с ответами?')) return;
      removeComment(c.id);
    });
    del.classList.add('danger');
    del.title = 'Удалить';
    acts.appendChild(res); acts.appendChild(del);
    card.appendChild(acts);
    return card;
  }

  function jumpTo(c) {
    // Переход из списка — это просьба показать место на макете; молча вернуть пины.
    if (state.pinsHidden) setPinsHidden(false);
    if (c.mode !== state.device) setDevice(c.mode);
    if (c.screen && c.screen !== activeScreenId() && typeof window.showScreen === 'function') {
      try { window.showScreen(c.screen); } catch (e) {}
    }
    state.focusId = c.id;
    state.openId = c.id;
    // Список внутри экрана мог быть прокручен — подводим пин в поле зрения.
    setTimeout(function () {
      if (c.scroller) {
        var sc = resolvePath(c.scroller);
        if (sc) sc.scrollTop = Math.max(0, c.y - sc.clientHeight / 3);
      }
      renderPins(); renderPanel();
    }, 60);
  }

  /** 1 ответ / 2 ответа / 5 ответов */
  function plural(n, one, few, many) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
    return many;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  // ---------- синхронизация позиций ----------
  var syncFrame = 0;
  var lastScreen = '';
  function scheduleSync() {
    if (syncFrame) return;
    syncFrame = requestAnimationFrame(function () {
      syncFrame = 0;
      if (!state.on) return;
      var s = activeScreenId();
      var screenChanged = s !== lastScreen;
      lastScreen = s;
      renderPins();
      if (screenChanged) renderPanel();
    });
  }

  // ---------- опрос сервера ----------
  // Комментарии общие: раз в 15 секунд подтягиваем чужие правки. Запрос
  // крошечный, поэтому опрашиваем всегда (в фоновой вкладке браузер сам
  // притормозит таймер) — так обновления не «залипают» во встроенных окнах,
  // которые всегда считают себя скрытыми.
  function startPolling() {
    watchForServer();          // ждём сервер, если его не было при загрузке
    setInterval(function () {
      if (store.mode !== 'server') return;
      if (readQueue().length) flushQueue(); else refresh();
    }, 15000);
    window.addEventListener('online', function () { flushQueue().then(refresh); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { if (readQueue().length) flushQueue(); else refresh(); }
    });
    // Предупреждаем, если вкладку закрывают с неотправленной очередью (данные
    // при этом не пропадут — лежат в localStorage и уедут при следующем заходе).
    window.addEventListener('beforeunload', function (e) {
      if (!queue.length || store.mode !== 'server') return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  // ---------- запуск ----------
  function init() {
    frame = document.getElementById('deviceFrame');
    viewport = document.getElementById('reviewViewport');
    pinsLayer = document.getElementById('reviewPins');
    hintEl = document.getElementById('reviewHint');
    if (!frame || !pinsLayer) return;

    var ui = loadUI();
    // Ревью — для просмотра в браузере на компьютере, и там оно включено всегда:
    // кнопок выхода и возврата нет, состояние «выключено» не запоминается (решение
    // владельца от 21 сентября 2026 года). На телефоне и в установленном PWA прототип
    // открывается как обычно; принудительно — ?review=1 / ?review=0.
    var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    // iPad в Safari представляется компьютером Mac; выдаёт его сенсорный экран.
    var iPadAsMac = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
    var phone = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || iPadAsMac;
    var forced = /[?&]review=([01])(?=&|$)/.exec(location.search);
    var supported = forced ? forced[1] === '1' : (!standalone && !phone);

    // initStore синхронно поднимает локальную копию (очередь, автора, комментарии),
    // а дальше в фоне идёт на сервер за общими. Без режима ревью комментарии не
    // нужны, и сервер зря не дёргаем.
    var ready = supported ? initStore() : null;
    buildChrome();

    state.device = DEVICES[ui.device] ? ui.device : 'mobile-h';
    state.filter = ui.filter || 'open';
    state.panelOpen = ui.panelOpen !== false;
    state.on = supported; // до setDevice: он сохраняет UI-состояние
    setDevice(state.device);
    setReview(state.on);
    setPinsHidden(ui.pinsHidden === true);   // после setReview: он тоже зовёт renderPins
    renderPanel();

    if (ready) ready.then(function () {
      renderPins();
      renderPanel();
      startPolling();
    });

    // клики по рамке в режиме добавления — перехватываем до обработчиков прототипа
    ['pointerdown', 'mousedown', 'click', 'touchstart', 'touchend'].forEach(function (t) {
      frame.addEventListener(t, onFrameCapture, true);
    });

    // клик мимо попапа — закрыть
    document.addEventListener('click', function (e) {
      if (!state.on || !state.openId) return;
      // Клик по карточке в панели перерисовывает панель — цель отрывается от DOM,
      // и closest() уже ничего не найдёт. Такой клик — не «мимо попапа».
      if (!e.target.isConnected) return;
      if (e.target.closest('.rv-pin') || e.target.closest('#reviewPanel') || e.target.closest('#reviewToolbar')) return;
      if (state.openId === '__draft__') return;
      state.openId = null;
      renderPins();
    });

    document.addEventListener('keydown', function (e) {
      if (!state.on) return;
      // H — спрятать/вернуть пины. «р» — та же клавиша в русской раскладке:
      // переключать язык ради горячей клавиши никто не станет.
      var t = e.target;
      var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && /^[hHрР]$/.test(e.key)) {
        e.preventDefault();
        setPinsHidden(!state.pinsHidden);
        return;
      }
      if (e.key !== 'Escape') return;
      if (state.adding) { setAdding(false); return; }
      if (state.draft) { cancelDraft(); return; }
      if (state.openId) { state.openId = null; renderPins(); }
    });

    window.addEventListener('resize', function () { fitScale(); setPanel(state.panelOpen); scheduleSync(); });
    viewport.addEventListener('transitionend', onViewportTransition);
    frame.addEventListener('scroll', scheduleSync, true);

    // Наблюдаем только за прототипом (не за своим слоем пинов — иначе бесконечный цикл).
    var proto = document.getElementById('phoneScreen');
    if (proto) {
      new MutationObserver(scheduleSync).observe(proto, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style']
      });
    }

    // подсказка режима добавления
    hintEl.textContent = 'Кликните в любом месте экрана, чтобы оставить комментарий · Esc — отмена';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
