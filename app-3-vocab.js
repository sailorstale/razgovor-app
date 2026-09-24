// Разговор (приложение), часть 3/6 — словарь. Классические <script> с общей глобальной
// областью видимости: порядок подключения в index.html менять нельзя, файлы
// дополняют друг друга. Грузится после core.js. Раздел: подбор словаря D1, советы D2, уровни, отмена, перетаскивание

// Готовых наборов по интересам и сценариям больше нет: словарь один для всех и
// растёт вместе с логопедом, а свои папки помощник заводит в «Словах и карточках».

// Двойное срабатывание и «барабанная дробь» по одной карточке. У ребёнка с
// моторными трудностями тремор даёт несколько нажатий подряд — во фразу они
// попадать не должны. 350 мс: осознанный повтор («ещё ещё») в него не влезает.
let lastAdd={lemma:null, at:0};
const STRIP_MAX=15;   // длиннее фраза не нужна, а полоска перестаёт помещаться

// Перерисовать то, что зависит от НАБРАННОЙ ФРАЗЫ: ленту собранных слов.
// Сетку карточек здесь НЕ трогаем сознательно — её подписи
// всегда словарная форма (стабильная раскладка, см. renderWindow в app-2-board.js),
// от набора фразы они не меняются, а лишняя пересборка сетки даёт мигание картинок
// и работу впустую на слабом планшете. Правило «эти два зовём вместе после каждой
// правки фразы» держим здесь, в одной функции, а не переписываем в каждом месте.
function rerenderPhrase(){ renderStrip(); }

function addWord(w){
  const now=Date.now();
  if(w && w.lemma===lastAdd.lemma && now-lastAdd.at<GESTURE.repeatWord) return;   // дребезг нажатия
  lastAdd={lemma:w&&w.lemma, at:now};
  if(S.selectedWords.length>=STRIP_MAX){
    showToast('Фраза уже длинная — скажите её или уберите лишнее');
    return;
  }
  // label вычисляется ДО push — getContextLabel смотрит на S.selectedWords как на контекст,
  // а не на само слово. После push «хотеть» стало бы последним модальным → вернуло бы инфинитив
  const label = S.speakMode!=='strip' ? getContextLabel(w) : null;   // «только строку» — при нажатии молчим
  S.selectedWords.push(w);
  rerenderPhrase();
  if(!label) return;
  // Своя запись важнее синтеза; «произносить как» важнее формы от движка
  if(w.audio) playAudioData(w.audio);
  else speakWord(w.speakAs || label);
}
// Внутри строки ничего не правится, как у Avaz: только «Удалить» последнее и
// «Очистить» всё. Перестановки, крестиков и повтора одного слова нет.
// Основной безопасный жест — убрать последнее слово (шаг назад)
function removeLast(){ if(!S.selectedWords.length) return; S.selectedWords.pop();  rerenderPhrase(); }
// Полная очистка — с возможностью вернуть (буфер + тост «Вернуть»)
function clearStrip(silent){
  if(!S.selectedWords.length) return;
  const buffer=S.selectedWords.slice();
  S.selectedWords=[];
  
  rerenderPhrase();
  // Автоочистка после озвучки — ожидаемый конец фразы, а не потеря: показывать
  // «Вернуть» каждый раз незачем, это шум на детском экране.
  if(silent) return;
  showUndoToast('Фраза очищена', ()=>{
    S.selectedWords=buffer;
    rerenderPhrase();
  });
}
// ===== UNDO TOAST =====
let undoTimer=null;
// Свой диалог подтверждения вместо браузерного confirm() (R-H3: без чужеродных
// системных окон; R-H4: единый стиль). Для ТЯЖЁЛЫХ необратимых действий
// (профиль целиком, перезапись из копии). Лёгкие — через undo, не через диалог.
function confirmDialog(text, onOk, opts){
  opts=opts||{};
  document.getElementById('confirmTitle').textContent = opts.title || 'Подтвердите';
  document.getElementById('confirmText').textContent = text;
  const ok=document.getElementById('confirmOkBtn');
  ok.textContent = opts.okLabel || 'Удалить';
  ok.className = 'btn-full ' + (opts.danger===false ? '' : 'btn-danger');
  openModal('confirmModal');
  ok.onclick=()=>{ closeModal('confirmModal'); if(onOk) onOk(); };
}

function showUndoToast(text, onUndo){
  const el=document.getElementById('undoToast');
  document.getElementById('undoToastText').textContent=text;
  el.classList.add('show');
  clearTimeout(undoTimer);
  undoTimer=setTimeout(()=>el.classList.remove('show'),4500);
  document.getElementById('undoToastBtn').onclick=()=>{
    el.classList.remove('show'); clearTimeout(undoTimer);
    if(onUndo) onUndo();
  };
}
function renderStrip(){
  const c=document.getElementById('stripPictograms');
  const words=S.selectedWords;
  const engine=engineOn();
  c.innerHTML=words.map((w,i)=>{
    const cc=catClass(w);
    const isLast = i===words.length-1;
    // Подпись под картинкой — форма слова, которую достроил движок: строка читается как фраза
    const caption = contextLabel(w, words.slice(0,i), engine);
    return `<div class="strip-item ${cc}${isLast&&motionOn()?' pop-in':''}"><span class="strip-sym">${symbolInner(w)}</span><span class="strip-caption">${esc(caption)}</span></div>`;
  }).join('');
  // Кнопки строки приходят вместе с первым словом и уходят с последним
  const strip=document.getElementById('messageStrip'); if(strip) strip.classList.toggle('has-words', words.length>0);
  // Строка шире экрана — подкручиваем к последнему слову: говорящий видит то, что только что нажал
  if(c.scrollWidth>c.clientWidth) c.scrollLeft=c.scrollWidth;
  ensureSymbolsFor(words, renderStrip);
}
// Текст фразы для озвучки и «Поделиться». Слово с «произносить как» уходит в
// движок готовой фразой: его форму задал помощник, движок её не меняет.
function phraseText(){
  const words=S.selectedWords.map(w=> w.speakAs ? {text:w.speakAs, lemma:w.speakAs, pos:'phrase', isPhrase:true} : w);
  return grammar(words, engineOn());
}
// «Поделиться»: по настройке картинкой (строка с картинками и подписями и текст
// фразы под ней) или текстом. Картинка уходит в системное окно, а где его нет,
// сохраняется файлом; текст уходит в окно или в буфер обмена.
async function shareMessage(){
  const t=phraseText(); if(!t){ showToast('Фраза пуста'); return; }
  if(S.shareAs!=='text'){
    const blob=await renderPhraseImage().catch(()=>null);
    if(blob){
      const file=new File([blob], 'Разговор — фраза.png', {type:'image/png'});
      try{
        if(navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file], text:t}); return; }
      }catch(e){ if(e && e.name==='AbortError') return; }
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=file.name; a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),1000);
      showToast('Картинка с фразой сохранена'); return;
    }
    // картинку собрать не удалось (чужой сервер картинок не разрешил) — делимся текстом
  }
  try{
    if(navigator.share){ await navigator.share({text:t}); return; }
    if(navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(t); showToast('Фраза скопирована'); return; }
  }catch(e){ if(e && e.name==='AbortError') return; }
  showToast('Не удалось поделиться');
}
// Картинка фразы: строка карточек с подписями и текст фразы под ней
function renderPhraseImage(){
  return new Promise((resolve,reject)=>{
    const words=S.selectedWords, engine=engineOn();
    const cell=150, pad=20, gap=12, capH=34, textH=56;
    const W=Math.max(400, pad*2 + words.length*cell + (words.length-1)*gap), H=pad+cell+capH+textH+pad;
    const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
    const ctx=cv.getContext('2d');
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
    // Адреса картинок спрашиваем у общего каскада, а не читаем обратно из нарисованной
    // строки фразы: иначе картинку нельзя собрать, когда строка сейчас не на экране.
    const srcs=words.map(w=>wordImage(w, 300).src || null);
    let done=0;
    const finish=()=>{ try{ cv.toBlob(b=>b?resolve(b):reject(new Error('blob')), 'image/png'); }catch(e){ reject(e); } };
    const drawCaption=(i)=>{
      const w=words[i]; const caption=contextLabel(w, words.slice(0,i), engine);
      ctx.fillStyle='#222'; ctx.font='600 20px Inter, sans-serif'; ctx.textAlign='center';
      ctx.fillText(caption, pad+i*(cell+gap)+cell/2, pad+cell+24, cell);
    };
    ctx.fillStyle='#111'; ctx.font='700 26px Inter, sans-serif'; ctx.textAlign='left';
    ctx.fillText(phraseText(), pad, pad+cell+capH+36, W-pad*2);
    if(!words.length) return finish();
    words.forEach((w,i)=>{
      const x=pad+i*(cell+gap), y=pad;
      ctx.strokeStyle='#DDD'; ctx.lineWidth=2; ctx.strokeRect(x,y,cell,cell);
      drawCaption(i);
      const src=srcs[i];
      if(!src){ if(++done===words.length) finish(); return; }
      const img=new Image(); img.crossOrigin='anonymous';
      img.onload=()=>{ const r=Math.min((cell-16)/img.width,(cell-16)/img.height); const dw=img.width*r, dh=img.height*r; ctx.drawImage(img, x+(cell-dw)/2, y+(cell-dh)/2, dw, dh); if(++done===words.length) finish(); };
      img.onerror=()=>{ if(++done===words.length) finish(); };
      img.src=src;
    });
  });
}
