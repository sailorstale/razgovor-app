// Разговор (приложение), часть 6/6 — профили и запуск. Классические <script> с общей глобальной
// областью видимости: порядок подключения в index.html менять нельзя, файлы
// дополняют друг друга. Грузится после core.js. Раздел: профили, сохранение и перенос старых профилей, BOOT, PWA

// ===== PROFILES =====
// Первый запуск ничего не спрашивает: профиль заводится сам, имя и цвет меняются
// в настройках. Решение владельца от 21 сентября 2026 года.
const profiles=[
  {id:1, name:'Говорящий', active:true},
];
let nextProfileId=2;
let editingProfileId=null;

function renderProfiles(){
  const el=document.getElementById('profilesListContent');
  // Строка профиля: имя, размер словаря, отметка текущего и карандаш. Нажатие по строке
  // выбирает профиль, карандаш открывает окно с именем и удалением. Аватарок и меню
  // «⋯» нет: действий всего два, им хватает одного окна (решение владельца, 23.09.2026).
  const rows=profiles.map(p=>uiRow({title:p.name,
    desc:gridSizeLabel(p.active ? S.gridSize : ((p.settings&&p.settings.gridSize)||GRID_DEFAULT)),
    radio:!!p.active, action:`switchProfile(${p.id})`,
    trailHtml:`<button class="icon-btn" data-mi="edit" onclick="event.stopPropagation();openEditProfileModal(${p.id})" aria-label="Изменить профиль «${esc(p.name)}»"></button>`}));
  el.innerHTML = uiSection('', rows) + '<button class="btn-full" onclick="openNewProfileModal()">Новый профиль</button>';
  if(!profiles.length) el.innerHTML='<div class="ui-empty">Нет профилей</div>';
  renderIcons(el); a11yEnhance(el);   // карточки профилей операбельны (R-I1)
}

// Настройки профиля снимаются и возвращаются вместе с ним. Все сохраняемые настройки
// принадлежат профилю — отдельного списка «эти его, а эти общие» больше нет.
function snapshotSettings(){
  const o={};
  SETTINGS_KEYS.forEach(k=>{ o[k]=JSON.parse(JSON.stringify(S[k])); });
  return o;
}
// Настройки становятся текущими. Чего у профиля нет — берём из умолчаний, а не
// оставляем от прошлого: профили обязаны быть изолированы полностью.
function applySettings(s){
  s = migrateSettings(s || {});
  SETTINGS_KEYS.forEach(k=>{
    const v = (k in s) ? s[k] : SETTINGS_DEFAULTS[k];
    if(v !== undefined) S[k]=JSON.parse(JSON.stringify(v));
  });
  applyColorMode(); applyStripPosition(); applyPathBar(); applyCaption(); applyTheme(); applyTouchFrame();
}
// Войти в профиль: его словарь и его настройки становятся текущими. Одно место на все
// входы — переключение, удаление соседнего, запуск. Раньше перенос старых данных стоял
// здесь четырьмя дословными копиями, и забыть его в новом входе было нечем поймать.
function adoptProfile(p){
  migrateProfile(p, freshVocab(), LEGACY_CAT_ORDER);
  loadVocabInto(p.vocab);
  applySettings(p.settings);
  S.selectedWords=[];   // входим с чистой полоской: фраза одного человека не прилетает к другому
  S.gridPage=0;
}

function switchProfile(id){
  // Тап по уже активному профилю — не «переключение»: иначе полоска сообщения
  // обнулялась бы на пустом месте (карточка теперь кликабельна целиком).
  const cur=profiles.find(p=>p.active);
  if(cur && cur.id===id) return;
  // Сохраняем словарь и записи уходящего профиля, грузим то же у входящего
  if(cur){ cur.vocab=snapshotVocab(); cur.settings=snapshotSettings(); }
  profiles.forEach(p=>p.active=(p.id===id));
  const p=profiles.find(p=>p.id===id);
  if(p){
    adoptProfile(p);
    // «Вернуть» из прошлой очистки больше не действует: иначе фраза одного человека
    // прилетела бы на доску другого.
    const ut=document.getElementById('undoToast'); if(ut) ut.classList.remove('show');
    renderBoard(); renderStrip();
  }
  renderProfiles();
  renderActiveProfileBadge();
  showToast('Профиль «'+p.name+'» активирован');
  persist();
}

// Окно профиля спрашивает только имя и цвет. Размер окна задаётся в одном
// месте — «Касание и сетка» — и живёт в настройках профиля.
function openNewProfileModal(){
  editingProfileId=null;
  document.getElementById('profileNameInput').value='';
  document.getElementById('profileModalTitle').textContent='Новый профиль';
  document.getElementById('profileModalSaveBtn').textContent='Создать';
  document.getElementById('profileDeleteBtn').style.display='none';
  openModal('profileModal');
}

function openEditProfileModal(id){
  const p=profiles.find(pr=>pr.id===id); if(!p)return;
  editingProfileId=id;
  document.getElementById('profileNameInput').value=p.name;
  document.getElementById('profileModalTitle').textContent='Имя профиля';
  document.getElementById('profileModalSaveBtn').textContent='Сохранить';
  document.getElementById('profileDeleteBtn').style.display='block';
  openModal('profileModal');
}

function saveProfile(){
  const name=document.getElementById('profileNameInput').value.trim();
  if(!name){showToast('Введите имя');return;}
  if(editingProfileId){
    const p=profiles.find(pr=>pr.id===editingProfileId);
    if(p){ p.name=name; }
    showToast('Профиль обновлён');
  } else {
    const isFirst=profiles.length===0;
    // Новый профиль получает свой словарь: первый — текущий, остальные — чистый по
    // умолчанию. Настройки у нового профиля тоже по умолчанию: окно 15 картинок.
    profiles.push({id:nextProfileId++, name, active:isFirst, vocab: isFirst ? snapshotVocab() : freshVocab()});
    if(isFirst){S.selectedWords=[];renderBoard();}
    showToast('Профиль «'+name+'» создан');
  }
  closeModal('profileModal');
  renderProfiles();
  // Строку профиля в панели тоже перерисовываем: без этого там оставалось старое имя.
  renderActiveProfileBadge();
  if(S.screen==='child-screen') renderChild();
  persist();
}

// Полное стирание данных профиля: словарь, настройки и сам профиль.
// После него приложение открывается как в первый раз.
function wipeAllData(name){
  confirmDialog('Удалить все данные'+(name?' профиля «'+name+'»':'')+'?\n\nСловарь и настройки будут стёрты без возможности вернуть. Приложение откроется как в первый раз.', ()=>{
    try{ Object.keys(localStorage).forEach(k=>{ if(/^razgovor/i.test(k)) localStorage.removeItem(k); }); }catch(e){}
    location.replace(location.pathname);
  });
}

function deleteProfile(){
  const idx=profiles.findIndex(p=>p.id===editingProfileId);
  if(idx<0)return;
  const p=profiles[idx];
  // Последний профиль не удаляем: приложение осталось бы без хозяина — в панели
  // опекуна висело бы имя удалённого ребёнка, а словарь на экране не принадлежал
  // бы никому. Взрослому предлагаем переименовать.
  // Последний профиль удаляется вместе со всеми данными приложения. Раньше его
  // запрещали удалять, и у семьи с одним ребёнком стереть данные было нельзя вовсе.
  // Для продукта, который хранит данные ребёнка, право на удаление обязательно.
  if(profiles.length<=1){ wipeAllData(p.name); return; }
  // Удаление профиля необратимо и весомо (весь словарь и настройки) —
  // здесь подтверждение уместно, но в своём диалоге, не в браузерном (R-H3/R-H4).
  confirmDialog('Удалить профиль «'+p.name+'»?\nЕго словарь и настройки будут потеряны.', ()=>{
    const wasActive=p.active;
    profiles.splice(idx,1);
    if(wasActive && profiles.length){
      const np=profiles[0]; np.active=true;
      adoptProfile(np);
      renderBoard(); renderStrip();
    }
    closeModal('profileModal');
    renderProfiles(); renderActiveProfileBadge();
    showToast('Профиль удалён');
    persist();
  }, {title:'Удалить профиль', okLabel:'Удалить'});
}

// ===== TOAST =====
function showToast(t){const el=document.getElementById('toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2000);}

// No finger cursor in mobile version

// ===== PERSISTENCE (сохранение между запусками) =====
const STORE_KEY='razgovor_state_v1';
// Место в браузере кончилось — молчать нельзя: взрослый должен знать, что правка
// НЕ сохранена, иначе он узнает об этом только потеряв словарь. Предупреждаем не
// чаще раза в минуту, чтобы не сыпать тостами на каждое слово.
let quotaWarnedAt=0;
function storageFull(e){
  return !!e && (e.name==='QuotaExceededError' || e.code===22 || e.code===1014 || /quota|exceed/i.test(e.name+' '+e.message));
}
// Восстановление из копии кладёт файл в хранилище и перезапускает приложение.
// В этот момент нельзя ничего дописывать: сохранение «на закрытие вкладки»
// затёрло бы восстановленный словарь тем, что осталось в памяти.
let saveBlocked=false;
function persist(){
  // saveBlocked — при восстановлении из копии; window.__resetting — при сбросе
  // ?reset=1 (см. app-1-state.js): без этого уход страницы через pagehide засеял
  // бы дефолтное состояние обратно в localStorage, и сброс не сработал бы.
  if(saveBlocked || (typeof window!=='undefined' && window.__resetting)) return false;
  try{
    // Собирает сохранёнку packState (core.js): словарь и настройки текущего сеанса
    // ложатся в активный профиль, второго экземпляра рядом нет. Добавил настройку в
    // SETTINGS_DEFAULTS — она сохраняется сама, дописывать сюда ничего не надо.
    localStorage.setItem(STORE_KEY, JSON.stringify(packState({
      profiles, nextProfileId,
      arasaacIds: ARASAAC_IDS,
      vocab: snapshotVocab(),
      settings: snapshotSettings(),
    })));
    return true;
  }catch(e){
    console.warn('[persist] не удалось сохранить:', e.message);
    if(storageFull(e) && Date.now()-quotaWarnedAt>60000){
      quotaWarnedAt=Date.now();
      showToast('Не хватает места — не сохранено. Удалите фото у старых карточек.');
    }
    return false;
  }
}
// Отложенное сохранение: во время общения говорящий нажимает часто, а запись
// сериализует весь словарь с фотографиями. Копим и пишем разом, чтобы не
// подтормаживало на каждом слове. Перед закрытием вкладки — дописываем.
let _persistT=null;
function persistLater(){
  clearTimeout(_persistT);
  _persistT=setTimeout(()=>{ _persistT=null; persist(); }, 1500);
}
function persistNow(){ if(_persistT){ clearTimeout(_persistT); _persistT=null; } return persist(); }
window.addEventListener('pagehide', persistNow);
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) persistNow(); });

// Приложение открыто ещё где-то на этом устройстве (вторая вкладка, браузер рядом
// с установленным PWA). Каждая копия хранит своё состояние в памяти и пишет его
// целиком — то есть тихо затирает правки соседней. Обнаружить это мы можем, а
// разрулить автоматически нет: сказать честно лучше, чем потерять карточки молча.
let multiTabWarned=false;
window.addEventListener('storage', e=>{
  if(e.key!==STORE_KEY || multiTabWarned) return;
  multiTabWarned=true;
  showToast('Приложение открыто ещё в одном окне — оставьте одно, иначе правки затирают друг друга');
});
// ===== КОПИЯ СЛОВАРЯ (страховка от потери доски) =====
// Всё, что собрал взрослый — карточки, фото, профили, настройки — живёт только в
// памяти этого браузера. Чистка данных, переустановка или новый планшет стирают
// персональную доску безвозвратно. Файл-копия — единственный способ её сохранить
// и перенести. Формат — тот же, что и в хранилище, плюс отметка о времени.
function exportBackup(){
  persistNow();
  const raw=localStorage.getItem(STORE_KEY);
  if(!raw){ showToast('Пока нечего сохранять'); return; }
  let payload;
  try{ payload=JSON.parse(raw); }catch(e){ showToast('Не удалось прочитать данные'); return; }
  payload.backupVersion=1;
  payload.backupAt=new Date().toISOString();
  const who=(profiles.find(p=>p.active)||{}).name||'профиль';
  const day=new Date().toISOString().slice(0,10);
  const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`Разговор — ${who} — ${day}.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  showToast('Копия сохранена в файл');
}
function importBackup(input){
  const f=input.files && input.files[0];
  input.value='';
  if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    let data;
    try{ data=JSON.parse(String(r.result)); }catch(e){ showToast('Это не файл копии «Разговора»'); return; }
    if(!data || (!Array.isArray(data.profiles) && !data.V)){ showToast('В файле нет словаря — похоже, копия от другого приложения'); return; }
    const when=data.backupAt ? new Date(data.backupAt).toLocaleString('ru-RU') : 'без даты';
    const names=(data.profiles||[]).map(p=>p.name).filter(Boolean).join(', ')||'—';
    confirmDialog(`Восстановить копию от ${when}?\nПрофили в файле: ${names}\n\nТекущий словарь, фото и настройки будут заменены.`, ()=>{
      if(_persistT){ clearTimeout(_persistT); _persistT=null; }  // отложенная запись — отменить
      saveBlocked=true;                                          // и больше ничего не писать
      try{
        localStorage.setItem(STORE_KEY, JSON.stringify(data));
      }catch(e){
        saveBlocked=false;
        showToast(storageFull(e) ? 'Не хватает места, чтобы восстановить копию.' : 'Не удалось восстановить копию.');
        return;
      }
      location.reload();   // перезапуск — самый честный способ применить всё сразу
    }, {title:'Загрузить копию из файла', okLabel:'Загрузить'});
  };
  r.readAsText(f);
}

function loadState(){
  try{
    const raw=localStorage.getItem(STORE_KEY); if(!raw) return false;
    // Разбирает сохранёнку unpackState (core.js): перенос старого словаря в матрицу,
    // старые настройки в нынешние, поля убранных возможностей прочь. Здесь остаётся
    // только разложить готовое по местам.
    const st=unpackState(JSON.parse(raw), {
      starter: freshVocab(), order: LEGACY_CAT_ORDER, defaults: SETTINGS_DEFAULTS,
    });
    if(st.profiles.length){ profiles.length=0; st.profiles.forEach(p=>profiles.push(p)); }
    if(typeof st.nextProfileId==='number') nextProfileId=st.nextProfileId;
    Object.assign(ARASAAC_IDS, st.arasaacIds);   // кэш пиктограмм — меньше мигания и запросов
    if(st.vocab) loadVocabInto(st.vocab);
    Object.assign(S, st.settings);
    fixFolderPath();
    return true;
  }catch(e){
    // Сохранение не открылось (обрыв записи, повреждение хранилища). Раньше здесь
    // был тихий выход: приложение стартовало «как новое», первое же сохранение
    // затирало остатки, и словарь ребёнка исчезал без единого слова. Теперь
    // повреждённые данные откладываем в сторону и говорим взрослому — по ним ещё
    // можно что-то восстановить, и у него может быть файл копии.
    console.warn('[loadState] не удалось загрузить:', e.message);
    try{
      const raw=localStorage.getItem(STORE_KEY);
      if(raw) localStorage.setItem(STORE_KEY+'_corrupt', raw);
    }catch(_){ /* места нет — тогда просто предупреждаем */ }
    setTimeout(()=>{
      alert('Сохранённые данные не открылись — похоже, они повреждены.\n\n'+
            'Приложение запустилось с чистого листа. Повреждённые данные отложены в сторону и не удалены.\n\n'+
            'Если вы сохраняли копию, восстановите её: Меню → Настройки → «Загрузить копию из файла».');
    }, 800);
    return false;
  }
}

// Init voices — отслеживаем загрузку и наличие русского голоса
if('speechSynthesis'in window){ refreshVoiceState(); speechSynthesis.onvoiceschanged=()=>refreshVoiceState(); }

// Прогрев живого голоса: когда приложение уже запустилось и есть сеть, тихо
// синтезируем частые слова про запас — чтобы живой голос звучал с первого тапа,
// а не со второго. Ничего не блокирует и молча выключается, если TTS не настроен.
// АВТОПРОГРЕВ ОТКЛЮЧЁН СОЗНАТЕЛЬНО (R-D16 «данных лучше не иметь», R-D19 opt-in).
// Раньше здесь на каждом запуске молча уходило до 60 слов персонального словаря
// ребёнка — включая карточки, которые завёл взрослый, — без единого его действия.
// Это ровно «серверный сбор по умолчанию», который свод запрещает.
// Теперь фраза уходит на сервер ТОЛЬКО когда ребёнок её произнёс, и только при
// явно включённом «Живом голосе».
if(typeof window!=='undefined'){
  window.addEventListener('online', ()=>{ ttsOff=false; });
}

// ===== BOOT =====
// Приложение всегда открывается сразу на доске: ни заставки, ни вопросов, ни
// обучения перед ней нет. Профиль по умолчанию уже заведён (см. profiles выше).
renderIcons();     // единый набор иконок Material Symbols в статичном UI взрослого (C8)
applyColorMode();  // режим цвета части речи на <body> (после возможной миграции)
const hadSavedState = loadState();
if(hadSavedState) applyColorMode();
applyStripPosition(); applyPathBar();
applyCaption();
applyTheme();
applyTouchFrame();
renderActiveProfileBadge();
showScreen('aac-main');
renderBoard();
renderStrip();   // недосказанная фраза возвращается на доску

// Поворот планшета и смена размера окна: высота строк сетки считается при отрисовке,
// поэтому без перерисовки карточки остаются под прежний экран. Ждём, пока поворот
// закончится, и рисуем заново.
let _resizeT=null;
function onViewportChange(){
  clearTimeout(_resizeT);
  _resizeT=setTimeout(()=>{ if(S.screen==='aac-main'){ fitSideButtons(); renderWindow(); } }, 200);
}
window.addEventListener('resize', onViewportChange);
window.addEventListener('orientationchange', onViewportChange);

// Однократный полный проход доступности на старте: охватывает статичные модалки,
// оверлеи, PIN-клавиатуру и прочее, что показывается не через showScreen (R-I1/R-I2).
a11yEnhance(document);

// ===== PWA: service worker (офлайн-работа + установка на домашний экран) =====
// Важно: кэш оболочки работает по схеме «сначала отдай старое, свежее скачай в
// фон». Без этого блока новая версия применялась бы только со ВТОРОГО открытия —
// на отладке это стоило нам кучи времени («правки не доезжают»). Поэтому: как
// только новый service worker перехватил управление, один раз перезагружаемся.
// На отладке service worker — главный налог: браузер отдаёт старую оболочку из
// кэша, и правки «не доезжают». Поэтому на локальном адресе SW не регистрируем
// вообще, а если он там остался с прошлых заходов — снимаем и чистим кэши. В бою
// (настоящий сайт по HTTPS) всё работает как раньше: офлайн и установка на экран.
const isDevHost = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname)
               || location.hostname.endsWith('.local')
               || location.hostname.endsWith('.localhost');   // talk.localhost — локальный адрес прототипа
if(isDevHost && 'serviceWorker' in navigator){
  navigator.serviceWorker.getRegistrations()
    .then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});
  if(window.caches && caches.keys){
    caches.keys().then(ks=>ks.forEach(k=>caches.delete(k))).catch(()=>{});
  }
}
if(!isDevHost && 'serviceWorker' in navigator){
  // Был ли контроллер на момент загрузки: если нет — это ПЕРВАЯ установка,
  // и перезагружаться не надо (страница и так свежая). Перезагрузка нужна
  // только когда старый worker сменился новым.
  const hadController = !!navigator.serviceWorker.controller;
  let swReloaded=false;
  navigator.serviceWorker.addEventListener('controllerchange', ()=>{
    if(!hadController || swReloaded) return;   // ровно один раз, иначе цикл перезагрузок
    swReloaded=true;
    location.reload();
  });
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js')
      .then(reg=>{ try{ reg.update(); }catch(e){} })   // проверить обновление сразу
      .catch(err=>console.warn('[SW] не зарегистрирован:', err.message));
  });
}

// Имя активного профиля — для подтверждения удаления данных.
function activeProfileName(){ const p=profiles.find(p=>p.active); return p?p.name:''; }
