// Service worker «Разговора» — офлайн-работа (оболочка + пиктограммы ARASAAC).
// Версию поднимать при изменении оболочки, чтобы кэш обновился.
const VERSION = 'v101';
const SHELL_CACHE = 'razgovor-shell-' + VERSION;
const RUNTIME_CACHE = 'razgovor-runtime-' + VERSION;

const SHELL = [
  './',
  './index.html',
  './core.js',
  './app-1-state.js',
  './app-2-board.js',
  './app-3-vocab.js',
  './app-4-speech.js',
  './app-5-edit.js',
  './app-6-boot.js',
  './styles.css',
  './review.js',
  './review.css',
  './manifest.webmanifest',
  './fonts/InterDisplay-Regular.woff2',
  './fonts/InterDisplay-SemiBold.woff2',
  './icons/icon-64.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-180.png',

  // Пиктограммы стартового словаря лежат внутри приложения: это закрывает и
  // утечку словаря на чужой сервер, и пустую доску при первом запуске без сети.
  './voice/index.json',
  './pictos/index.json',
  './pictos/бабушка.png',
  './pictos/банан.png',
  './pictos/больница.png',
  './pictos/больно.png',
  './pictos/большой.png',
  './pictos/весело.png',
  './pictos/вода.png',
  './pictos/врач.png',
  './pictos/Всё.png',
  './pictos/говорить.png',
  './pictos/Да.png',
  './pictos/давать.png',
  './pictos/дедушка.png',
  './pictos/действия.png',
  './pictos/дом.png',
  './pictos/домой.png',
  './pictos/друг.png',
  './pictos/еда.png',
  './pictos/есть.png',
  './pictos/ещё.png',
  './pictos/Здравствуйте.png',
  './pictos/злиться.png',
  './pictos/играть.png',
  './pictos/идти.png',
  './pictos/каша.png',
  './pictos/ключ.png',
  './pictos/комната.png',
  './pictos/любить.png',
  './pictos/люди.png',
  './pictos/магазин.png',
  './pictos/маленький.png',
  './pictos/мама.png',
  './pictos/места.png',
  './pictos/мне.png',
  './pictos/мой.png',
  './pictos/молоко.png',
  './pictos/мы.png',
  './pictos/не_нравится.png',
  './pictos/не_понимаю.png',
  './pictos/не_хотеть.png',
  './pictos/Нет.png',
  './pictos/Нравится.png',
  './pictos/он.png',
  './pictos/она.png',
  './pictos/они.png',
  './pictos/папа.png',
  './pictos/парк.png',
  './pictos/печенье.png',
  './pictos/пить.png',
  './pictos/плохо.png',
  './pictos/подождите.png',
  './pictos/Пожалуйста.png',
  './pictos/Пока.png',
  './pictos/Помогите.png',
  './pictos/Привет.png',
  './pictos/сестра.png',
  './pictos/смотреть.png',
  './pictos/Смотри.png',
  './pictos/сок.png',
  './pictos/Спасибо.png',
  './pictos/спать.png',
  './pictos/Стоп.png',
  './pictos/страшно.png',
  './pictos/там.png',
  './pictos/туалет.png',
  './pictos/туда.png',
  './pictos/ты.png',
  './pictos/улица.png',
  './pictos/устать.png',
  './pictos/учитель.png',
  './pictos/хлеб.png',
  './pictos/хорошо.png',
  './pictos/хотеть.png',
  './pictos/чувства.png',
  './pictos/школа.png',
  './pictos/это.png',
  './pictos/я.png',
  './pictos/яблоко.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isArasaac = url => url.hostname.endsWith('arasaac.org');

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Навигации — сеть, при офлайне отдаём кэшированный index.html
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  // API комментариев — всегда сеть, никакого кэша (данные общие и живые)
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    return; // отдаём браузеру как есть
  }

  // Своя оболочка (index/app/styles/иконки) — stale-while-revalidate:
  // мгновенно из кэша, а свежую версию подтягиваем в фоне, чтобы правки
  // прототипа доезжали до людей со следующего открытия, без ручной чистки.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.open(SHELL_CACHE).then(cache =>
        cache.match(req).then(cached => {
          const network = fetch(req).then(resp => {
            if (resp && resp.ok) cache.put(req, resp.clone());
            return resp;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // Пиктограммы ARASAAC — stale-while-revalidate (работают офлайн после первой загрузки).
  // Шрифт лежит в своей оболочке (fonts/) и попадает в ветку выше.
  if (isArasaac(url)) {
    e.respondWith(
      caches.open(RUNTIME_CACHE).then(cache =>
        cache.match(req).then(cached => {
          const network = fetch(req).then(resp => {
            if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
            return resp;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // Остальное — сеть с фолбэком на кэш
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});
