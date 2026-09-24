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
  if(v.localService===false)                           s+=2;   // онлайн-голоса обычно нейросетевые
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
// ===== ЖИВОЙ ГОЛОС: гибрид «кэш → системный» =====
// Правило номер один для AAC: ребёнок НИКОГДА не ждёт сеть.
//   • фраза есть в кэше → играем живой нейросетевой голос (мгновенно, и офлайн тоже);
//   • нет в кэше       → сразу говорим системным голосом, а живой тихо догружаем
//                        в фон, чтобы в следующий раз он уже был;
//   • офлайн           → всегда системный.
// Сам ключ провайдера у нас на сервере, клиент ходит только в свой /api/tts.
const TTS_CACHE='razgovor-tts-v1';
let ttsAudio=null;              // текущее воспроизведение
let ttsOff=false;               // сервер сказал «не настроено» — больше не дёргаем

const ttsUrl=t=>'/api/tts?text='+encodeURIComponent(t);

async function ttsCached(t){
  if(!('caches'in window)) return null;
  try{ return await (await caches.open(TTS_CACHE)).match(ttsUrl(t)); }catch(e){ return null; }
}
// Догрузить и положить в кэш. Возвращает true, если фраза теперь есть.
async function ttsWarm(t){
  if(ttsOff || !S.cloudVoice || !('caches'in window)) return false;
  if(navigator.onLine===false) return false;
  try{
    const c=await caches.open(TTS_CACHE);
    if(await c.match(ttsUrl(t))) return true;
    const r=await fetch(ttsUrl(t));
    if(!r.ok){ if(r.status===503||r.status===404) ttsOff=true; return false; }
    await c.put(ttsUrl(t), r.clone());
    return true;
  }catch(e){ return false; }
}
async function ttsPlay(resp, opts){
  try{
    const url=URL.createObjectURL(await resp.blob());
    if(ttsAudio){ try{ ttsAudio.pause(); }catch(e){} }
    if('speechSynthesis'in window) speechSynthesis.cancel();
    const a=new Audio(url); ttsAudio=a;
    a.playbackRate=S.speechRate||1;
    if(opts.onstart) a.onplay=opts.onstart;
    a.onended=()=>{ URL.revokeObjectURL(url); if(opts.onend) opts.onend(); };
    a.onerror=()=>{ URL.revokeObjectURL(url); if(opts.onerror) opts.onerror(); };
    await a.play();
    return true;
  }catch(e){ return false; }
}
// Прогрев словаря: заранее синтезируем частые слова, чтобы живой голос звучал
// с первого раза. Тихо, по одному, только онлайн и только если живой голос включён.
async function ttsWarmVocabulary(limit){
  if(ttsOff || !S.cloudVoice || navigator.onLine===false) return;
  const words=[];
  for(const x of allWords()){ if(x.word.text) words.push(x.word.text); }
  for(const t of words.slice(0, limit||60)){
    if(ttsOff) break;
    await ttsWarm(t);
  }
}

// Озвучка. Возвращает «хэндл» синхронно — вызывающий код проверяет его на
// «синтез вообще возможен», поэтому облачная ветка обязана вернуть не-null.
// Сколько ждём живой голос, прежде чем сказать системным.
// Замер: синтез новой фразы укладывается в 0.3–0.5 с, так что бюджета хватает
// с запасом. Раньше здесь было «не ждём вообще» — и это ломало главный сценарий:
// собранные фразы каждый раз новые (их лепит грамматический движок), а одиночный
// тап произносит склонённую форму («сока»), которой в прогреве нет. Промах по
// кэшу → системный голос. Чем больше нажатий, тем чаще «сваливались» на него.
const TTS_WAIT_MS = 900;

function speak(t, rate, opts){
  opts=opts||{};
  if(S.cloudVoice && ('caches'in window) && !ttsOff){
    const handle={cloud:true};
    let spoken=false;                                  // защита от двойного произнесения
    const saySystem=()=>{ if(spoken) return; spoken=true; speakSystem(t,rate,opts); };
    const playOr=async resp=>{
      spoken=true;
      if(await ttsPlay(resp,opts)) return true;
      spoken=false; saySystem(); return false;         // аудио не проигралось — откат
    };

    ttsCached(t).then(async hit=>{
      if(hit) return playOr(hit);                      // уже есть — мгновенно
      if(navigator.onLine===false) return saySystem(); // офлайн — не ждём впустую
      // даём живому голосу короткий шанс; не успел — говорим системным,
      // но фразу всё равно докачиваем, чтобы в следующий раз была мгновенно
      const timer=setTimeout(saySystem, TTS_WAIT_MS);
      const ok=await ttsWarm(t);
      clearTimeout(timer);
      if(spoken) return;                               // не уложились — уже сказали
      const fresh=ok ? await ttsCached(t) : null;
      if(fresh) return playOr(fresh);
      saySystem();
    }).catch(saySystem);
    return handle;
  }
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
  if(opts.onerror) u.onerror=opts.onerror;
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

