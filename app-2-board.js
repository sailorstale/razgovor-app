// Разговор (приложение), часть 2/6 — доска. Классические <script> с общей глобальной
// областью видимости: порядок подключения в index.html менять нельзя, файлы
// дополняют друг друга. Грузится после core.js. Раздел: навигация по экранам,
// доска (папки, окно на матрицу, путь, боковой столбец, страницы), поиск

// Найти слово по лемме по всему словарю (нужно поиску и тренировке озвучки).
function findWordByLemma(lemma) {
  for (const f of Object.values(V)) {
    for (const k in f.cells) { const c=f.cells[k]; if (c && !c.folder && c.lemma === lemma) return c; }
  }
  return null;
}
// Все слова папки в порядке чтения: [{key, word}]. Клетки-папки пропускаются.
function folderWords(f){
  if(!f) return [];
  return orderedKeys(f.cells).filter(k=>f.cells[k] && !f.cells[k].folder).map(k=>({key:k, word:f.cells[k]}));
}
// Все слова словаря: [{folderId, folder, key, word}] — для поиска и прогрева голоса.
function allWords(){
  const out=[];
  for(const [id,f] of Object.entries(V)) folderWords(f).forEach(x=>out.push({folderId:id, folder:f, key:x.key, word:x.word}));
  return out;
}

// ===== GRAMMAR =====
// Грамматический движок grammar() и таблица особых случаев G живут в core.js
// (чистая логика, тестируется в терминале). Вызывается из renderStrip как
// grammar(S.selectedWords, engineOn()): флаг движка передаётся аргументом.

// ===== NAVIGATION =====
// Движение включено только если помощник разрешил анимации И система не просит их убрать.
// prefers-reduced-motion всегда важнее настройки (сенсорная безопасность).
function motionOn(){
  if(!S.animations) return false;
  try{ return !window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return true; }
}
function showScreen(id, anim) {
  // Нет такого экрана (опечатка в id) — раньше это роняло весь переход на
  // sc.classList и оставляло пустой экран. Мягкий отказ: остаёмся где были, предупреждаем.
  const sc=document.getElementById(id);
  if(!sc){ console.warn('[showScreen] нет экрана «'+id+'» — переход отменён'); return; }
  // Все экраны, кроме доски, — выдвижная панель справа поверх затемнённой доски
  // (как настройки Avaz). Поэтому доска остаётся показанной под панелью.
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  sc.classList.add('active');
  const drawer = id!=='aac-main';
  if(drawer) document.getElementById('aac-main').classList.add('active');
  document.body.classList.toggle('drawer-open', drawer);
  if(anim && motionOn()){sc.classList.add(anim);setTimeout(()=>sc.classList.remove(anim),300);}
  S.screen=id;
  if(id==='aac-main') renderBoard();
  // Возврат в корень панели без следа: дальше «‹» ведёт из корня на доску.
  if(id==='menu-screen') renderPanel();   // строки меню показывают текущие значения; след возврата обнуляют только openMenu и closeCaregiverPanel
  a11yEnhance(sc);
}

// ===== ДОСКА: ПУТЬ ПО ПАПКАМ =====
// S.folderPath — список папок от дома до открытой: [{id, from, key}]. from и key
// указывают на клетку-ссылку, через которую папку открыли: у связанной папки
// («Действия» внутри «Еды») часть слов скрыта «только здесь», и это скрытие
// лежит на той самой клетке-ссылке (см. форму данных в core.js).
function homeId(){ return V[S.homeFolder] ? S.homeFolder : 'root'; }
// Путь мог указывать на удалённую папку (сменился профиль, папку убрали) — откатываемся домой.
function fixFolderPath(){
  if(!Array.isArray(S.folderPath) || !S.folderPath.length || S.folderPath.some(e=>!e || !V[e.id])) S.folderPath=[{id:homeId()}];
  if(S.folderPath[0].id!==homeId()) S.folderPath=[{id:homeId()}];
}
function currentEntry(){ fixFolderPath(); return S.folderPath[S.folderPath.length-1]; }
function currentFolder(){ return V[currentEntry().id]; }
// Скрытия «только здесь» для открытой папки: лежат на клетке-ссылке родителя.
function currentHideMap(){
  const e=currentEntry(); if(!e.from) return null;
  const link=V[e.from] && V[e.from].cells[e.key];
  return (link && link.hide) || null;
}
function goHome(){ S.folderPath=[{id:homeId()}]; S.gridPage=0; renderBoard(); persistLater(); }
function goBack(){
  if(S.folderPath.length<=1) return;   // из домашней папки «Назад» не ведёт
  S.folderPath.pop(); S.gridPage=0; renderBoard(); persistLater();
}
function goCrumb(i){
  if(i>=S.folderPath.length-1) return;
  S.folderPath=S.folderPath.slice(0,i+1); S.gridPage=0; renderBoard(); persistLater();
}
// «Ключевые слова» — отдельная папка за кнопкой столбца, открывается с любого места.
function goCore(){
  if(S.showingPath){ pathTap('side','key'); return; }
  if(!V.core) return;
  if(currentEntry().id==='core') return;
  S.folderPath.push({id:'core'}); S.gridPage=0; renderBoard(); persistLater();
}
// ===== ЕДИНСТВЕННЫЙ ВХОД В ДЕЙСТВИЕ ПО КЛЕТКЕ =====
// Через него идут оба пути: обычное нажатие и приспособления к касанию. Поэтому набор
// проверок у них один. До 23 сентября 2026 года входов было два, и проверки разошлись:
// путь приспособлений не смотрел ни на свайп, ни на перетаскивание, и жест листания
// заодно клал карточку в строку фразы — ровно у тех, кому приспособления и нужны.
function activateCell(key){
  if(swipeJustHappened || editJustDragged) return;
  if(S.showingPath){ pathTap('cell', key); return; }   // показ пути: считается только обведённая клетка
  if(S.editMode){ editTap(key); return; }   // в режиме правки нажатие выбирает, двойное открывает
  const f=currentFolder(); const cell=f && f.cells[key]; if(!cell) return;
  if(cell.folder) enterFolder(key); else addWord(cell);
}
// Имена из разметки: клетка-папка и клетка-слово зовут одно и то же.
function openFolderCell(key){ activateCell(key); }
function enterFolder(key){
  const cur=currentEntry();
  const cell=V[cur.id] && V[cur.id].cells[key];
  if(!cell || !cell.folder || !V[cell.folder]) return;
  // Папка ссылается сама на себя — не зацикливаемся, просто не идём.
  if(cell.folder===cur.id) return;
  S.folderPath.push({id:cell.folder, from:cur.id, key});
  S.gridPage=0; renderBoard(); persistLater();
  if(S.speakMode==='all') speakWord(V[cell.folder].label);   // «всё»: папка называет себя при открытии
}
// Служебные кнопки столбца называют себя, если включено «Озвучивать служебные кнопки».
function sayKey(label){ if(S.speakKeys) speakWord(label); }
// Нажатие на карточку-слово: слово встаёт в строку фразы. Готовые фразы тоже:
// в Avaz фраза попадает в строку как одно слово, а не только звучит.
function tapCell(key){ activateCell(key); }
function nextPage(){ const n=boardPageCount(); if(S.gridPage<n-1){ S.gridPage++; renderBoard(); } }
function prevPage(){ if(S.gridPage>0){ S.gridPage--; renderBoard(); } }
function boardPageCount(){ const f=currentFolder(); return f ? pageCount(f.cells, S.gridSize) : 1; }

// ===== ДОСКА: ОТРИСОВКА =====
function renderAAC(){ renderBoard(); }
function renderBoard(){
  fixFolderPath();
  const total=boardPageCount();
  if(S.gridPage>=total) S.gridPage=Math.max(0,total-1);
  // Сначала столбец: его ширина зависит от размера кнопок, а окно считает клетки
  // по оставшейся ширине. В обратном порядке последний столбец уезжал под кнопки.
  renderPath(); renderSideColumn(); renderWindow(); renderEditBar();
}

// Путь над окном: «Домой › Еда › Блюда», каждое звено нажимается.
function renderPath(){
  const el=document.getElementById('boardPath'); if(!el) return;
  el.innerHTML=S.folderPath.map((e,i)=>{
    const f=V[e.id]; const label=i===0 && e.id==='root' ? 'Домой' : (f?f.label:'…');
    const last=i===S.folderPath.length-1;
    return (i?'<span class="path-sep">›</span>':'')+
      `<button class="path-crumb${last?' is-current':''}" onclick="goCrumb(${i})"${last?' aria-current="page"':''}>${esc(label)}</button>`;
  }).join('');
}

// Окно на матрицу папки. Сетка всегда полного размера окна: пустые клетки —
// мёртвая зона, ничего не делают. Карточки НЕ пересортировываются: место карточки
// = её клетка в матрице, и оно постоянно между запусками и при любой смене окна.
function renderWindow(){
  const grid=document.getElementById('pictoGrid'); if(!grid) return;
  const f=currentFolder();
  const g=gridSize(S.gridSize);
  const anim=motionOn();
  // Клетки растягиваются на всю доску: сетка делит её поровну на ряды и столбцы
  // окна. Форма клетки зависит от формы окна, набор окон подобран так, чтобы на
  // поперечном планшете клетка была около 4 × 3 (см. GRID_SIZES в core.js).
  grid.style.gridTemplateColumns=`repeat(${g.cols},minmax(0,1fr))`;
  grid.style.gridTemplateRows=`repeat(${g.rows},minmax(0,1fr))`;
  grid.dataset.density = windowDensity(S.gridSize);   // решение «что такое крупно» живёт в ядре
  if(!f){
    grid.innerHTML='<div class="board-empty">Папки нет.<br>Нажмите «Домой».</div>';
    return;
  }
  const editing=!!S.editMode;
  const cells=windowCells(f.cells, S.gridSize, S.gridPage, currentHideMap(), editing);
  const anyVisible=Object.keys(f.cells).some(k=>f.cells[k] && !f.cells[k].hidden && !(currentHideMap()||{})[k]);
  // Пустая папка не даёт белого экрана: объясняем текстом, что карточек нет и где их добавить.
  // В режиме правки пустые клетки нажимаются, поэтому там рисуем саму сетку.
  if(!anyVisible && !editing){
    grid.innerHTML='<div class="board-empty">В этой папке пока нет карточек.<br>Меню → «Правка доски», нажмите пустую клетку.</div>';
    return;
  }
  // Пустая клетка: в общении — мёртвая зона, в режиме правки — место для нового слова или папки.
  const empty=key=> editing
    ? `<div class="cell-empty" data-key="${key}" role="button" aria-label="Пустая клетка, добавить" onclick="addIntoCell('${key}')"><span class="cell-plus">${mi('add')}</span></div>`
    : `<div class="cell-empty" aria-hidden="true"></div>`;
  const selMark=key=> editing ? `<span class="sel-circle${editSel.has(key)?' is-on':''}" aria-hidden="true"></span>` : '';
  grid.innerHTML=cells.map((x,i)=>{
    if(!x.cell) return empty(x.key);
    const popCls=(anim?' pop-in':'') + (x.hidden?` is-hidden-${x.hidden}`:'') + (editing&&editSel.has(x.key)?' is-selected':'');
    const popStyle=anim?`style="animation-delay:${i*30}ms"`:'';
    const hiddenBadge=x.hidden?`<span class="hidden-badge">${x.hidden==='here'?'скрыта здесь':'скрыта'}</span>`:'';
    if(x.cell.folder){
      const sub=V[x.cell.folder];
      if(!sub) return empty(x.key);   // ссылка на удалённую папку — пусто
      return `<div class="picto-card is-folder${popCls}" data-key="${x.key}" ${popStyle} onclick="openFolderCell('${x.key}')" title="Открыть папку">
        <span class="folder-tab"></span>${hiddenBadge}${selMark(x.key)}<div class="picto-img-wrap">${catIconHTML(sub)}</div><span class="picto-label">${esc(sub.label)}</span></div>`;
    }
    const w=x.cell, cc=catClass(w);
    const key=picKey(w);
    const imgHtml = cellImageHTML(w);   // каскад выбора картинки один на всё приложение
    const lemmaAttr = key.replace(/"/g,'&quot;');
    // Плитка — стабильный якорь: всегда словарная форма. Склонение — только в
    // строке-результате и озвучке, чтобы символ не «плыл» от нажатия к нажатию.
    return `<div class="picto-card ${cc}${popCls}" data-key="${x.key}" data-lemma="${lemmaAttr}" data-has-photo="${(w.photo||w.pictoId)?'1':'0'}" ${popStyle} onclick="tapCell('${x.key}')">
      ${hiddenBadge}${selMark(x.key)}${imgHtml}<span class="picto-label">${esc(w.text)}</span></div>`;
  }).join('');
  loadArasaacImages();   // асинхронно догружаем ARASAAC-картинки для слов без своей копии
  ensureCatPictos(cells.filter(x=>x.cell&&x.cell.folder).map(x=>V[x.cell.folder]), renderWindow);
  a11yEnhance(grid);
}
// Совместимость со старыми вызовами: раньше сетку рисовала эта функция.
function renderPictograms(){ renderWindow(); }

// Боковой столбец: «Назад», «Домой», «Главные слова», «Поиск»; когда листание
// свайпом выключено — ещё стрелки «Предыдущее» и «Следующее». Кнопка настроек
// стоит в углу столбца статично (index.html), потому что на неё навешено удержание.
// Набор кнопок и их порядок — настройка профиля (sideButtons). Столбец можно выключить
// совсем, тогда в углу остаётся только «Меню».
const SIDE_BUTTON_DEFS = {
  back:    {icon:'back',    label:'Назад'},
  home:    {icon:'home',    label:'Домой'},
  fav:     {icon:'fav',     label:'Любимая папка'},
  key:     {icon:'key',     label:'Главные слова'},
  search:  {icon:'search',  label:'Поиск'},
  prev:    {icon:'prev',    label:'Предыдущее'},
  next:    {icon:'next',    label:'Следующее'},
  alarm:   {icon:'alarm',   label:'Сигнал тревоги'},
  mistake: {icon:'mistake', label:'Я допустил ошибку'},
};
// Стрелки «Предыдущее» и «Следующее» лежат одна под другой в общем белом контейнере,
// как кнопки в строке фразы: сами стрелки чуть меньше и серые.
function pagerHtml(prevOff, nextOff){
  const one=(key,action,off)=>{ const d=SIDE_BUTTON_DEFS[key]; return `<button class="pager-btn${off?' is-off':''}" data-act="${d.icon}" onclick="sayKey('${d.label}');${action}" aria-label="${esc(d.label)}"${off?' aria-disabled="true"':''}>${mi(d.icon)}</button>`; };
  return `<div class="side-pager" role="group" aria-label="Страницы">${one('prev','prevPage()',prevOff)}${one('next','nextPage()',nextOff)}</div>`;
}
function renderSideColumn(){
  const el=document.getElementById('sideButtons'); if(!el) return;
  const main=document.getElementById('aac-main');
  if(main){ main.dataset.side = S.sideColumn==='left' ? 'left' : 'right'; main.classList.toggle('side-off', S.sideOn===false); }
  const total=boardPageCount(), page=S.gridPage;
  const canBack=S.folderPath.length>1;
  // Подпись есть только у двух кнопок-папок, «Любимая папка» и «Главные слова»: их значки
  // без слова не читаются. Остальные кнопки — квадрат со значком, имя живёт в aria-label.
  const LABELED=new Set(['fav','key']);
  const btn=(key,action,extra)=>{ const d=SIDE_BUTTON_DEFS[key]; const lab=LABELED.has(key)?`<span class="side-label">${esc(d.label)}</span>`:''; return `<button class="side-btn${LABELED.has(key)?' has-label':''}${extra&&extra.off?' is-off':''}${extra&&extra.active?' is-active':''}" data-act="${d.icon}" onclick="sayKey('${d.label}');${action}" aria-label="${esc(d.label)}"${extra&&extra.off?' aria-disabled="true"':''}>${mi(d.icon)}${lab}</button>`; };
  const list=Array.isArray(S.sideButtons)?S.sideButtons:[];
  const items=[];
  list.forEach(key=>{
    if(!SIDE_BUTTON_DEFS[key]) return;
    if(key==='back') items.push(btn('back','goBack()',{off:!canBack}));
    else if(key==='home') items.push(btn('home','goHome()'));
    else if(key==='fav') items.push(btn('fav','goFav()',{active:currentEntry().id===S.favFolder}));
    else if(key==='key') items.push(btn('key','goCore()',{active:currentEntry().id==='core'}));
    else if(key==='search') items.push(btn('search','openSearch()'));
    // Стрелки страниц стоят вместе в одном контейнере, одна под другой (решение владельца,
    // 24 сентября 2026 года). Одна стрелка без второй — обычная кнопка.
    else if((key==='prev' || key==='next') && S.paging!=='swipe'){
      const both=list.includes('prev') && list.includes('next');
      if(!both){ items.push(key==='prev' ? btn('prev','prevPage()',{off:page<=0}) : btn('next','nextPage()',{off:page>=total-1})); }
      else if(key===(list.indexOf('prev')<list.indexOf('next')?'prev':'next')){   // рисуем один раз, на месте первой из двух
        items.push(pagerHtml(page<=0, page>=total-1));
      }
    }
    else if(key==='alarm') items.push(btn('alarm','soundAlarm()'));
    else if(key==='mistake') items.push(btn('mistake','sayMistake()'));
  });
  if(S.showingPath) items.push(`<button class="side-btn side-exit" data-act="exit" onclick="exitPath()" aria-label="Выход из показа пути">${mi('close')}<span class="side-label">Выход</span></button>`);
  el.innerHTML=items.join('');
  a11yEnhance(el);
  fitSideButtons();
  applyPathGlow();
}
// Кнопки столбца квадратные. Сторона квадрата — меньшее из ширины столбца и того,
// что даёт высота: все кнопки, включая угловые, должны поместиться без прокрутки.
function fitSideButtons(){
  const col=document.querySelector('.side-column'); const el=document.getElementById('sideButtons'); if(!col||!el) return;
  // Контейнер со стрелками по высоте равен двум кнопкам с промежутком, поэтому считается за две.
  const n=el.querySelectorAll('.side-btn').length + 2*el.querySelectorAll('.side-pager').length + [...col.querySelectorAll('.side-settings')].filter(x=>x.offsetParent!==null).length;
  const cs=getComputedStyle(col), gap=parseFloat(cs.gap)||8;
  const h=col.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const maxW=Math.min(112, Math.max(56, Math.round(col.parentElement.clientWidth*0.09)));
  const side=Math.max(44, Math.floor(Math.min(maxW, n>0 ? (h - gap*(n-1))/n : maxW)));
  col.style.setProperty('--side-btn', side+'px');
}
// «Любимая папка» — папка по настройке, по умолчанию «Быстрые фразы»
function goFav(){
  const id=V[S.favFolder]?S.favFolder:'quick'; if(!V[id]) return;
  if(currentEntry().id===id) return;
  S.folderPath.push({id}); S.gridPage=0; renderBoard(); persistLater();
}
// «Сигнал тревоги» — короткий звуковой сигнал, чтобы позвать человека. Не речь:
// звук слышен и тому, кто не слушает слова. Две серии по три коротких тона.
let alarmCtx=null;
function soundAlarm(){
  try{
    alarmCtx=alarmCtx||new (window.AudioContext||window.webkitAudioContext)();
    const ctx=alarmCtx; if(ctx.state==='suspended') ctx.resume();
    const t0=ctx.currentTime;
    [0,0.22,0.44,0.9,1.12,1.34].forEach(dt=>{
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.type='sine'; o.frequency.value=880;
      g.gain.setValueAtTime(0.0001,t0+dt); g.gain.exponentialRampToValueAtTime(0.5,t0+dt+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t0+dt+0.18);
      o.connect(g); g.connect(ctx.destination); o.start(t0+dt); o.stop(t0+dt+0.2);
    });
  }catch(e){ showToast('Звук недоступен'); }
  if(navigator.vibrate) navigator.vibrate([200,100,200]);
}
// «Я допустил ошибку» — говорит фразу из настройки «говорить как»
function sayMistake(){ speakWord(S.mistakePhrase||'Я допустил ошибку'); }

// Листание свайпом (когда листание не «только стрелками»): горизонтальный жест по доске
// переворачивает страницу. Карточка срабатывает на отпускании, поэтому после свайпа нажатие гасим.
let swipeJustHappened=false, boardSwipe=null;
(function(){
  const area=document.querySelector('#aac-main .grid-area'); if(!area) return;
  area.addEventListener('pointerdown',e=>{ if(S.paging==='buttons') return; boardSwipe={x:e.clientX,y:e.clientY}; });
  area.addEventListener('pointerup',e=>{
    if(!boardSwipe) return;
    const dx=e.clientX-boardSwipe.x, dy=e.clientY-boardSwipe.y; boardSwipe=null;
    if(Math.abs(dx)<GESTURE.swipeDistance || Math.abs(dx)<Math.abs(dy)*GESTURE.swipeRatio) return;
    swipeJustHappened=true; setTimeout(()=>swipeJustHappened=false,0);
    if(dx<0) nextPage(); else prevPage();
  });
  area.addEventListener('pointercancel',()=>{ boardSwipe=null; });
})();

// ===== ПОИСК И ПОКАЗ ПУТИ (спецификация, раздел 8, «Поиск и показ пути») =====
// Весь словарь по алфавиту, у каждой записи путь от домашней папки. Нажатие на
// запись показывает путь: приложение само проходит по папкам до слова с паузами
// около секунды и подсвечивает дорогу, во фразу слово не ставит. Кнопка «Во фразу»
// ставит слово в строку сразу.
function openSearch(){
  if(S.showingPath) return;
  panelGo('search-screen');
  document.getElementById('searchInput').value='';
  renderSearchResults('');
  setTimeout(()=>document.getElementById('searchInput').focus(),200);
}
function closeSearch(){ closeCaregiverPanel(); }
// «Перейти к карточке»: сразу открыть папку со словом на нужной странице и на полторы
// секунды обвести карточку. Без ожидания шагов, в отличие от показа пути.
function goToCard(folderId, key){
  if(S.showingPath) return;
  const path=findPath(V, folderId, key, homeId());
  if(!path){ showToast('Отсюда до слова не дойти: оно выше домашней папки или скрыто'); return; }
  closeSearch();
  S.folderPath=path; const f=V[folderId]; S.gridPage=pageOfKey(f.cells, S.gridSize, key);
  renderBoard(); persistLater();
  const el=document.querySelector(`#pictoGrid [data-key="${key}"]`);
  if(el){ el.classList.add('path-glow'); setTimeout(()=>el.classList.remove('path-glow'), 1500); }
}
function pathLabel(path){
  return path.map((e,i)=> (i===0 && e.id==='root') ? 'Домой' : (V[e.id] ? V[e.id].label : '…')).join(' › ');
}
function renderSearchResults(q){
  q=(q||'').toLowerCase().trim();
  const res=[];
  for(const x of allWords()){
    const w=x.word;
    if(w.hidden) continue;
    if(!q || (w.text||'').toLowerCase().includes(q) || (w.lemma||'').toLowerCase().includes(q)) res.push({w, folderId:x.folderId, key:x.key});
  }
  res.sort((a,b)=>(a.w.text||'').localeCompare(b.w.text||'','ru'));
  const el=document.getElementById('searchResults');
  const countEl=document.getElementById('searchCount');
  if(!res.length){ el.innerHTML=uiEmpty('Ничего не найдено'); if(countEl)countEl.textContent=''; return; }
  const LIMIT=80, total=res.length;
  if(countEl) countEl.textContent = (total>LIMIT ? `Показаны первые ${LIMIT} из ${total}` : `Найдено: ${total}`);
  el.innerHTML='<div class="cg-section">'+res.slice(0,LIMIT).map(({w,folderId,key})=>{
    const path=findPath(V, folderId, key, homeId());
    const where = path ? esc(pathLabel(path)) : '<span class="search-nopath">недоступно из домашней папки</span>';
    const can=!!path;
    return uiRow({leadHtml:symbolInner(w), title:w.text, desc:where, descHtml:true, action:`goToCard('${folderId}','${key}')`,
      foot:`<button class="search-add" onclick="searchPick('${folderId}','${key}')">${mi('volume')}<span>Сказать</span></button>
        <button class="search-add${can?'':' is-off'}" onclick="goToCard('${folderId}','${key}')">${mi('next')}<span>Перейти</span></button>
        <button class="search-add${can?'':' is-off'}" onclick="showPath('${folderId}','${key}')">${mi('search')}<span>Показать путь</span></button>`});
  }).join('')+'</div>';
  ensureSymbolsFor(res.slice(0,LIMIT).map(r=>r.w), ()=>renderSearchResults(q));
  a11yEnhance(el);
}
function searchPick(folderId, key){
  closeSearch();
  const w=V[folderId] && V[folderId].cells[key];
  if(!w || w.folder) return;
  addWord(w); showToast('Добавлено: '+w.text);
}
// ===== ПОКАЗ ПУТИ, как «см. путь» у Avaz (проверено на живом приложении 23 сентября 2026) =====
// Поиск закрывается, доска возвращается домой и обводит первую папку пути мигающей
// рамкой, остальные карточки бледнеют, в столбце появляется «Выход». Дальше приложение
// ждёт, что говорящий сам нажмёт обведённую карточку; если не нажимает, через
// PATH_AUTO_MS шагает само с подсказкой. На последнем шаге обведено само слово:
// нажатие ставит его во фразу, а само приложение слово не ставит.
const PATH_AUTO_MS=10000;
let pathWalk=null;   // {path, step, timer}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function showPath(folderId, key){
  if(S.showingPath) return;
  const path=findPath(V, folderId, key, homeId());
  if(!path){ showToast('Отсюда до слова не дойти: оно выше домашней папки или скрыто'); return; }
  closeSearch();
  pathWalk={path, step:1, targetKey:key, timer:null};
  S.showingPath=true;
  const main=document.getElementById('aac-main'); if(main) main.classList.add('is-showing-path');
  S.folderPath=[path[0]]; S.gridPage=0;
  pathShowStep();
}
// Что обведено на текущем шаге: клетка папки, кнопка столбца или само слово
function pathExpected(){
  if(!pathWalk) return null;
  const {path, step, targetKey}=pathWalk;
  if(step<path.length){ const e=path[step]; return e.from ? {kind:'cell', key:e.key} : {kind:'side', act:'key'}; }
  return {kind:'cell', key:targetKey, last:true};
}
function pathShowStep(){
  if(!pathWalk) return;
  const ex=pathExpected();
  if(ex.kind==='cell'){
    const f=currentFolder();
    const p=pageOfKey(f.cells, S.gridSize, ex.key);
    if(p!==S.gridPage) S.gridPage=p;
  }
  renderBoard();
  clearTimeout(pathWalk.timer);
  pathWalk.timer=setTimeout(()=>{ showToast('Переход к следующему шагу'); pathAdvance(true); }, PATH_AUTO_MS);
}
// Рамка на ожидаемой клетке или кнопке — рисуется при каждой перерисовке доски
function applyPathGlow(){
  document.querySelectorAll('.path-glow').forEach(x=>x.classList.remove('path-glow'));
  const ex=pathExpected(); if(!ex) return;
  const el = ex.kind==='cell' ? document.querySelector(`#pictoGrid [data-key="${ex.key}"]`) : document.querySelector(`#sideButtons [data-act="${ex.act}"]`);
  if(el) el.classList.add('path-glow');
}
// Шаг вперёд: по нажатию говорящего (auto=false) или по таймеру (auto=true)
function pathAdvance(auto){
  if(!pathWalk) return;
  const {path}=pathWalk; const ex=pathExpected();
  clearTimeout(pathWalk.timer);
  if(ex.last){
    // Слово: нажатие ставит его во фразу, таймер только заканчивает показ
    const f=currentFolder(); const w=f && f.cells[ex.key];
    exitPath();
    if(!auto && w && !w.folder) addWord(w);
    return;
  }
  const e=path[pathWalk.step];
  S.folderPath=path.slice(0, pathWalk.step+1); S.gridPage=0;
  if(S.speakMode==='all' && V[e.id]) speakWord(V[e.id].label);
  pathWalk.step++;
  pathShowStep();
}
// Нажатие на доске во время показа: только на обведённое; остальное не действует
function pathTap(kind, keyOrAct){
  const ex=pathExpected(); if(!ex) return false;
  if(ex.kind===kind && (kind==='cell' ? ex.key===keyOrAct : ex.act===keyOrAct)){ pathAdvance(false); return true; }
  return false;
}
function exitPath(){
  if(!pathWalk) return;
  clearTimeout(pathWalk.timer); pathWalk=null;
  S.showingPath=false;
  const main=document.getElementById('aac-main'); if(main) main.classList.remove('is-showing-path');
  renderBoard(); persistLater();
}

// ===== ПРИСПОСОБЛЕНИЯ К КАСАНИЮ (спецификация, раздел 8, «Касание») =====
// Когда переключатель включён, карточки окна перестают быть обычными кнопками:
// касание ведёт чистая машина touchStep из core.js (по отпусканию или по нажатию,
// удержание, игнор повтора), а обычный click гасится. Под пальцем карточка
// подсвечивается, при удержании по ней бежит полоска. В режиме правки и во время
// показа пути машина не работает.
function touchActive(){ return !!S.touchOn && !S.editMode && !S.showingPath; }
function touchCfg(){ return { select: S.touchSelect==='press'?'press':'release', hold: Math.round((Number(S.touchHold)||0)*1000), repeat: Math.round((Number(S.touchRepeat)||0)*1000) }; }
(function(){
  const grid=document.getElementById('pictoGrid'); if(!grid) return;
  // Настройки снимаются один раз на жест, на его первом касании. Раньше их перечитывали
  // шесть раз внутри одного жеста, и смена настройки посреди касания меняла его правила.
  let st=touchStart(), timer=null, pressedEl=null, cfg=touchCfg();
  // Клетка под пальцем: по точке касания, а если точка вне окна (например, за краем
  // рамки ревью), по цели события. На pointerdown цель события точнее.
  const keyAt=(e, preferTarget)=>{
    const t=e.target && e.target.closest && e.target.closest('#pictoGrid .picto-card[data-key]');
    if(preferTarget && t) return t.dataset.key;
    const el=document.elementFromPoint(e.clientX, e.clientY); const c=el && el.closest('#pictoGrid .picto-card[data-key]');
    return c ? c.dataset.key : (t ? t.dataset.key : null);
  };
  const clearPress=()=>{ if(pressedEl){ pressedEl.classList.remove('is-pressed','is-holding'); pressedEl.style.removeProperty('--hold'); pressedEl=null; } clearTimeout(timer); timer=null; };
  const showPress=key=>{
    if(pressedEl && pressedEl.dataset.key===key) return;
    if(pressedEl){ pressedEl.classList.remove('is-pressed','is-holding'); pressedEl.style.removeProperty('--hold'); }
    pressedEl=grid.querySelector(`.picto-card[data-key="${key}"]`);
    if(!pressedEl) return;
    pressedEl.classList.add('is-pressed');
    if(cfg.hold>0){ pressedEl.style.setProperty('--hold', cfg.hold+'ms'); pressedEl.classList.add('is-holding'); }
  };
  const apply=(r)=>{
    st=r.state;
    if(r.fire){ clearPress(); activateCell(r.fire); }
  };
  grid.addEventListener('pointerdown',e=>{
    if(!touchActive()) return;
    const key=keyAt(e, true); if(!key) return;
    cfg=touchCfg();                       // снимок настроек на весь жест
    const r=touchStep(st, {type:'down', key, t:e.timeStamp}, cfg);
    if(r.ignored==='repeat'){ st=r.state; return; }
    apply(r);
    if(st.pressed){
      showPress(key);
      if(cfg.select==='press' && cfg.hold>0){ timer=setTimeout(()=>{ apply(touchStep(st, {type:'timer', t:e.timeStamp+cfg.hold}, cfg)); clearPress(); }, cfg.hold); }
    }
  });
  grid.addEventListener('pointermove',e=>{
    if(!touchActive() || !st.pressed) return;
    const key=keyAt(e);
    const r=touchStep(st, {type:'move', key, t:e.timeStamp}, cfg);
    st=r.state;
    if(r.ignored==='left'){ clearPress(); return; }
    if(key && cfg.select==='release') showPress(key);
  });
  const up=e=>{
    if(!touchActive()) return;
    if(!st.pressed){ clearPress(); return; }
    const r=touchStep(st, {type:'up', key:keyAt(e), t:e.timeStamp}, cfg);
    clearPress(); apply(r);
  };
  grid.addEventListener('pointerup',up);
  grid.addEventListener('pointercancel',()=>{ st=touchStart(); clearPress(); });
  // Обычный click карточек гасим: всё срабатывание идёт через машину касания
  grid.addEventListener('click',e=>{ if(touchActive() && e.target.closest('.picto-card[data-key]')){ e.stopPropagation(); e.preventDefault(); } }, true);
})();

// ===== РЕЖИМ ПРАВКИ (спецификация, раздел 8, «Правка доски») =====
// Устроен как режим «Редактировать» Avaz. Строку фразы сменяет полоса правки:
// «Готово», «Отменить», «Добавить новое», «Выбрать все» (слова наши: «Готово» и «Правка» вместо «Сделано» и «Редактировать» Avaz, решение владельца от 23 сентября 2026 года); в углу столбца вместо
// «Меню» стоит «Опции папки». У карточек кружок выбора, пустые клетки с плюсом.
// Нажатие выбирает карточку, двойное нажатие открывает папку, удержание и
// перетаскивание меняют карточки местами. Каждое действие можно отменить.
let editJustDragged=false;
const editSel=new Set();          // выбранные клетки текущей папки
const editUndoStack=[];           // снимки словаря до каждого действия, до 20 шагов
let editClipboard=[];             // скопированные клетки: слова и деревья папок, оригиналы остаются
function enterEditMode(){ S.editMode=true; editSel.clear(); editUndoStack.length=0; editClipboard=[]; applyEditMode(); renderBoard(); }
function exitEditMode(){ S.editMode=false; S.targetKey=''; S.targetFolder=''; editSel.clear(); applyEditMode(); renderBoard(); persist(); }
function applyEditMode(){ const m=document.getElementById('aac-main'); if(m) m.classList.toggle('is-editing', !!S.editMode); }
function afterEdit(){ renderBoard(); persist(); }
// Клетка-ссылка, через которую открыта текущая папка (для скрытий «только здесь»)
function currentLinkCell(){ const e=currentEntry(); if(!e.from) return null; return V[e.from] && V[e.from].cells[e.key] || null; }

// ---- Отмена ----
// Снимок словаря: всё, что нужно, чтобы вернуть его в прежний вид. Формат один на оба
// способа вернуть — «Отменить» в полосе правки и «Вернуть» в полоске сообщения после
// удаления папки. Строка фразы входит в снимок: переименование карточки меняло и её,
// а отмена возвращала только словарь, и в строке оставалось новое название.
function vocabSnapshot(){
  return { v: JSON.stringify(V), path: JSON.stringify(S.folderPath), page: S.gridPage,
           words: JSON.stringify(S.selectedWords||[]) };
}
function vocabRestore(snap){
  if(!snap) return;
  loadVocabInto(JSON.parse(snap.v));
  S.folderPath=JSON.parse(snap.path);
  S.gridPage=snap.page||0;
  S.selectedWords=JSON.parse(snap.words||'[]');
}

// Единственная дверь в правку словаря. Снимок берётся здесь, поэтому пропустить его
// нельзя — отдельного шага больше нет. Раньше снимок брали снаружи, до открытия окна:
// закрытое без сохранения окно всё равно оставляло шаг в стеке, а правка существующей
// карточки снимка не делала вовсе, и «Отменить» откатывала предыдущее действие вместо
// неё. Операция вернула false — значит она передумала, и шаг не записывается.
function editVocab(fn){
  const snap=vocabSnapshot();
  const res=fn();
  if(res===false) return false;
  editUndoStack.push(snap);
  if(editUndoStack.length>20) editUndoStack.shift();
  afterEdit();
  return res;
}
function editUndo(){
  const snap=editUndoStack.pop(); if(!snap) return;
  vocabRestore(snap);
  editSel.clear(); afterEdit(); renderStrip();
}

// ---- Полоса правки ----
function renderEditBar(){
  const el=document.getElementById('editBar'); if(!el || !S.editMode) return;
  const f=currentFolder(); if(!f) return;
  for(const k of [...editSel]) if(!f.cells[k]) editSel.delete(k);   // выбранного больше нет
  const n=editSel.size;
  const btn=(icon,label,action,off,cls)=>`<button class="edit-btn${off?' is-off':''}${cls?' '+cls:''}" onclick="${action}"${off?' aria-disabled="true"':''}>${mi(icon)}<span>${esc(label)}</span></button>`;
  let html=btn('done','Готово','exitEditMode()',false,'edit-done');
  if(!n){
    html+=`<span class="edit-title">Правка</span>`;
    html+=btn('undo','Отменить','editUndo()',!editUndoStack.length);
    html+=btn('add','Добавить новое','addToFolder()');
    if(editClipboard.length) html+=btn('paste',`Вставить (${editClipboard.length})`,'pasteClipboard()');
    html+=btn('selectall','Выбрать все','selectAllCells()', !folderCellCount(f));
  } else {
    html+=`<span class="edit-title">Выбрано: ${n}</span>`;
    html+=btn('undo','Отменить','editUndo()',!editUndoStack.length);
    if(n===1) html+=btn('edit','Изменить','editSelected()');
    const anyHidden=[...editSel].some(k=>isCellHidden(k));
    html+= anyHidden ? btn('show','Показать','showSelected()') : btn('hide','Скрыть','hideSelected()');
    html+=btn('copy','Копировать','copySelected()');
    html+=btn('trash','Удалить','deleteSelected()',false,'edit-danger');
    html+=btn('close','Снять выделение','clearSelection()');
  }
  el.innerHTML=html;
  a11yEnhance(el);
}
function folderCellCount(f){ return Object.keys(f.cells).filter(k=>f.cells[k]).length; }
function isCellHidden(key){ const f=currentFolder(); const c=f&&f.cells[key]; const link=currentLinkCell(); return !!(c && (c.hidden || (link && link.hide && link.hide[key]))); }
function selectAllCells(){ const f=currentFolder(); if(!f) return; Object.keys(f.cells).forEach(k=>{ if(f.cells[k]) editSel.add(k); }); renderBoard(); }
function clearSelection(){ editSel.clear(); renderBoard(); }
function toggleSelect(key){ if(editSel.has(key)) editSel.delete(key); else editSel.add(key); renderBoard(); }

// ---- Действия над выбранным ----
function editSelected(){
  const key=[...editSel][0]; const e=currentEntry(), c=V[e.id].cells[key]; if(!c) return;
  if(c.folder){ openEditCategoryModal(c.folder); } else { openEditCardModal(e.id, key); }
}
function hideSelected(){
  const link=currentLinkCell();
  const apply=(here)=>editVocab(()=>{
    const f=currentFolder();
    editSel.forEach(k=>{ const c=f.cells[k]; if(!c) return; if(here){ link.hide=link.hide||{}; link.hide[k]=true; } else c.hidden=true; });
    editSel.clear();
  });
  if(link) openActionMenu('Скрыть выбранные карточки', [
    {label:'Скрыть только здесь', fn:()=>apply(true)},
    {label:'Скрыть везде', fn:()=>apply(false)},
  ]);
  else apply(false);
}
function showSelected(){
  editVocab(()=>{
    const f=currentFolder(), link=currentLinkCell();
    editSel.forEach(k=>{ const c=f.cells[k]; if(!c) return; delete c.hidden; if(link && link.hide) delete link.hide[k]; });
    editSel.clear();
  });
}
function deleteSelected(){
  editVocab(()=>{
    const e=currentEntry(), f=V[e.id];
    const r=dropCells(f.cells, [...editSel]);
    f.cells=r.cells;
    // Папка без остальных ссылок уходит вместе с содержимым («Отменить» вернёт)
    r.dropped.forEach(({cell})=>{
      if(cell.folder && V[cell.folder] && cell.folder!=='core' && !folderLinks(cell.folder).length) delete V[cell.folder];
    });
    editSel.clear(); fixFolderPath();
  });
  showToast('Удалено. «Отменить» в полосе вернёт');
}

// ---- Копировать и вставить: дублирует слова и папки, оригинал остаётся ----
// Слово копируется целиком (с фото и формами). Папка копируется деревом: при
// вставке она получает новый ключ и становится отдельной папкой, а не связанной.
function copySelected(){
  const f=currentFolder(); if(!f) return;
  editClipboard=[];
  orderedKeys(f.cells).filter(k=>editSel.has(k)).forEach(k=>{
    const c=f.cells[k]; if(!c) return;
    if(c.folder){ if(V[c.folder]) editClipboard.push({folderTree:collectFolderTree(c.folder), root:c.folder}); }
    else { const w=JSON.parse(JSON.stringify(c)); delete w.hidden; editClipboard.push({word:w}); }
  });
  const n=editClipboard.length;
  editSel.clear(); renderBoard();
  showToast(n ? `Скопировано: ${n}. Откройте папку и нажмите «Вставить»` : 'Нечего копировать');
}
function pasteClipboard(key){
  const e=currentEntry(), f=V[e.id]; if(!f || !editClipboard.length) return;
  editVocab(()=>{
    const stamp=Date.now();
    // Папка вставляется деревом: каждая её папка получает новый ключ и становится
    // отдельной, а не связанной с оригиналом.
    const cells=editClipboard.map((item,i)=>{
      if(item.word) return JSON.parse(JSON.stringify(item.word));
      const ids={}; Object.keys(item.folderTree).forEach((old,j)=>{ ids[old]='copy_'+stamp+'_'+i+'_'+j; });
      Object.keys(item.folderTree).forEach(old=>{
        const sub=JSON.parse(JSON.stringify(item.folderTree[old]));
        Object.keys(sub.cells).forEach(k=>{ const c=sub.cells[k]; if(c && c.folder) c.folder=ids[c.folder]||c.folder; });
        V[ids[old]]=sub;
      });
      return {folder:ids[item.root]};
    });
    f.cells=placeCells(f.cells, cells, key).cells;
  });
  showToast(`Вставлено: ${editClipboard.length}`);
}

// ---- Добавить новое: слово, много слов, папка, связать папку ----
function addIntoCell(key){
  if(editJustDragged) return;
  const f=currentEntry();
  if(V[f.id].cells[key]) return;
  openAddNewSheet(f.id, key);
}
function addToFolder(){ const f=currentEntry(); openAddNewSheet(f.id, firstFreeCell(V[f.id].cells)); }
function openAddNewSheet(folderId, key){
  const items=[];
  if(editClipboard.length) items.push({label:`Вставить сюда (${editClipboard.length})`, fn:()=>pasteClipboard(key)});
  openActionMenu('Добавить', [...items,
    // Снимок для «Отменить» берёт само сохранение (editVocab), а не открытие окна:
    // закрытое без сохранения окно шага в стеке больше не оставляет.
    {label:'Слово', fn:()=>openAddCardInCell(folderId, key)},
    {label:'Много слов одновременно', fn:()=>openManyWords(folderId, key)},
    {label:'Папку', fn:()=>openNewFolderInCell(folderId, key)},
    {label:'Связать существующую папку', fn:()=>openLinkFolderPicker(folderId, key)},
  ]);
}
// Слова через запятую, папка помечается дефисом впереди: «хлеб, масло, -фрукты».
// Каждое встаёт в следующую свободную клетку, начиная с указанной.
function addManyWords(folderId, key, text){
  const f=V[folderId]; if(!f) return 0;
  const items=String(text||'').split(/[,\n;]+/).map(x=>x.trim()).filter(Boolean);
  if(!items.length) return 0;
  // Папки заводим внутри editVocab, а не до него: снимок для «Отменить» берётся на
  // входе, и созданное раньше осталось бы в словаре осиротевшим после отмены.
  const stamp=Date.now();
  let n=0;
  editVocab(()=>{
    const cells=items.map((item,i)=>{
      if(item[0]!=='-') return {text:item, lemma:item, pos:'noun'};
      const label=item.slice(1).trim(); if(!label) return null;
      const id='custom_'+stamp+'_'+i;
      V[id]={label, cells:{}};
      return {folder:id};
    }).filter(Boolean);
    n=cells.length;
    f.cells=placeCells(f.cells, cells, key).cells;
  });
  return n;
}
function linkFolderInto(folderId, key, targetId){
  const f=V[folderId]; if(!f || !V[targetId] || targetId===folderId) return;
  editVocab(()=>{ f.cells=placeCells(f.cells, [{folder:targetId}], key).cells; });
  showToast('Папка «'+V[targetId].label+'» связана');
}
function openLinkFolderPicker(folderId, key){
  const ids=Object.keys(V).filter(id=>id!=='root' && id!==folderId);
  if(!ids.length){ showToast('Связать пока нечего'); return; }
  openActionMenu('Связать папку', ids.map(id=>({label:V[id].label, fn:()=>linkFolderInto(folderId, key, id)})));
}

// ---- Опции папки ----
function openFolderOptions(){
  const f=currentFolder(); if(!f) return;
  openActionMenu('Опции папки: '+(currentEntry().id==='root'?'Домой':f.label), [
    {label:'Убрать пропуски', fn:removeGapsHere},
    {label:'Расставить по алфавиту', fn:arrangeAlphaHere},
    {label:'Сохранить папку в файл', fn:exportFolder},
    {label:'Загрузить папку из файла', fn:()=>document.getElementById('folderFile').click()},
  ]);
}
// Переезды внутри папки: скрытия «только здесь» на её ссылках и путь едут вместе с карточками.
function applyFolderRemap(folderId, map){
  folderLinks(folderId).forEach(l=>{ const link=V[l.folderId].cells[l.key]; if(link && link.hide) link.hide=remapHide(link.hide, map); });
  S.folderPath.forEach(en=>{ if(en.from===folderId && map[en.key]) en.key=map[en.key]; });
  const sel=[...editSel]; editSel.clear(); sel.forEach(k=>editSel.add(map[k]||k));
}
function moveOrSwap(a, b){
  const e=currentEntry(), f=V[e.id]; if(!f || a===b) return;
  editVocab(()=>{ const r=swapCells(f.cells, a, b); f.cells=r.cells; applyFolderRemap(e.id, r.map); });
}
function removeGapsHere(){
  const e=currentEntry(), f=V[e.id]; if(!f) return;
  const before=JSON.stringify(f.cells);
  editVocab(()=>{
    const r=removeGaps(f.cells); f.cells=r.cells; applyFolderRemap(e.id, r.map);
    S.gridPage=0;
  });
  showToast(before===JSON.stringify(f.cells) ? 'Пропусков нет' : 'Пропуски убраны');
}
function arrangeAlphaHere(){
  const e=currentEntry(), f=V[e.id]; if(!f) return;
  editVocab(()=>{
    const r=arrangeAlpha(f.cells, null, c=>c.folder ? ((V[c.folder]||{}).label||'') : (c.text||''));
    f.cells=r.cells; applyFolderRemap(e.id, r.map);
    S.gridPage=0;
  });
  showToast('Расставлено по алфавиту');
}
// Папка со всеми вложенными папками уходит в файл; при загрузке получает новые
// ключи и встаёт в первую свободную клетку текущей папки.
function collectFolderTree(id, acc){
  acc=acc||{}; if(acc[id] || !V[id]) return acc;
  acc[id]=JSON.parse(JSON.stringify(V[id]));
  Object.values(V[id].cells).forEach(c=>{ if(c && c.folder) collectFolderTree(c.folder, acc); });
  return acc;
}
function exportFolder(){
  const e=currentEntry(); const f=V[e.id]; if(!f) return;
  const payload={ razgovorFolder:1, root:e.id, folders:collectFolderTree(e.id) };
  const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`Папка — ${(e.id==='root'?'Домой':f.label)}.json`; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  showToast('Папка сохранена в файл');
}
function importFolder(input){
  const file=input.files && input.files[0]; input.value=''; if(!file) return;
  const r=new FileReader();
  r.onload=()=>{
    let d; try{ d=JSON.parse(String(r.result)); }catch(_){ showToast('Это не файл папки «Разговора»'); return; }
    if(!d || !d.razgovorFolder || !d.folders || !d.folders[d.root]){ showToast('В файле нет папки'); return; }
    editVocab(()=>{
      const stamp=Date.now(); const ids={};
      Object.keys(d.folders).forEach((old,i)=>{ ids[old]='imp_'+stamp+'_'+i; });
      Object.keys(d.folders).forEach(old=>{
        const f=JSON.parse(JSON.stringify(d.folders[old]));
        Object.keys(f.cells).forEach(k=>{ const c=f.cells[k]; if(c && c.folder) c.folder=ids[c.folder]||c.folder; });
        V[ids[old]]=f;
      });
      const cur=currentFolder();
      cur.cells=placeCells(cur.cells, [{folder:ids[d.root]}]).cells;
    });
    showToast('Папка «'+(d.folders[d.root].label||'')+'» загружена');
  };
  r.readAsText(file);
}

// ---- Нажатия и перетаскивание в режиме правки ----
// Нажатие выбирает, двойное нажатие на папку открывает её, удержание (0,4 с)
// делает карточку полупрозрачной и даёт перетащить: на пустую клетку — перенос,
// на другую карточку — обмен местами.
let lastEditTap={key:null, at:0};
function editTap(key){
  const f=currentFolder(); const c=f && f.cells[key]; if(!c) return;
  const now=Date.now();
  if(c.folder && lastEditTap.key===key && now-lastEditTap.at<GESTURE.doubleTap){ lastEditTap={key:null,at:0}; editSel.clear(); enterFolder(key); return; }
  lastEditTap={key, at:now};
  toggleSelect(key);
}
(function(){
  const grid=document.getElementById('pictoGrid'); if(!grid) return;
  let drag=null, holdT=null;
  const targetAt=e=>{ const el=document.elementFromPoint(e.clientX, e.clientY); return el && el.closest('[data-key]'); };
  const clearTargets=()=>grid.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target'));
  grid.addEventListener('pointerdown',e=>{
    if(!S.editMode) return;
    const card=e.target.closest('.picto-card[data-key]'); if(!card) return;
    drag={key:card.dataset.key, el:card, x:e.clientX, y:e.clientY, moved:false, armed:false};
    try{ card.setPointerCapture(e.pointerId); }catch(_){}
    clearTimeout(holdT);
    holdT=setTimeout(()=>{ if(drag){ drag.armed=true; drag.el.classList.add('is-dragging'); } }, GESTURE.holdToDrag);
  });
  grid.addEventListener('pointermove',e=>{
    if(!drag) return;
    const dx=e.clientX-drag.x, dy=e.clientY-drag.y;
    if(!drag.armed){ if(Math.hypot(dx,dy)>GESTURE.dragSlop){ clearTimeout(holdT); } return; }   // сдвиг до удержания — не перетаскивание
    drag.moved=true;
    drag.el.style.transform=`translate(${dx}px,${dy}px) scale(1.05)`;
    clearTargets();
    const t=targetAt(e); if(t && t.dataset.key!==drag.key) t.classList.add('drop-target');
  });
  const finish=e=>{
    clearTimeout(holdT);
    if(!drag) return;
    const d=drag; drag=null;
    d.el.style.transform=''; d.el.classList.remove('is-dragging'); clearTargets();
    if(!d.armed && !d.moved) return;                      // обычное нажатие — его обработает onclick
    editJustDragged=true; setTimeout(()=>editJustDragged=false,0);
    if(!d.moved) return;
    const t=targetAt(e);
    if(t && t.dataset.key && t.dataset.key!==d.key) moveOrSwap(d.key, t.dataset.key);
  };
  grid.addEventListener('pointerup',finish);
  grid.addEventListener('pointercancel',()=>{ clearTimeout(holdT); if(drag){ drag.el.style.transform=''; drag.el.classList.remove('is-dragging'); clearTargets(); drag=null; } });
})();
