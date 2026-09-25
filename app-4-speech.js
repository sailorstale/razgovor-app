// Разговор (приложение), часть 4/6 — речь. Классические <script> с общей глобальной
// областью видимости: порядок подключения в index.html менять нельзя, файлы
// дополняют друг друга. Грузится после core.js. Раздел: озвучка, живой голос, партнёр-показ, моделирование, подсказки

// ===== TTS =====
// Подбор голоса. ГЛАВНОЕ ПРАВИЛО: высоту тона (pitch) не трогаем.
// Раньше пол «подделывался» сдвигом pitch (0.8 мужской / 1.25 женский) поверх ЛЮБОГО
// голоса — и это давало металлический, роботизированный призвук. Особенно в типичном
// случае, когда в системе всего один русский голос (например только Milena): её либо
// занижали, либо задирали, и натуральной высотой она не звучала никогда.
const RU_FEMALE=/(milena|katya|katia|alyona|alena|female|женск|дарь|раис|анна|ольг|светлана|татьян)/i;
const RU_MALE=/(yuri|pavel|dmitr|male|мужск|артём|артем|максим|никол|алексан)/i;

function ruVoices(){
  try{ return speechSynthesis.getVoices().filter(v=>v.lang&&v.lang.toLowerCase().startsWith('ru')); }
  catch(e){ return []; }
}
// Балл натуральности: скачиваемые «улучшенные» и нейросетевые голоса звучат заметно живее
function voiceScore(v){
  const n=(v.name||'').toLowerCase();
  let s=0;
  if(/premium|enhanced|neural|natural|улучшен/.test(n)) s+=10;
  if(/siri/.test(n))                                   s+=6;
  if(/google|microsoft/.test(n))                       s+=3;
  // Сетевые голоса (в Chrome это «Google …») работают только с интернетом, а в Chrome
  // с версии 130 ещё и ломаются: браузер молча читает текст голосом по умолчанию,
  // то есть английским. Поэтому по умолчанию берём голос, установленный на устройстве.
  if(v.localService===false)                           s-=6;
  if(/compact|eloquence|espeak/.test(n))               s-=10;  // заведомо роботизированные
  return s;
}
function bestRuVoices(){ return ruVoices().slice().sort((a,b)=>voiceScore(b)-voiceScore(a)); }

function pickVoice(){
  const sorted=bestRuVoices();
  if(!sorted.length) return null;
  // 1) взрослый выбрал конкретный голос — уважаем выбор
  if(S.voiceURI){ const exact=sorted.find(v=>v.voiceURI===S.voiceURI); if(exact) return exact; }
  // 2) пожелание по полу — только если такой голос РЕАЛЬНО есть (иначе не подделываем)
  const want = S.voice==='female'?RU_FEMALE : S.voice==='male'?RU_MALE : null;
  if(want){ const m=sorted.find(v=>want.test(v.name)); if(m) return m; }
  // 3) иначе — самый натуральный из доступных
  return sorted[0];
}
function applyVoice(u){
  const v=pickVoice();
  if(v) u.voice=v;
  // Если русского голоса не нашлось, u.voice остаётся пустым — и браузер прочитает
  // кириллицу голосом ПО УМОЛЧАНИЮ, обычно английским. Это слышно как «русские
  // слова с английским акцентом». Молчать об этом нельзя: помечаем и предупреждаем.
  noRuVoice = !v;
  u.pitch=1;   // натуральная высота: никаких искусственных сдвигов
}

// Список голосов приходит асинхронно: сразу после загрузки страницы getVoices()
// часто пуст. Если в этот момент заговорить, голос будет английский. Поэтому
// первый раз дожидаемся списка (недолго и ровно один раз за сессию).
let _voicesP=null;
function whenVoicesReady(timeout=1200){
  if(_voicesP) return _voicesP;
  _voicesP=new Promise(res=>{
    if(!('speechSynthesis'in window)) return res([]);
    const get=()=>speechSynthesis.getVoices()||[];
    if(get().length) return res(get());
    let done=false;
    const finish=()=>{ if(done)return; done=true; refreshVoiceState(); res(get()); };
    try{ speechSynthesis.addEventListener('voiceschanged', finish, {once:true}); }catch(e){}
    setTimeout(finish, timeout);
  });
  return _voicesP;
}
// Состояние голосов: предупреждаем взрослого один раз, если русского голоса нет
let voicesLoaded=false, noRuVoice=false, ruVoiceWarned=false;
function refreshVoiceState(){
  try{
    const vs=speechSynthesis.getVoices();
    if(vs && vs.length){ voicesLoaded=true; noRuVoice=!vs.some(v=>v.lang&&v.lang.toLowerCase().startsWith('ru')); }
  }catch(e){}
}
function warnIfNoVoice(){
  if(ruVoiceWarned) return;
  if(!('speechSynthesis'in window)){ ruVoiceWarned=true; showToast('На устройстве нет синтеза речи'); return; }
  if(voicesLoaded && noRuVoice){ ruVoiceWarned=true; showToast('Нет русского голоса: слова читает английский голос. Установите русский в настройках устройства — см. «Голос и озвучка».'); }
}
// ===== ЖИВОЙ ГОЛОС: записи лежат рядом с приложением =====
// Правило номер один для AAC: ребёнок НИКОГДА не ждёт сеть. Поэтому голос не
// считается на лету, а наговорён заранее и лежит файлами в voice/. Открылось
// приложение — голос уже на устройстве и дальше работает вообще без сети.
//   • строка есть в банке → играем записанный голос, мгновенно;
//   • строки нет (слово завёл взрослый) → говорит голос устройства, как раньше;
//   • голос не выбран → голос устройства.
// Текст фразы никуда не уходит: это речь человека с нарушением речи.
let voiceBank=null;             // опись: текст → имя файла
let voiceBankLoading=null;
let bankAudio=null;             // один общий элемент: Safari разрешает звук
let bankUnlocked=false;         // только из касания или после разблокировки

// Тёплый тон лежит отдельной папкой: у части голосов его нет, и тогда играет
// нейтральный — переключатель для них в настройках не показывается.
const voiceDir=(voice,warm)=>{
  if(!warm) return voice;
  const v=voiceBank && voiceBank.voices && voiceBank.voices.filter(x=>x.id===voice)[0];
  return (v && v.warm) ? voice+'-warm' : voice;
};
const voiceSrc=(voice,text,warm)=>{
  const file=voiceBank && voiceBank.strings && voiceBank.strings[text];
  return file ? 'voice/'+voiceDir(voice, warm)+'/'+file : null;
};

function loadVoiceBank(){
  if(voiceBank || voiceBankLoading) return voiceBankLoading||Promise.resolve(voiceBank);
  voiceBankLoading=fetch('voice/index.json')
    .then(r=>r.ok?r.json():null)
    .then(j=>{ voiceBank=j||{strings:{},voices:[]}; return voiceBank; })
    .catch(()=>{ voiceBank={strings:{},voices:[]}; return voiceBank; });
  return voiceBankLoading;
}

// Safari на iPhone и iPad пускает звук только из обработчика касания. Поэтому
// элемент создаём заранее и «раскрываем» его на первом касании экрана: дальше
// достаточно сменить адрес и позвать play(), без ожиданий между жестом и звуком.
function unlockBankAudio(){
  if(bankUnlocked) return;
  try{
    bankAudio=bankAudio||new Audio();
    bankAudio.muted=true;
    const p=bankAudio.play();
    if(p&&p.then) p.then(()=>{ bankAudio.pause(); bankAudio.muted=false; }).catch(()=>{ bankAudio.muted=false; });
    else { bankAudio.pause(); bankAudio.muted=false; }
  }catch(e){ /* не вышло — сыграем при первом слове */ }
  bankUnlocked=true;
}
if(typeof document!=='undefined'){
  document.addEventListener('pointerdown', unlockBankAudio, {once:true, capture:true});
  document.addEventListener('touchstart', unlockBankAudio, {once:true, capture:true});
}

// Проиграть записанную строку. Возвращает false, если записи нет.
function playFromBank(t, opts){
  opts=opts||{};
  const src=voiceSrc(S.bakedVoice, t, S.bakedWarm);
  if(!src) return false;
  try{
    if('speechSynthesis'in window) speechSynthesis.cancel();
    bankAudio=bankAudio||new Audio();
    bankAudio.onended=null; bankAudio.onerror=null;
    bankAudio.src=src;
    bankAudio.playbackRate=S.speechRate||1;
    if(opts.onstart) bankAudio.onplay=opts.onstart;
    bankAudio.onended=()=>{ if(opts.onend) opts.onend(); };
    bankAudio.onerror=()=>{ if(opts.onerror) opts.onerror(); };
    const p=bankAudio.play();
    if(p&&p.catch) p.catch(()=>{ speakSystem(t,null,opts); });
    return true;
  }catch(e){ return false; }
}

// Проба голоса для настроек: несколько настоящих фраз подряд, чтобы услышать,
// как голос звучит на деле, а не на одном слове.
const VOICE_SAMPLE=['Я хочу пить','Мне больно','Я люблю маму'];
function playVoiceSample(voice, warm){
  loadVoiceBank().then(()=>{
    let i=0;
    const next=()=>{
      if(i>=VOICE_SAMPLE.length) return;
      const src=voiceSrc(voice, VOICE_SAMPLE[i++], warm===undefined?S.bakedWarm:warm);
      if(!src) return next();
      bankAudio=bankAudio||new Audio();
      bankAudio.onended=next; bankAudio.onerror=next;
      bankAudio.src=src; bankAudio.playbackRate=S.speechRate||1;
      const p=bankAudio.play(); if(p&&p.catch) p.catch(()=>{});
    };
    if('speechSynthesis'in window) speechSynthesis.cancel();
    next();
  });
}

// Скачать весь банк выбранного голоса, чтобы он работал и без сети. Тихо, по
// одному файлу: служебный слой складывает их в свой запас по дороге.
async function warmVoiceBank(voice){
  await loadVoiceBank();
  if(!voiceBank || !voiceBank.strings) return;
  if(navigator.onLine===false) return;
  const dir=voiceDir(voice, S.bakedWarm);
  for(const file of Object.values(voiceBank.strings)){
    try{ await fetch('voice/'+dir+'/'+file, {cache:'force-cache'}); }catch(e){ break; }
  }
}

// Озвучка. Возвращает «хэндл» синхронно — вызывающий код проверяет его на
// «синтез вообще возможен».
function speak(t, rate, opts){
  opts=opts||{};
  if(S.bakedVoice && voiceBank && playFromBank(t, opts)) return {baked:true};
  return speakSystem(t,rate,opts);
}

// Системная озвучка с реальными событиями речи (onstart/onend/onerror)
function speakSystem(t, rate, opts){
  opts=opts||{};
  if(!('speechSynthesis'in window)){ if(opts.onend)opts.onend(); return null; }
  // Голоса ещё не подъехали — подождём список, иначе фразу прочитает английский
  // голос по умолчанию. Ждём один раз за сессию и недолго.
  if(!ruVoices().length && !_voicesP){
    const handle={pending:true};
    whenVoicesReady().then(()=>speakSystemNow(t,rate,opts));
    return handle;
  }
  return speakSystemNow(t,rate,opts);
}
function speakSystemNow(t, rate, opts){
  opts=opts||{};
  speechSynthesis.cancel();
  refreshVoiceState(); warnIfNoVoice();
  const u=new SpeechSynthesisUtterance(t);
  u.lang='ru-RU'; u.rate=rate||S.speechRate||.9; applyVoice(u);
  if(opts.onstart) u.onstart=opts.onstart;
  if(opts.onend)   u.onend=opts.onend;
  // Сетевой голос не ответил — повторяем локальным, чтобы фраза не пропала
  // и не прозвучала английским голосом по умолчанию.
  u.onerror=ev=>{
    const err=ev&&ev.error;
    if(u.voice && u.voice.localService===false && err!=='interrupted' && err!=='canceled'){
      const local=bestRuVoices().find(v=>v.localService!==false);
      if(local){
        const u2=new SpeechSynthesisUtterance(t);
        u2.lang='ru-RU'; u2.rate=u.rate; u2.pitch=1; u2.voice=local;
        if(opts.onstart) u2.onstart=opts.onstart;
        if(opts.onend)   u2.onend=opts.onend;
        if(opts.onerror) u2.onerror=opts.onerror;
        speechSynthesis.speak(u2); return;
      }
    }
    if(opts.onerror) opts.onerror(ev);
  };
  speechSynthesis.speak(u);
  return u;
}
function speakText(t){ return speak(t); }   // скорость — из S.speechRate (сенсорная панель)
function speakWord(t){ return speak(t); }
function speakMessage(){
  const t=phraseText();
  if(!t){showToast('Выберите картинки');return;}
  const b=document.getElementById('btnSpeak');
  let finished=false;
  const done=()=>{ if(finished)return; finished=true; clearTimeout(b._speakFallback); b.classList.remove('speaking'); if(S.autoClear) clearStrip(true); };
  b.classList.add('speaking');
  const u=speak(t,null,{ onend:done, onerror:done });
  if(!u){ done(); return; }                 // синтеза нет — не имитируем «сказал»
  // Страховка, если браузер не пришлёт onend: время соразмерно длине фразы
  b._speakFallback=setTimeout(done, Math.max(2000, t.length*90)+1500);
}

// ===== PARTNER VIEW (тихий показ сообщения взрослому) =====
// ===== ПОКАЗ ФРАЗЫ ВЗРОСЛЫМ УБРАН =====
// Режим «Говорит взрослый» и все подсказки взрослому на детской доске сняты
// 30 августа 2026 года. Показ фразы взрослым в методике не описан, а продукт
// ничего поверх методики не придумывает. Вместе с режимом ушли полоса подсказки
// про паузу, напоминание откликнуться и еженедельное приглашение попробовать приём.
// Что делает взрослый вместо этого, описано в обучении: он принимает планшет
// из рук ребёнка, читает фразу вслух пальцем по карточкам и сразу отвечает.

