// Разговор (приложение), часть 5/6 — редактирование. Классические <script> с общей глобальной
// областью видимости: порядок подключения в index.html менять нельзя, файлы
// дополняют друг друга. Грузится после core.js. Раздел: редактор карточек, пикеры, папки словаря, панель настроек

// ===== ADD CARD MODAL =====
function resetPhotoUI(){
  S.newCardPhoto=null; S.newCardPictoId=null; S.bgRemoved=false;
  document.getElementById('photoUpload').innerHTML='<span class="pu-icon" data-mi="images"></span><span class="pu-text">Картинка подберётся по слову. Нажмите, чтобы выбрать свою</span>';
  document.getElementById('photoActions').style.display='none';
  renderIcons(document.getElementById('addCardModal'));
}
// Показать выбранную картинку в окне карточки
function showCardImage(src, isSymbol){
  document.getElementById('photoUpload').innerHTML=`<img src="${src}" id="previewImg">`;
  document.getElementById('photoActions').style.display= isSymbol ? 'none' : 'flex';
  const rb=document.getElementById('btnRemoveBg'); if(rb){ rb.className='photo-action-btn'; rb.textContent='Удалить фон'; }
  const drop=document.getElementById('noPhotoActions'); if(drop) drop.style.display='none';
  if(isSymbol){ document.getElementById('photoActions').style.display='flex'; ['Повернуть','Обрезать до квадрата','Удалить фон'].forEach(t=>{ [...document.querySelectorAll('#photoActions .photo-action-btn')].forEach(b=>{ if(b.textContent.trim()===t) b.style.display='none'; }); }); }
  else [...document.querySelectorAll('#photoActions .photo-action-btn')].forEach(b=>b.style.display='');
}
function pickCardSymbol(id){ S.newCardPictoId=id; S.newCardPhoto=null; S.bgRemoved=false; showCardImage(arasaacUrl(id,300), true); }
function clearCardImage(){ resetPhotoUI(); }
// Гифка хранится как есть, без ужатия: иначе пропадёт движение. Только небольшие файлы.
function handleGif(input){
  const f=input.files && input.files[0]; input.value=''; if(!f) return;
  if(f.size>1500000){ showToast('Гифка слишком большая: нужна до полутора мегабайт'); return; }
  const r=new FileReader();
  r.onload=e=>{ S.newCardPhoto=e.target.result; S.newCardPictoId=null; S.bgRemoved=false; showCardImage(S.newCardPhoto,false); };
  r.readAsDataURL(f);
}
// Повернуть на четверть оборота по часовой стрелке
function rotatePhoto(){
  if(!S.newCardPhoto) return;
  const img=new Image();
  img.onload=()=>{
    const cv=document.createElement('canvas'); cv.width=img.height; cv.height=img.width;
    const ctx=cv.getContext('2d'); ctx.translate(cv.width,0); ctx.rotate(Math.PI/2); ctx.drawImage(img,0,0);
    S.newCardPhoto=cv.toDataURL('image/png'); showCardImage(S.newCardPhoto,false);
  };
  img.src=S.newCardPhoto;
}
// Обрезать до квадрата по центру: на карточке квадрат смотрится ровнее
function cropPhotoSquare(){
  if(!S.newCardPhoto) return;
  const img=new Image();
  img.onload=()=>{
    const side=Math.min(img.width,img.height);
    const cv=document.createElement('canvas'); cv.width=side; cv.height=side;
    cv.getContext('2d').drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,side,side);
    S.newCardPhoto=cv.toDataURL('image/png'); showCardImage(S.newCardPhoto,false);
  };
  img.src=S.newCardPhoto;
}

// ===== ЗВУК СЛОВА: своя запись и «произносить как» =====
let cardRecorder=null, cardChunks=[], cardAudioEl=null;
function setAudioUI(){
  const has=!!S.newCardAudio;
  const p=document.getElementById('btnPlayAudio'), d=document.getElementById('btnDropAudio'), r=document.getElementById('btnRecord');
  if(p) p.style.display=has?'':'none'; if(d) d.style.display=has?'':'none';
  if(r && !cardRecorder){ r.innerHTML='<span class="chip-icon" data-mi="mic"></span>'+(has?'Записать заново':'Записать свой голос'); renderIcons(r); }
}
async function toggleRecord(){
  const r=document.getElementById('btnRecord');
  if(cardRecorder){ cardRecorder.stop(); return; }
  if(!navigator.mediaDevices || !window.MediaRecorder){ showToast('Запись звука здесь недоступна'); return; }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    cardChunks=[]; cardRecorder=new MediaRecorder(stream);
    cardRecorder.ondataavailable=e=>{ if(e.data && e.data.size) cardChunks.push(e.data); };
    cardRecorder.onstop=()=>{
      stream.getTracks().forEach(t=>t.stop());
      const blob=new Blob(cardChunks,{type:cardRecorder.mimeType||'audio/webm'});
      cardRecorder=null;
      if(blob.size>600000){ showToast('Запись длинная: держите её до нескольких секунд'); setAudioUI(); return; }
      const fr=new FileReader(); fr.onload=()=>{ S.newCardAudio=fr.result; setAudioUI(); showToast('Записано'); }; fr.readAsDataURL(blob);
    };
    cardRecorder.start();
    r.innerHTML='<span class="chip-icon" data-mi="stop"></span>Стоп'; renderIcons(r);
  }catch(e){ cardRecorder=null; showToast('Нет доступа к микрофону'); }
}
function playCardAudio(){ if(!S.newCardAudio) return; playAudioData(S.newCardAudio); }
function dropCardAudio(){ S.newCardAudio=null; setAudioUI(); }
function playAudioData(dataUrl){
  try{ if(cardAudioEl){ cardAudioEl.pause(); } cardAudioEl=new Audio(dataUrl); cardAudioEl.play().catch(()=>{}); }catch(e){}
}
function resetSmartFields(){
  S.newCardDirectional=''; S.newCardGender='';
  document.getElementById('smartFieldVerb').style.display='none';
  document.getElementById('smartFieldNoun').style.display='none';
  ['vf_ya','vf_ty','vf_on','vf_my','vf_oni'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('nounDirectionalInput').value='';
  document.querySelectorAll('#genderChips .gs-opt').forEach(c=>c.classList.toggle('active',c.dataset.gender===''));
}
// Карточка адресуется папкой и клеткой матрицы: S.addingToCategory — id папки,
// S.editingWordKey — ключ клетки «ряд:столбец» ('' когда добавляем новую).
// key — клетка, куда встанет новая карточка; '' — первая свободная.
function openAddCardInCell(folderId, key){
  S.editingWordKey=''; S.targetKey=key||'';
  S.addingToCategory=folderId; S.newCardPhoto=null; S.newCardPictoId=null; S.newCardAudio=null; S.newCardEmoji=''; S.newCardPOS='noun';
  document.getElementById('newCardText').value='';
  document.getElementById('speakAsInput').value='';
  document.getElementById('cardModalTitle').textContent='Новая карточка';
  document.getElementById('cardModalSaveBtn').textContent='Добавить';
  setAudioUI();
  // Без сброса «умные поля» протекали с прошлой карточки: новое слово молча
  // получало чужое направление («в лес») или чужой род — и фраза врала.
  resetPhotoUI(); resetSmartFields();
  document.querySelectorAll('#posChips .gs-opt').forEach(c=>{c.classList.toggle('active',c.dataset.pos==='noun');});
  openModal('addCardModal');
}
function openEditCardModal(catKey, key){
  const w=V[catKey] && V[catKey].cells[key];
  if(!w || w.folder){ showToast('Карточки больше нет'); renderBoard(); return; }
  S.editingWordKey=key;
  S.addingToCategory=catKey;
  S.newCardPhoto=w.photo||null; S.newCardPictoId=w.pictoId||null; S.newCardAudio=w.audio||null; S.newCardEmoji=''; S.newCardPOS=w.pos||'noun';
  document.getElementById('newCardText').value=w.text;
  document.getElementById('speakAsInput').value=w.speakAs||'';
  setAudioUI();
  document.getElementById('cardModalTitle').textContent='Правка карточки';
  document.getElementById('cardModalSaveBtn').textContent='Сохранить';
  if(w.photo) showCardImage(w.photo,false);
  else if(w.pictoId) showCardImage(arasaacUrl(w.pictoId,300),true);
  else resetPhotoUI();
  document.querySelectorAll('#posChips .gs-opt').forEach(c=>{c.classList.toggle('active',c.dataset.pos===S.newCardPOS);});
  // Показываем СВОИ значения карточки, а не остатки от предыдущей и не догадки
  // автозаполнения: иначе помощник правит одно, а сохраняется другое.
  resetSmartFields();
  updateSmartField();
  if(w.customConj){
    const f=w.customConj;
    const set=(id,v)=>{ const el=document.getElementById(id); if(el&&v) el.value=v; };
    set('vf_ya',f.я); set('vf_ty',f.ты); set('vf_on',f.он); set('vf_my',f.мы); set('vf_oni',f.они);
  }
  if(w.customDirectional){
    S.newCardDirectional=w.customDirectional;
    const el=document.getElementById('nounDirectionalInput'); if(el) el.value=w.customDirectional;
  }
  if(w.customGender){
    S.newCardGender=w.customGender;
    document.querySelectorAll('#genderChips .gs-opt').forEach(c=>c.classList.toggle('active',c.dataset.gender===w.customGender));
  }
  openModal('addCardModal');
}

// Фото с камеры — 3–12 мегапикселей и 5–15 МБ. Хранить такое незачем: на карточке
// картинка примерно 120 px. Ужимаем сразу при загрузке — иначе (а) переполняется
// хранилище браузера (лимит ~5 МБ на всё приложение, словарь говорящего перестаёт
// сохраняться), (б) «удалить фон» обходит миллионы пикселей и подвешивает планшет.
const PHOTO_MAX_SIDE=512;
function shrinkPhoto(dataUrl){
  return new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{
      const side=Math.max(img.width,img.height);
      const scale=Math.min(1, PHOTO_MAX_SIDE/side);
      if(scale===1 && dataUrl.length<300*1024) return resolve(dataUrl); // уже маленькое
      try{
        const c=document.createElement('canvas');
        c.width=Math.max(1,Math.round(img.width*scale));
        c.height=Math.max(1,Math.round(img.height*scale));
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        resolve(c.toDataURL('image/jpeg',0.85));
      }catch(e){ resolve(dataUrl); }
    };
    img.onerror=()=>resolve(dataUrl);
    img.src=dataUrl;
  });
}
function handlePhoto(input){
  if(input.files&&input.files[0]){
    const reader=new FileReader();
    reader.onload=async e=>{
      const small=await shrinkPhoto(e.target.result);
      S.newCardPhoto=small; S.newCardPictoId=null;
      S.bgRemoved=false;
      showCardImage(small,false);
    };
    reader.readAsDataURL(input.files[0]);
    input.value='';
  }
}

function removeBg(){
  if(!S.newCardPhoto||S.bgRemoved)return;
  const btn=document.getElementById('btnRemoveBg');
  btn.className='photo-action-btn processing';
  btn.innerHTML='<span class="pab-icon">⏳</span>Удаляю фон...';

  // Simulate bg removal with canvas — detect dominant corner color and make it transparent
  const img=new Image();
  img.onload=()=>{
    const canvas=document.createElement('canvas');
    const ctx=canvas.getContext('2d');
    canvas.width=img.width; canvas.height=img.height;
    ctx.drawImage(img,0,0);

    const imageData=ctx.getImageData(0,0,canvas.width,canvas.height);
    const data=imageData.data;

    // Sample corners to find background color
    const corners=[];
    const w=canvas.width, h=canvas.height;
    const samplePoints=[[0,0],[w-1,0],[0,h-1],[w-1,h-1],
      [Math.floor(w*0.1),0],[Math.floor(w*0.9),0],
      [0,Math.floor(h*0.1)],[0,Math.floor(h*0.9)],
      [w-1,Math.floor(h*0.1)],[w-1,Math.floor(h*0.9)],
      [Math.floor(w*0.1),h-1],[Math.floor(w*0.9),h-1]];

    samplePoints.forEach(([x,y])=>{
      const i=(y*w+x)*4;
      corners.push([data[i],data[i+1],data[i+2]]);
    });

    // Find most common corner color (simple clustering)
    let bgR=0,bgG=0,bgB=0,count=0;
    corners.forEach(c=>{bgR+=c[0];bgG+=c[1];bgB+=c[2];count++;});
    bgR=Math.round(bgR/count);bgG=Math.round(bgG/count);bgB=Math.round(bgB/count);

    // Threshold — how close a pixel must be to bg color to be removed
    const threshold=50;

    // Flood fill from edges using BFS for connected bg regions
    const visited=new Uint8Array(w*h);
    const queue=[];

    // Add all edge pixels as starting points
    for(let x=0;x<w;x++){queue.push([x,0]);queue.push([x,h-1]);}
    for(let y=0;y<h;y++){queue.push([0,y]);queue.push([w-1,y]);}

    function isBg(x,y){
      const i=(y*w+x)*4;
      const dr=data[i]-bgR, dg=data[i+1]-bgG, db=data[i+2]-bgB;
      return Math.sqrt(dr*dr+dg*dg+db*db)<threshold;
    }

    while(queue.length>0){
      const [x,y]=queue.shift();
      if(x<0||x>=w||y<0||y>=h)continue;
      const idx=y*w+x;
      if(visited[idx])continue;
      visited[idx]=1;
      if(!isBg(x,y))continue;
      // Make transparent
      const i=idx*4;
      data[i+3]=0;
      // Spread to neighbors
      queue.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
    }

    // Feather edges slightly (anti-alias)
    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        const i=(y*w+x)*4;
        if(data[i+3]===0)continue;
        // Check if any neighbor is transparent
        const neighbors=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
        let transparentCount=0;
        neighbors.forEach(([nx,ny])=>{const ni=(ny*w+nx)*4;if(data[ni+3]===0)transparentCount++;});
        if(transparentCount>0&&transparentCount<4){
          data[i+3]=Math.round(255*(1-transparentCount/6));
        }
      }
    }

    ctx.putImageData(imageData,0,0);
    const result=canvas.toDataURL('image/png');
    S.newCardPhoto=result;
    S.bgRemoved=true;

    // Simulate slight delay for UX feel
    setTimeout(()=>{
      document.getElementById('photoUpload').innerHTML=`<img src="${result}" id="previewImg" class="no-bg">`;
      btn.className='photo-action-btn active';
      btn.innerHTML='Фон удалён';
      showToast('Фон удалён');
    },600);
  };
  img.src=S.newCardPhoto;
}

// Пикера эмодзи здесь больше нет: символ карточки — фотография помощника либо
// пиктограмма ARASAAC по слову. Эмодзи в приложении не используются (R-H4).

// ===== ПИКЕР ПИКТОГРАММ ARASAAC (иконка категории, R-H4) =====
let _araPickerCb=null, _araPickerT=null;
function openArasaacPicker(cb){
  _araPickerCb=cb;
  const inp=document.getElementById('arasaacSearchInput'); inp.value='';
  document.getElementById('arasaacResults').innerHTML='<div class="ui-empty">Введите слово — покажем картинки</div>';
  openModal('arasaacPickerOverlay');
  setTimeout(()=>inp.focus(),300);
}
function closeArasaacPicker(){ closeModal('arasaacPickerOverlay'); }
function arasaacPickerSearch(q){
  clearTimeout(_araPickerT); q=(q||'').trim();
  const wrap=document.getElementById('arasaacResults');
  if(!q){ wrap.innerHTML='<div class="ui-empty">Введите слово — покажем картинки</div>'; return; }
  _araPickerT=setTimeout(()=>arasaacPickerFetch(q),350);
}
async function arasaacPickerFetch(q){
  const wrap=document.getElementById('arasaacResults');
  wrap.innerHTML='<div class="ui-empty">Ищем…</div>';
  try{
    const res=await fetch(`https://api.arasaac.org/v1/pictograms/ru/search/${encodeURIComponent(q)}`,{headers:{'Accept':'application/json'}});
    if(!res.ok){ wrap.innerHTML='<div class="ui-empty">Ничего не найдено</div>'; return; }
    const data=await res.json();
    if(!data||!data.length){ wrap.innerHTML='<div class="ui-empty">Ничего не найдено</div>'; return; }
    const ids=data.slice(0,24).map(d=>d._id);
    wrap.innerHTML='<div class="ara-grid">'+ids.map(id=>`<button class="ara-cell" onclick="pickArasaacFromPicker(${id})"><img src="${arasaacUrl(id,300)}" alt="" loading="lazy"></button>`).join('')+'</div>';
  }catch(e){ wrap.innerHTML='<div class="ui-empty">Нет связи с библиотекой картинок</div>'; }
}
function pickArasaacFromPicker(id){ if(typeof _araPickerCb==='function') _araPickerCb(id); closeArasaacPicker(); }
function setCatIconBtn(id){
  const b=document.getElementById('catEmojiBtn');
  if(id){ b.innerHTML=`<img class="cat-icon-btn-thumb" src="${arasaacUrl(id,300)}" alt=""> Изменить`; b.dataset.picto=id; }
  else { b.textContent='Выбрать картинку'; b.dataset.picto=''; }
}

// ===== SMART FIELD ALGORITHMS =====
// Чистые деривации форм — autoFillVerbForms (спряжение из леммы), autoDirectional
// (предлог места), autoGender (род по окончанию) — переехали в core.js и видны
// глобально. Мёртвая обёртка deriveConjFromSg1 удалена (нигде не вызывалась).
// Ниже — то, что работает с DOM и состоянием черновика карточки (S/V).

function selectGender(el) {
  document.querySelectorAll('#genderChips .gs-opt').forEach(c=>c.classList.remove('active'));
  el.classList.add('active'); S.newCardGender=el.dataset.gender;
}

function updateSmartField() {
  const text = document.getElementById('newCardText').value.trim();
  const pos = S.newCardPOS;
  document.getElementById('smartFieldVerb').style.display = pos==='verb' ? 'block' : 'none';
  document.getElementById('smartFieldNoun').style.display = pos==='noun' ? 'block' : 'none';

  if (pos==='verb' && text) {
    const forms = autoFillVerbForms(text);
    document.getElementById('vf_ya').value  = forms.я;
    document.getElementById('vf_ty').value  = forms.ты;
    document.getElementById('vf_on').value  = forms.он;
    document.getElementById('vf_my').value  = forms.мы;
    document.getElementById('vf_oni').value = forms.они;
  }
  if (pos==='noun' && text) {
    document.getElementById('nounDirectionalInput').value = autoDirectional(text);
    S.newCardDirectional = autoDirectional(text);
    const g = autoGender(text);
    S.newCardGender = g;
    document.querySelectorAll('#genderChips .gs-opt').forEach(c=>{
      c.classList.toggle('active', c.dataset.gender===g);
    });
  }
}

function readVerbFormsFromModal() {
  const ya  = document.getElementById('vf_ya').value.trim();
  const ty  = document.getElementById('vf_ty').value.trim();
  const on  = document.getElementById('vf_on').value.trim();
  const my  = document.getElementById('vf_my').value.trim();
  const oni = document.getElementById('vf_oni').value.trim();
  if (!ya && !on) return null;
  return {я:ya||on, ты:ty||on, он:on||ya, она:on||ya, мы:my||ya, они:oni||on};
}

function selectPOS(el){
  document.querySelectorAll('#posChips .gs-opt').forEach(c=>c.classList.remove('active'));
  el.classList.add('active'); S.newCardPOS=el.dataset.pos;
  updateSmartField();
}

// Сохранение карточки целиком идёт через editVocab: снимок для «Отменить» берётся
// здесь, а не при открытии окна. Раньше правка существующей карточки снимка не делала
// вовсе, и «Отменить» откатывала предыдущее действие вместо неё.
function saveNewCard(){ editVocab(saveNewCardInner); }
function saveNewCardInner(){
  const text=document.getElementById('newCardText').value.trim();
  if(!text){showToast('Введите слово');return false;}
  const cat=S.addingToCategory;
  if(!V[cat])return false;

  if(S.editingWordKey){
    // Правка существующей карточки: клетка остаётся той же
    const w=V[cat].cells[S.editingWordKey];
    if(!w || w.folder){ showToast('Карточки больше нет'); closeModal('addCardModal'); return false; }
    const oldLemma=w.lemma;
    w.text=text; w.lemma=text; w.pos=S.newCardPOS;
    // Своя картинка по полю pic и зачин из частей были привязаны к прежнему слову
    delete w.pic; delete w.parts;
    if(S.newCardPhoto) w.photo=S.newCardPhoto; else delete w.photo;
    if(S.newCardPictoId) w.pictoId=S.newCardPictoId; else delete w.pictoId;
    const speakAs=document.getElementById('speakAsInput').value.trim();
    if(speakAs) w.speakAs=speakAs; else delete w.speakAs;
    if(S.newCardAudio) w.audio=S.newCardAudio; else delete w.audio;
    // Раньше правка форм молча игнорировалась: помощник менял спряжение, жал
    // «Сохранить» — и ничего не менялось. Плюс при смене части речи оставался
    // мусор от прежней (у существительного жила таблица спряжения глагола).
    if(S.newCardPOS==='verb'){
      const conj=readVerbFormsFromModal();
      if(conj) w.customConj=conj; else delete w.customConj;
      delete w.customDirectional; delete w.customGender;
    } else if(S.newCardPOS==='noun'){
      if(S.newCardDirectional) w.customDirectional=S.newCardDirectional; else delete w.customDirectional;
      if(S.newCardGender) w.customGender=S.newCardGender; else delete w.customGender;
      delete w.customConj;
    } else {
      delete w.customConj; delete w.customDirectional; delete w.customGender;
    }
    // Слово может лежать в уже собранной фразе — там копия, сделанная при нажатии.
    // Без этого говорящий видел на полоске старое название и старую картинку.
    let inStrip=false;
    S.selectedWords.forEach(sw=>{
      if(sw.lemma!==oldLemma) return;
      inStrip=true;
      sw.text=w.text; sw.lemma=w.lemma; sw.pos=w.pos; sw.emoji=w.emoji;
      if(w.photo) sw.photo=w.photo; else delete sw.photo;
      if(w.pictoId) sw.pictoId=w.pictoId; else delete sw.pictoId;
      if(w.speakAs) sw.speakAs=w.speakAs; else delete sw.speakAs;
      if(w.audio) sw.audio=w.audio; else delete sw.audio;
      if(w.customConj) sw.customConj=w.customConj; else delete sw.customConj;
      if(w.customDirectional) sw.customDirectional=w.customDirectional; else delete sw.customDirectional;
      if(w.customGender) sw.customGender=w.customGender; else delete sw.customGender;
    });
    closeModal('addCardModal');
    if(inStrip) renderStrip();
    renderBoard();
    showToast('Карточка «'+text+'» обновлена');
  } else {
    // Две одинаковые карточки рядом говорящему не помогают — он не знает, какую жать.
    // Не запрещаем (помощнику виднее), но предупреждаем.
    if(folderWords(V[cat]).some(x=>(x.word.text||'').toLowerCase()===text.toLowerCase())){
      if(!confirm(`В папке «${V[cat].label}» уже есть карточка «${text}».\nДобавить ещё одну такую же?`)) return false;
    }
    // Новая карточка встаёт в первую свободную клетку и никого не сдвигает
    const newWord={text:text, lemma:text, pos:S.newCardPOS};
    if(S.newCardPhoto) newWord.photo=S.newCardPhoto;
    if(S.newCardPictoId) newWord.pictoId=S.newCardPictoId;
    const speakAsNew=document.getElementById('speakAsInput').value.trim();
    if(speakAsNew) newWord.speakAs=speakAsNew;
    if(S.newCardAudio) newWord.audio=S.newCardAudio;
    if(S.newCardPOS==='verb'){ const conj=readVerbFormsFromModal(); if(conj) newWord.customConj=conj; }
    if(S.newCardPOS==='noun' && S.newCardDirectional) newWord.customDirectional=S.newCardDirectional;
    if(S.newCardPOS==='noun' && S.newCardGender) newWord.customGender=S.newCardGender;
    V[cat].cells=placeCells(V[cat].cells, [newWord], S.targetKey).cells;
    S.targetKey='';
    closeModal('addCardModal');
    showToast('Карточка «'+text+'» добавлена');
  }
  S.editingWordKey='';
}

// ===== CATEGORY MODAL =====
function openNewCategoryModal(){ openNewFolderInCell('root', ''); }
// Новая папка встаёт в клетку key папки folderId; '' — в первую свободную.
function openNewFolderInCell(folderId, key){
  S.targetFolder=folderId||'root'; S.targetKey=key||'';
  S.editingCategory=null;
  S.selectedCatPicto=null;
  document.getElementById('catModalTitle').textContent='Новая папка';
  document.getElementById('catNameInput').value='';
  document.getElementById('catModalSaveBtn').textContent='Создать';
  document.getElementById('catDeleteBtn').style.display='none';
  setCatIconBtn(null);
  openModal('categoryModal');
}

function openEditCategoryModal(key){
  S.editingCategory=key;
  const cat=V[key];
  S.selectedCatPicto=cat.picto||null;
  document.getElementById('catModalTitle').textContent='Правка папки';
  document.getElementById('catNameInput').value=cat.label;
  document.getElementById('catModalSaveBtn').textContent='Сохранить';
  document.getElementById('catDeleteBtn').style.display='block';
  setCatIconBtn(S.selectedCatPicto);
  openModal('categoryModal');
}

function saveCategory(){ editVocab(saveCategoryInner); }
function saveCategoryInner(){
  const name=document.getElementById('catNameInput').value.trim();
  if(!name){showToast('Введите название');return false;}
  const picto=S.selectedCatPicto||null;

  if(S.editingCategory){
    V[S.editingCategory].label=name;
    V[S.editingCategory].picto=picto;
    showToast('Папка обновлена');
  } else {
    // Новая папка встаёт в выбранную клетку, а из списка — в первую свободную клетку корня
    const key='custom_'+Date.now();
    V[key]={label:name,picto:picto,cells:{}};
    const parent=V[S.targetFolder]||V.root;
    parent.cells=placeCells(parent.cells, [{folder:key}], S.targetKey).cells;
    S.targetFolder=''; S.targetKey='';
    showToast('Папка «'+name+'» создана');
  }
  closeModal('categoryModal');
}
// Все клетки-ссылки на папку: [{folderId, key}]. Папка может лежать в нескольких местах.
function folderLinks(id){
  const out=[];
  for(const [fid,f] of Object.entries(V)) for(const k in f.cells){ const c=f.cells[k]; if(c && c.folder===id) out.push({folderId:fid, key:k}); }
  return out;
}

function deleteCategory(){
  // Удаление группы легко обратимо → показываем «удалено · Вернуть» (R-H3),
  // а не спрашиваем заранее. Быстрее для помощника и без чужеродного диалога.
  if(!S.editingCategory) return;
  const key=S.editingCategory;
  if(key==='root' || key==='core'){ showToast('Эту папку удалить нельзя'); return; }
  const label=V[key].label||'';
  // Вернуть можно тем же снимком, что и «Отменить» в полосе правки: вторая, своя
  // модель отмены жила здесь до 23 сентября 2026 года и про первую ничего не знала.
  const snap=vocabSnapshot();
  // Ссылки на папку из всех мест тоже снимаем; их клетки остаются пустыми
  folderLinks(key).forEach(l=>{ V[l.folderId].cells=dropCells(V[l.folderId].cells, [l.key]).cells; });
  delete V[key];
  if(S.folderPath.some(e=>e.id===key)) S.folderPath=[{id:homeId()}];
  closeModal('categoryModal');
  renderBoard(); persist();
  showUndoToast('Папка «'+label+'» удалена', ()=>{
    vocabRestore(snap);
    renderBoard(); renderStrip(); persist();
  });
}

// Список папок: сначала те, что лежат в корне (в порядке чтения), потом «Ключевые
// слова» и папки, которые лежат только внутри других. Корень сам в списке не показан.
function listedFolderIds(){
  const seen=new Set(), out=[];
  orderedKeys(V.root?V.root.cells:{}).forEach(k=>{ const c=V.root.cells[k]; if(c&&c.folder&&V[c.folder]&&!seen.has(c.folder)){ seen.add(c.folder); out.push(c.folder); } });
  if(V.core && !seen.has('core')){ seen.add('core'); out.push('core'); }
  Object.keys(V).forEach(id=>{ if(id!=='root' && !seen.has(id)){ seen.add(id); out.push(id); } });
  return out;
}
// ===== MODALS =====
// Единая точка на открытие/закрытие окна. Пока это просто класс .show, но когда
// понадобится общее поведение (блокировка прокрутки фона, возврат фокуса, закрытие
// по Esc) — править одно место, а не 16 инлайновых add('show') по всем файлам.
// Один слой за раз: новая шторка прячет предыдущую и панель под ней, закрытие
// возвращает то, что было. Так «Выбрать пиктограмму» не ложится второй шторкой
// поверх «Новой карточки», а правка профиля не висит над списком профилей.
const modalStack=[];
function openModal(id){
  const m=document.getElementById(id); if(!m) return;
  const cur=document.querySelector('.modal-overlay.show');
  if(cur && cur!==m){ cur.classList.remove('show'); modalStack.push(cur.id); }
  m.classList.add('show'); document.body.classList.add('sheet-open');
}
function closeModal(id){
  const m=document.getElementById(id); if(!m) return;
  const i=modalStack.indexOf(id); if(i>=0){ modalStack.splice(i,1); return; }   // закрывают спрятанную — просто забыть
  m.classList.remove('show');
  const prev=modalStack.pop();
  if(prev) document.getElementById(prev).classList.add('show');
  else document.body.classList.remove('sheet-open');
}

// ===== ACTION MENU («⋯» в списках) =====
// Одна шторка на все списки. Действия карточки не занимают место в строке и не
// конкурируют с основным жестом — тапом по самой карточке (выбрать / открыть).
let actionMenuFns=[];
function openActionMenu(title, items){
  actionMenuFns=items.map(i=>i.fn);
  document.getElementById('actionMenuTitle').textContent=title;
  document.getElementById('actionMenuItems').innerHTML=items.map((it,i)=>
    `<div class="cg-item" onclick="runActionMenu(${i})"><div class="cgi-text"><div class="cgi-title${it.danger?' is-danger':''}">${it.label}</div></div></div>`
  ).join('');
  openModal('actionMenu');
}
function runActionMenu(i){ const f=actionMenuFns[i]; closeModal('actionMenu'); if(f) f(); }
// Нажатие по затемнению закрывает любую шторку
document.querySelectorAll('.modal-overlay').forEach(m=>{m.addEventListener('click',e=>{if(e.target===m) closeModal(m.id);});});

// ===== ВХОД В ПРОСТРАНСТВО ВЗРОСЛОГО =====
// В углу бокового столбца одна кнопка, она ведёт в панель настроек. По умолчанию
// открывается обычным нажатием. Если помощник включил настройку «вход с
// удержанием», иконку надо держать две с половиной секунды: кода в приложении
// нет (забытый код было нечем восстановить, кроме как стереть данные говорящего),
// а удержание говорящий не повторит мимоходом, в отличие от нажатия.
const HOLD_MS=GESTURE.holdToMenu;
const holdT={};

function holdBegin(e, id, fn){
  if(e) e.preventDefault();
  if(holdT[id]) return;
  const el=document.getElementById(id); if(!el) return;
  el.classList.add('holding');            // плавное потемнение за 2,5 с (styles.css)
  holdT[id]=setTimeout(()=>{
    holdT[id]=null;
    el.classList.remove('holding');
    fn();
  }, HOLD_MS);
}
// Короткое нажатие не делает ничего и ничего не показывает. Подсказка «держите
// столько-то секунд» с детской доски убрана: она объясняла говорящему, как войти.
function holdStop(id){
  clearTimeout(holdT[id]); holdT[id]=null;
  const el=document.getElementById(id); if(el) el.classList.remove('holding');
}

function bindHold(id, fn){
  const el=document.getElementById(id); if(!el) return;
  // Без удержания хватает нажатия. С удержанием touchstart гасит click через
  // preventDefault в holdBegin, поэтому лишнего срабатывания не будет.
  el.addEventListener('click', ()=>{ if(!S.holdToOpenPanel) fn(); });
  const begin=e=>{ if(S.holdToOpenPanel) holdBegin(e, id, fn); }, stop=()=>holdStop(id);
  el.addEventListener('mousedown', begin);
  el.addEventListener('touchstart', begin, {passive:false});
  el.addEventListener('mouseup', stop);
  el.addEventListener('touchend', stop);
  el.addEventListener('mouseleave', stop);
  el.addEventListener('touchcancel', stop);
}

// Кнопка «Меню» в углу бокового столбца ведёт в настройки. Нажатие или удержание — по настройке.
bindHold('iconPanel', openMenu);

// ===== МЕНЮ =====
// Меню плоское: «Правка доски» и «Поиск карточек», под ними группа «Настройки» из трёх строк,
// «Доска», «Панель кнопок», «Речь». Отдельного экрана «Настройки» нет с 24 сентября
// 2026 года (решение владельца: меню и так короткое). Внизу неброский ряд из двух
// кнопок, «Поддержка» и «О приложении». Профили не пункт, а шапка: слева стоит имя
// текущего профиля, нажатие ведёт на их список. Строки рисует renderPanelSections. Список пунктов лежит в разметке (index.html, #menu-screen). Меню —
// первый экран панели: из него «‹» на любом экране возвращает сюда, «✕» закрывает всё.
function openMenu(){ panelTrail.length=0; renderMenuProfile(); renderPanelSections(); showScreen('menu-screen','slide-right'); }
function renderMenuProfile(){
  const el=document.getElementById('menuProfileName'); if(!el) return;
  const p=(typeof profiles!=='undefined') && profiles.find(x=>x.active);
  el.textContent = p ? p.name : 'Профиль';
}
function menuGo(what){
  if(what==='edit'){ closeCaregiverPanel(); enterEditMode(); }
  else if(what==='search') openSearch();
  else if(what==='profiles') openProfiles();
  else if(what==='support') openSupport();
  else if(what==='about') openAbout();
}

// ===== МНОГО СЛОВ ОДНОВРЕМЕННО =====
// Слова через запятую, папка помечается дефисом впереди: «хлеб, масло, -фрукты».
function openManyWords(folderId, key){
  S.targetFolder=folderId; S.targetKey=key||'';
  const ta=document.getElementById('manyWordsInput'); if(ta) ta.value='';
  openModal('manyWordsModal');
  setTimeout(()=>{ if(ta) ta.focus(); }, 150);
}
function saveManyWords(){
  const ta=document.getElementById('manyWordsInput');
  const n=addManyWords(S.targetFolder||currentEntry().id, S.targetKey, ta?ta.value:'');
  closeModal('manyWordsModal'); S.targetFolder=''; S.targetKey='';
  showToast(n ? `Добавлено: ${n}` : 'Ничего не добавлено');
}

// ===== ПОДДЕРЖКА =====
// Пока заглушка: адрес почты и ответы на вопросы по тому, что уже есть в продукте.
const SUPPORT_EMAIL='razgovor@yandex.ru';
const FAQ=[
  ['Как сделать карточки крупнее или мельче?', 'Меню → «Доска» → «Карточек на доске». Место карточек в папке при этом не меняется: доска показывает часть папки, остальное листается стрелками.'],
  ['Как добавить своё слово или папку?', 'Меню → Правка доски. Нажмите плюс в пустой клетке или «Добавить новое» в полосе сверху и выберите: слово, много слов сразу, папку или связать существующую папку.'],
  ['Почему на экране остаются пустые места?', 'Так задумано: у каждой карточки постоянное место, и удалённая или скрытая карточка оставляет клетку пустой. Тот, кто говорит карточками, запоминает дорогу пальца к слову, и она не должна меняться.'],
  ['Как открыть слова, которых нет в папке?', 'Кнопка «Главные слова» на панели кнопок открывает 24 частых слова с любого места. Кнопка «Поиск» находит слово по всему словарю.'],
  ['Почему фраза звучит не так, как написано на карточках?', 'Движок достраивает грамматику: «я хочу» и «сок» звучат как «я хочу сока». Если это мешает, в Меню → «Речь» переключите «Склонение слов» на «Говорящий сам».'],
  ['Как перенести доску на другой планшет?', 'Меню → имя профиля вверху → «Резервное копирование» → «Сохранить копию в файл» кладёт в загрузки копию всех профилей. Один профиль: карандаш рядом с его именем → «Сохранить копию профиля». На другом устройстве выберите «Загрузить копию из файла» и укажите файл: копия всех профилей заменит текущие, копия одного добавится рядом. Облака и аккаунтов у приложения нет.'],
  ['Как сделать голос живее?', 'Поставьте «улучшенный» русский голос устройства: это бесплатно и работает без интернета. '+'iPhone и iPad: Настройки → Универсальный доступ → Устный контент → Голоса → Русский → Милена (улучшенный) Android: Настройки → Специальные возможности → Синтез речи → Google → установить русский Mac: Системные настройки → Универсальный доступ → Устная речь → Системный голос → Управление голосами'],
  ['Как защитить настройки от случайного нажатия?', 'Меню → «Панель кнопок» → «Открывать удержанием». Тогда кнопку «Меню» надо держать две с половиной секунды.'],
];
function openSupport(){ renderSupport(); panelGo('support-screen'); }
function renderSupport(){
  const el=document.getElementById('supportContent'); if(!el) return;
  const faq=FAQ.map(([q,a])=>`<details class="faq-item"><summary>${esc(q)}<span class="faq-chev">${mi('down')}</span></summary><div class="faq-answer">${esc(a)}</div></details>`).join('');
  el.innerHTML = [
    uiSection('Написать нам', [
      uiRow({href:`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Разговор: вопрос')}`, title:'Почта', desc:`${SUPPORT_EMAIL}. Отвечаем в будни. Адрес пока временный`}),
    ]),
    uiSection('Частые вопросы', [ `<div class="faq">${faq}</div>` ]),
  ].join('');
  renderIcons(el); a11yEnhance(el);
}

// Native touch scrolling on mobile — no drag-scroll needed

// ===== НАВИГАЦИЯ ВНУТРИ ВЗРОСЛОЙ ЗОНЫ =====
// «‹» возвращает туда, откуда пришли. Раньше кнопка «назад» всегда вела в корень
// панели, поэтому путь «Что видит говорящий → Сенсорная панель → назад» терял след и
// выбрасывал в начало. Теперь мы запоминаем, откуда пришли, а «✕» с любого экрана
// закрывает всю зону и возвращает говорящему доску.
const panelTrail=[];
function panelGo(id){ panelTrail.push(S.screen); showScreen(id,'slide-left'); }
function panelBack(){ const prev=panelTrail.pop()||'menu-screen'; showScreen(prev,'slide-left'); }
function closeCaregiverPanel(){ panelTrail.length=0; showScreen('aac-main','fade-in'); renderBoard(); }

function openChildScreen(){ renderChild(); panelGo('child-screen'); }

// ===== ЭКРАН ВЫБОРА ИЗ СПИСКА =====
// Одно значение из многих: строка настройки показывает значение и ведёт сюда, здесь
// список с отметкой. Выбор применяется сразу и возвращает на прежний экран.
let _pickItems=[], _pickOnPick=null;
function openPickList(title, items, onPick){
  _pickItems=items; _pickOnPick=onPick;
  document.getElementById('pickTitle').textContent=title;
  const el=document.getElementById('pickContent');
  el.innerHTML=uiSection('', items.map((it,i)=>uiRow({title:it.label, desc:it.desc, radio:!!it.active, action:`pickListChoose(${i})`})));
  a11yEnhance(el);
  panelGo('pick-screen');
}
function pickListChoose(i){ const it=_pickItems[i]; if(it && _pickOnPick) _pickOnPick(it.id); panelBack(); }
function openAccessSettings(){ renderAccess(); panelGo('access-screen'); }
function openSideSettings(){ renderSide(); panelGo('side-screen'); }
// openSupport определён ниже, в разделе «Поддержка».
function openSpeechSettings(){ renderSpeech(); panelGo('speech-screen'); }
function openAbout(){ renderAbout(); panelGo('about-screen'); }
function openProfiles(){ renderProfiles(); panelGo('profiles-screen'); }

// ===== КОРЕНЬ ПАНЕЛИ =====
function renderActiveProfileBadge(){ renderPanelSections(); renderMenuProfile(); }   // строка профиля живёт в секциях корня и в шапке меню

// Все строки панели описаны здесь данными и собраны общими компонентами.
function renderPanelSections(){
  const el=document.getElementById('cgSections'); if(!el) return;
  el.innerHTML = [
    // Строки профиля здесь нет: имя говорящего показывает шапка меню. Копии и стирание
    // данных лежат на экране профилей, куда ведёт шапка.
    uiSection('', [
      uiRow({icon:'groups', title:'Правка доски', action:"menuGo('edit')"}),
      uiRow({icon:'search', title:'Поиск карточек', action:"menuGo('search')"}),
    ]),
    // Три экрана: доска, панель кнопок, речь. Касание живёт на экране доски, «Открывать
    // удержанием» на экране панели кнопок, «Склонение слов» на экране речи (решение владельца,
    // 24 сентября 2026 года: настройки разложены по тому, к чему они относятся).
    uiSection('Настройки', [
      // Значения справа («80», «Показана», «Голос устройства») убраны по решению владельца
      // 24 сентября 2026 года: они дублировали содержимое экранов и только шумели.
      uiRow({icon:'grid', title:'Доска', desc:'Карточки, листание, картинки, подписи, тема, строка фразы, касание', go:'openAccessSettings()'}),
      uiRow({icon:'menu', title:'Панель кнопок', desc:'Какие кнопки показывать, сторона, любимая папка, удержание «Меню»', go:'openSideSettings()'}),
      uiRow({icon:'speak', title:'Речь', desc:'Голос, скорость, живой голос, форма слова', go:'openSpeechSettings()'}),
    ]),
  ].join('');
  renderIcons(el); a11yEnhance(el);
}

function renderPanel(){ renderPanelSections(); }

// ===== РЕБЁНОК =====
function renderChild(){
  const el=document.getElementById('childContent'); if(!el) return;
  const p=profiles.find(x=>x.active); if(!p){ el.innerHTML=uiEmpty('Профиль не выбран.'); return; }
  el.innerHTML = [
    uiSection('', [
      uiRow({title:p.name, desc:'Имя', go:`openEditProfileModal(${p.id})`}),
      uiRow({title:'Другие профили', desc:'У каждого свой словарь и свои настройки', go:'openProfiles()'}),
    ]),
  ].join('');
  renderIcons(el); a11yEnhance(el);
}
// ===== КАСАНИЕ И СЕТКА =====
// Подпись размера окна: «12 карточек, 4 × 3» (столбцы × ряды).
function gridSizeLabel(n){ const g=gridSize(n); return `${g.n} ${plural(g.n,'карточка','карточки','карточек')}, ${g.cols} × ${g.rows}`; }
function renderAccess(){
  const el=document.getElementById('accessContent'); if(!el) return;
  const isAra=S.imageLibrary==='arasaac';
  // Раздела «Откуда берутся картинки» нет: библиотека одна, ARASAAC, и выбор из одного
  // пункта только занимал место (решение владельца, 23 сентября 2026 года).
  const sizes=GRID_SIZES.map(g=>`<div class="gs-opt gs-opt-size${g.n===S.gridSize?' active':''}" onclick="setGridSize(${g.n})"><b>${g.n}</b><small>${g.cols}×${g.rows}</small></div>`).join('');
  el.innerHTML = [
    uiSection('Карточек на доске', [
      `<div class="cg-item cg-item-stack">
        <div class="gs-options gs-options-wrap">${sizes}</div>
        <div class="gs-preview"><div class="gs-preview-label">Предпросмотр: ${gridSizeLabel(S.gridSize)}</div><div class="gs-preview-grid" id="previewGrid"></div></div>
      </div>`,
    ]),
    uiSection('Движение по папкам', [
      uiSegment({title:'Листание страниц',
        desc:'Свайпом по доске, стрелками на панели кнопок или и так и так. Только стрелки надёжнее при слабой моторике: случайный жест не перевернёт страницу',
        options:[{label:'Свайпом и стрелками', active:S.paging!=='buttons'&&S.paging!=='swipe', action:"setPaging('both')"},
                 {label:'Только стрелками', active:S.paging==='buttons', action:"setPaging('buttons')"},
                 {label:'Только свайпом',   active:S.paging==='swipe',   action:"setPaging('swipe')"}]}),
      uiToggle({id:'togglePathBar', setting:'pathBar', title:'Путь по папкам', on:S.pathBar!==false,
                desc:'Строка над доской: «Домой › Еда › Блюда». Каждое звено нажимается и возвращает в ту папку. Выключите, если строка отвлекает или мешает по высоте'}),
      uiRow({title:'Домашняя папка',
        desc:'Папка, в которую ведёт «Домой». Выше домашней папки говорящий не поднимется: так на занятие остаётся одна тема',
        value:folderLabel(homeId()), go:'openHomeFolderPick()'}),
    ]),
    // Ниже — то, что до 24 сентября 2026 года лежало отдельным экраном «Вид доски»;
    // владелец решил держать всё про доску в одном месте.
    uiSection('Картинки', [
      // Варианты показаны карточками-образцами, а не словами: помощник видит, как будет
      // выглядеть карточка, и выбирает глазами (решение владельца, 24 сентября 2026 года).
      isAra ? uiSegment({title:'Стиль картинок',
        desc:'Чёрно-белые помогают при перегрузке цветом и при тренировке различения',
        options:[sampleCardOpt('Цветные', '', !!S.arasaacColor, 'setArasaacColor(true)'),
                 sampleCardOpt('Чёрно-белые', 'is-bw', !S.arasaacColor, 'setArasaacColor(false)')]}) : '',
      uiSegment({title:'Цвет части речи',
        options:[sampleCardOpt('Нет', 'mode-off', S.colorCode==='off', "setColorMode('off')"),
                 sampleCardOpt('Рамка', 'mode-border', S.colorCode==='border', "setColorMode('border')"),
                 sampleCardOpt('Полоска', 'mode-stripe', S.colorCode==='stripe', "setColorMode('stripe')"),
                 sampleCardOpt('Фон', 'mode-fill', S.colorCode==='fill', "setColorMode('fill')")]}),
    ]),
    uiSection('Подпись карточки', [
      uiSegment({title:'Место подписи',
        desc:'Под картинкой или над ней',
        options:[{label:'Под картинкой', active:S.captionPosition!=='above', action:"setCaptionPosition('below')"},
                 {label:'Над картинкой', active:S.captionPosition==='above', action:"setCaptionPosition('above')"}]}),
      uiSegment({title:'Размер подписи',
        desc:'От «только картинка» до «только текст». Крупная подпись помогает тому, кто уже читает',
        options:[{label:'Только картинка', active:S.captionSize==='none', action:"setCaptionSize('none')"},
                 {label:'Маленькая', active:S.captionSize==='small', action:"setCaptionSize('small')"},
                 {label:'Средняя', active:!['none','small','large','text'].includes(S.captionSize), action:"setCaptionSize('medium')"},
                 {label:'Крупная', active:S.captionSize==='large', action:"setCaptionSize('large')"},
                 {label:'Только текст', active:S.captionSize==='text', action:"setCaptionSize('text')"}]}),
    ]),
    uiSection('Тема и движение', [
      uiSegment({title:'Тема',
        desc:'Тёмная тема снижает яркость экрана: карточки остаются светлыми, всё вокруг темнеет',
        options:[{label:'Светлая', active:S.theme!=='dark', action:"setTheme('light')"},
                 {label:'Тёмная',  active:S.theme==='dark',  action:"setTheme('dark')"}]}),
      uiToggle({id:'toggleAnimations', setting:'animations', title:'Анимации', on:S.animations,
                desc:'Появление карточек и переходы. Выключены по умолчанию: так спокойнее и предсказуемее'}),
    ]),
    uiSection('Строка фразы', [
      uiSegment({title:'Поделиться сообщением',
        desc:'Картинкой — строка с карточками и текст фразы под ней. Текстом — только текст фразы',
        options:[{label:'Картинкой', active:S.shareAs!=='text', action:"setShareAs('image')"},
                 {label:'Текстом',   active:S.shareAs==='text', action:"setShareAs('text')"}]}),
      uiSegment({title:'Место строки фразы и «Меню»',
        desc:'Строка, в которую собираются слова, и кнопка «Меню» в углу панели кнопок. Сверху — как в книге, снизу — ближе к рукам',
        options:[{label:'Сверху', active:S.stripPosition!=='bottom', action:"setStripPosition('top')"},
                 {label:'Снизу',  active:S.stripPosition==='bottom', action:"setStripPosition('bottom')"}]}),
    ]),
    // Касание — здесь же, внизу экрана доски: приспособления действуют на карточки доски.
    ...touchSectionsHtml(),
    `<button class="btn-full btn-secondary" onclick="resetSensoryDefaults()">Вернуть спокойные умолчания</button>`,
  ].join('');
  renderGridPreview();
  renderIcons(el); a11yEnhance(el);
}
// ===== ПАНЕЛЬ КНОПОК =====
// Свой экран: какие кнопки стоят рядом с доской, с какой стороны, и защита кнопки «Меню».
function renderSide(){
  const el=document.getElementById('sideContent'); if(!el) return;
  el.innerHTML = [
    uiSection('', [
      uiToggle({id:'toggleSideOn', setting:'sideOn', title:'Показывать панель кнопок', on:S.sideOn!==false,
                desc:'Кнопки «Назад», «Домой», «Поиск» и другие рядом с доской. Выключена — в углу остаётся только «Меню»'}),
      uiSegment({title:'Сторона',
        desc:'Ставьте со стороны ведущей руки',
        options:[{label:'Справа', active:S.sideColumn!=='left', action:"setSideColumn('right')"},
                 {label:'Слева',  active:S.sideColumn==='left', action:"setSideColumn('left')"}]}),
      ...Object.keys(SIDE_BUTTON_DEFS).map(k=>uiToggle({id:'toggleSide_'+k, icon:SIDE_BUTTON_DEFS[k].icon, title:SIDE_BUTTON_DEFS[k].label, on:(S.sideButtons||[]).includes(k),
        desc:{fav:'Открывает любимую папку', key:'Папка из 24 частых слов', alarm:'Короткий звуковой сигнал, чтобы позвать человека', mistake:'Говорит фразу из поля ниже', prev:'Стрелка назад по страницам папки', next:'Стрелка вперёд по страницам папки'}[k]||''})),
      uiRow({title:'Любимая папка', desc:'Папка, которую открывает кнопка «Любимая папка»',
        value:folderLabel(V[S.favFolder]?S.favFolder:'quick'), go:'openFavFolderPick()'}),
      `<div class="cg-item cg-item-stack"><div class="cgi-main"><div class="cgi-text"><div class="cgi-title">«Я допустил ошибку»: говорить как</div><div class="cgi-desc">Фраза, которую произносит эта кнопка</div></div></div>
        <input class="form-input" id="mistakePhraseInput" value="${esc(S.mistakePhrase||'')}" placeholder="Я допустил ошибку" onchange="setMistakePhrase(this.value)"></div>`,
    ]),
    uiSection('Меню', [
      uiToggle({id:'toggleHoldPanel', setting:'holdToOpenPanel', icon:'menu', title:'Открывать удержанием', on:S.holdToOpenPanel,
                desc:'Кнопку «Меню» на доске нужно держать две с половиной секунды. Защищает настройки от случайного нажатия говорящего. Выключено — меню открывается сразу'}),
    ]),
  ].join('');
  renderIcons(el); a11yEnhance(el);
}
// ===== КАСАНИЕ =====
// Набор «Сенсорного ввода» Avaz: один переключатель, срабатывание по отпусканию или по
// нажатию, удержание, игнор повтора. Умолчания безопасные: всё выключено.
// Допустимые значения перечислены по одному разу: отсюда и рисуются варианты, и
// проверяется то, что пришло. Раньше каждый список был записан дважды — в отрисовке
// экрана и в проверке значения, — и они могли разойтись молча.
const HOLD_OPTIONS=[[0,'Нет'],[0.2,'0,2 с'],[0.5,'0,5 с'],[1,'1 с'],[1.5,'1,5 с']];
const REPEAT_OPTIONS=[[0,'Нет'],[0.3,'0,3 с'],[0.5,'0,5 с'],[1,'1 с'],[2,'2 с']];
const FRAME_COLORS=[['#FFD900','Жёлтая'],['#E53935','Красная'],['#1E88E5','Синяя'],['#43A047','Зелёная'],['#111111','Чёрная']];
const FRAME_WIDTHS=[2,4,6,8];
const FRAME_RADII=[[0,'Нет'],[8,'Малое'],[16,'Среднее'],[24,'Большое']];
function touchSectionsHtml(){
  const on=!!S.touchOn;
  return [
    uiSection('Касание', [
      uiToggle({id:'toggleTouchOn', setting:'touchOn', title:'Приспособления к касанию', on,
                desc:'Пока выключено, карточка срабатывает при отпускании пальца, как обычная кнопка. Включите, чтобы подобрать срабатывание, удержание и защиту от повтора под руку говорящего'}),
    ]),
    on ? uiSection('Срабатывание карточки', [
      uiSegment({title:'Момент срабатывания',
        desc:'По отпусканию: можно доехать пальцем до нужной карточки и соскользнуть с ошибочной. По нажатию: надёжнее тем, у кого палец уезжает после касания',
        options:[{label:'По отпусканию', active:S.touchSelect!=='press', action:"setTouch('touchSelect','release')"},
                 {label:'По нажатию',    active:S.touchSelect==='press',  action:"setTouch('touchSelect','press')"}]}),
      uiSegment({title:'Удержание',
        desc:'Время, которое палец должен пробыть на карточке, чтобы касание засчиталось. Короткие случайные задевания не считаются. Пока идёт удержание, по карточке бежит полоска',
        options:HOLD_OPTIONS.map(([v,l])=>({label:l, active:Number(S.touchHold)===v, action:`setTouch('touchHold',${v})`}))}),
      uiSegment({title:'Игнорировать повтор',
        desc:'Время после срабатывания, когда доска не принимает касаний. Защищает фразу от случайного удвоения слова при дрожании рук',
        options:REPEAT_OPTIONS.map(([v,l])=>({label:l, active:Number(S.touchRepeat)===v, action:`setTouch('touchRepeat',${v})`}))}),
    ]) : '',
    on ? uiSection('Рамка выделения под пальцем', [
      uiSegment({title:'Цвет рамки',
        options:FRAME_COLORS.map(([c,l])=>({label:l, active:(S.touchFrameColor||'#FFD900').toUpperCase()===c, action:`setTouch('touchFrameColor','${c}')`}))}),
      uiSegment({title:'Толщина рамки',
        options:FRAME_WIDTHS.map(v=>({label:v+' px', active:Number(S.touchFrameWidth)===v, action:`setTouch('touchFrameWidth',${v})`}))}),
      uiSegment({title:'Скругление углов',
        options:FRAME_RADII.map(([v,l])=>({label:l, active:Number(S.touchFrameRadius)===v, action:`setTouch('touchFrameRadius',${v})`}))}),
    ]) : '',
    uiSection('Отклик', [
      uiToggle({id:'toggleVibration', setting:'vibration', title:'Вибрация', on:S.vibration,
                desc:'Короткий отклик при удержании кнопки очистки'}),
    ]),
    `<div class="sub-intro">Приспособления действуют на карточки доски. Кнопки на панели кнопок, строка фразы и меню остаются обычными кнопками. Одного правильного значения нет: подбирайте вместе со специалистом, начиная с самого мягкого.</div>`,
  ];
}
// Рамка выделения под пальцем: цвет, толщина и скругление уходят в CSS-переменные доски
function applyTouchFrame(){
  const m=document.getElementById('aac-main'); if(!m) return;
  m.style.setProperty('--tf-color', S.touchFrameColor||'#FFD900');
  m.style.setProperty('--tf-width', (Number(S.touchFrameWidth)||4)+'px');
  m.style.setProperty('--tf-radius', (Number(S.touchFrameRadius)||0)+'px');
}

// ===== НАСТРОЙКА ОПИСЫВАЕТСЯ ДАННЫМИ =====
// У каждой настройки одно и то же устройство: привести значение к допустимому, записать
// в S, применить к документу, перерисовать, сохранить, сказать помощнику, что изменилось.
// До 23 сентября 2026 года на каждую был написан свой трёхстрочник — около двадцати
// одинаковых, — и добавить настройку значило написать двадцать первый.
//
//   clean  — привести значение к допустимому (нет — берётся как есть)
//   reject — не записывать вовсе (папку удалили, значения нет)
//   apply  — что поменять в документе
//   render — что перерисовать
//   toast  — что сказать: строка или функция от нового значения
//   after  — что сделать после сохранения (озвучить, прогреть голос)
const oneOf = (list, fallback) => v => list.includes(v) ? v : fallback;
const numOneOf = (list, fallback) => v => list.includes(Number(v)) ? Number(v) : fallback;
const bool = v => !!v;

const SETTING = {
  // Окно и столбец
  gridSize:   { clean: n=>gridSize(n).n, apply: ()=>{ S.gridPage=0; },
                render: ()=>{ renderBoard(); renderAccess(); renderActiveProfileBadge(); } },
  paging:     { clean: oneOf(['buttons','swipe','both'],'both'), render: ()=>{ renderBoard(); renderAccess(); },
                toast: v=>({buttons:'Страницы листаются стрелками', swipe:'Страницы листаются свайпом'})[v]||'Страницы листаются свайпом и стрелками' },
  sideColumn: { clean: oneOf(['left','right'],'right'), render: ()=>{ renderBoard(); renderSide(); } },
  sideOn:     { clean: bool, render: ()=>{ renderBoard(); renderPanelSections(); } },
  favFolder:  { reject: id=>!V[id], render: ()=>{ renderBoard(); renderSide(); } },
  homeFolder: { reject: id=>!V[id], apply: ()=>{ S.folderPath=[{id:S.homeFolder}]; S.gridPage=0; },
                render: ()=>{ renderBoard(); renderAccess(); },
                toast: id=>id==='root'?'Дом — весь словарь':'Дом — папка «'+V[id].label+'»' },
  mistakePhrase: { clean: t=>String(t||'').trim()||'Я допустил ошибку' },
  holdToOpenPanel: { clean: bool },

  // Касание
  touchOn:          { clean: bool, render: ()=>{ renderAccess(); renderPanelSections(); } },
  touchSelect:      { clean: oneOf(['press','release'],'release'), apply: applyTouchFrame, render: renderAccess },
  touchHold:        { clean: numOneOf(HOLD_OPTIONS.map(o=>o[0]),0), apply: applyTouchFrame, render: renderAccess },
  touchRepeat:      { clean: numOneOf(REPEAT_OPTIONS.map(o=>o[0]),0), apply: applyTouchFrame, render: renderAccess },
  touchFrameColor:  { clean: v=>/^#[0-9a-f]{6}$/i.test(v)?v:'#FFD900', apply: applyTouchFrame, render: renderAccess },
  touchFrameWidth:  { clean: numOneOf(FRAME_WIDTHS,4), apply: applyTouchFrame, render: renderAccess },
  touchFrameRadius: { clean: numOneOf(FRAME_RADII.map(o=>o[0]),16), apply: applyTouchFrame, render: renderAccess },
  vibration:        { clean: bool },

  // Как звучит речь
  speechRate: { render: renderSpeech, after: ()=>speakWord('Вот так звучит') },
  speakMode:  { clean: oneOf(['all','words','strip'],'words'), render: ()=>{ renderSpeech(); renderPanelSections(); },
                toast: m=>({all:'Звучит всё: слова, папки, фраза', words:'Звучат слова при нажатии, фраза по кнопке', strip:'Звучит только строка по кнопке'})[m] },
  speakKeys:  { clean: bool },
  autoClear:  { clean: bool },
  bakedVoice: { render: ()=>{ renderSpeech(); renderPanelSections(); },
                after: v=>{ if(v){ playVoiceSample(v); warmVoiceBank(v); } } },

  // Как выглядит доска
  imageLibrary:    { render: ()=>{ renderAccess(); renderWindow(); renderPanelSections(); },
                     toast: id=>'Символы: '+((IMAGE_LIBS.find(l=>l.id===id)||{}).label||'') },
  arasaacColor:    { clean: bool, render: ()=>{ renderAccess(); renderWindow(); renderPanelSections(); },
                     toast: c=>c?'Цветные символы':'Чёрно-белые символы' },
  theme:           { clean: oneOf(['light','dark'],'light'), apply: applyTheme, render: renderAccess },
  shareAs:         { clean: oneOf(['image','text'],'image'), render: renderAccess },
  captionPosition: { clean: oneOf(['below','above'],'below'), apply: applyCaption, render: renderAccess },
  captionSize:     { clean: oneOf(['none','small','medium','large','text'],'medium'), apply: applyCaption, render: renderAccess },
  pathBar:         { clean: bool, apply: applyPathBar, render: ()=>{ renderAccess(); renderWindow(); },
                     toast: on=>on?'Путь по папкам показан':'Путь по папкам скрыт' },
  stripPosition:   { clean: oneOf(['top','bottom'],'top'), apply: applyStripPosition,
                     render: ()=>{ renderAccess(); renderWindow(); },
                     toast: p=>p==='bottom'?'Полоска снизу':'Полоска сверху' },
  colorCode:       { clean: oneOf(['off','border','stripe','fill'],'border'), apply: applyColorMode,
                     render: ()=>{ renderAccess(); renderWindow(); renderStrip(); },
                     toast: m=>({off:'Цвет части речи выключен', border:'Цвет — рамкой', stripe:'Цвет — полоской сверху', fill:'Цвет — фоном'})[m] },
  animations:      { clean: bool },
  childBuilds:     { clean: bool, render: ()=>{ renderSpeech(); renderStrip(); renderWindow(); },
                     toast: on=>on?'Говорящий строит форму сам — движок не склоняет':'Движок достраивает грамматику' },
};

// Единственное место, где настройка попадает в S и уходит в сохранёнку.
function setSetting(key, value){
  const d=SETTING[key]||{};
  if(d.reject && d.reject(value)) return;
  S[key]=d.clean ? d.clean(value) : value;
  if(d.apply) d.apply();
  if(d.render) d.render();
  persist();
  if(d.toast) showToast(typeof d.toast==='function' ? d.toast(S[key]) : d.toast);
  if(d.after) d.after(S[key]);
}

// Имена, на которые ссылается разметка экранов настроек.
function setGridSize(n){ setSetting('gridSize', n); }
function setPaging(v){ setSetting('paging', v); }
function setSideColumn(side){ setSetting('sideColumn', side); }
function setFavFolder(id){ setSetting('favFolder', id); }
function setHomeFolder(id){ setSetting('homeFolder', id); }
function setMistakePhrase(t){ setSetting('mistakePhrase', t); }
function setTouch(key, value){ setSetting(key, value); }
function setSpeechRate(r){ setSetting('speechRate', r); }
function setSpeakMode(m){ setSetting('speakMode', m); }
function selectImageLibrary(id){ setSetting('imageLibrary', id); }
function setArasaacColor(c){ setSetting('arasaacColor', c); }
function setTheme(t){ setSetting('theme', t); }
function setShareAs(v){ setSetting('shareAs', v); }
function setCaptionPosition(p){ setSetting('captionPosition', p); }
function setCaptionSize(sz){ setSetting('captionSize', sz); }
function setStripPosition(pos){ setSetting('stripPosition', pos); }
function setColorMode(m){ setSetting('colorCode', m); }
// Кто строит форму слова: движок достраивает или говорящий сам (реш.№2, R-C11).
function setChildBuilds(on){ setSetting('childBuilds', on); }

// Варианты домашней папки: весь словарь (корень) и папки из корня по порядку чтения.
function folderLabel(id){ return id==='root' ? 'Весь словарь' : (V[id] ? V[id].label : ''); }
// Домашняя и любимая папка выбираются на отдельном экране-списке: вариантов семь и
// больше, а такой ряд кнопок переносился на две строки и переставал читаться как выбор.
function openHomeFolderPick(){
  const ids=['root', ...listedFolderIds()];
  openPickList('Домашняя папка', ids.map(id=>({id, label:folderLabel(id), active:homeId()===id})), setHomeFolder);
}
function openFavFolderPick(){
  const cur=V[S.favFolder]?S.favFolder:'quick';
  openPickList('Любимая папка', listedFolderIds().map(id=>({id, label:folderLabel(id), active:cur===id})), setFavFolder);
}
function renderGridPreview(){
  const g=document.getElementById('previewGrid'); if(!g) return;
  const gs=gridSize(S.gridSize);
  g.style.gridTemplateColumns=`repeat(${gs.cols},1fr)`;
  g.style.gridTemplateRows=`repeat(${gs.rows},1fr)`;
  g.innerHTML=Array.from({length:gs.cols*gs.rows},()=>'<div class="gs-preview-cell"></div>').join('');
}
// Кнопки «Применить» нет: изменение сразу уходит в приложение, помощник видит
// результат в предпросмотре и не держит в голове несохранённое состояние.
function toggleSideButton(key,on){
  const list=Array.isArray(S.sideButtons)?S.sideButtons.slice():[];
  const order=Object.keys(SIDE_BUTTON_DEFS);
  const set=new Set(list); if(on) set.add(key); else set.delete(key);
  S.sideButtons=order.filter(k=>set.has(k));
  renderBoard(); persist();
}

// ===== КАК ЗВУЧИТ РЕЧЬ =====
// Выбор конкретного голоса из тех, что реально есть в системе. Раньше здесь был выбор
// «мужской или женский», который на большинстве устройств был фикцией: русский голос
// обычно один, и «пол» подделывался высотой тона.
function selectVoiceURI(uri){
  S.voiceURI=uri||'';
  const v=ruVoices().find(x=>x.voiceURI===uri);
  if(v){ if(RU_MALE.test(v.name)) S.voice='male'; else if(RU_FEMALE.test(v.name)) S.voice='female'; }
  renderSpeech(); persist();
  speakWord('Привет! Меня хорошо слышно?');   // сразу дать послушать
}
function voiceListHtml(){
  const voices=bestRuVoices();
  if(!voices.length) return '<div class="voice-empty"><b>Русского голоса на устройстве нет.</b> Поэтому русские слова читает английский голос, с акцентом. Установите русский голос по инструкции ниже или включите «Живой голос»: он приходит с сервера и от устройства не зависит.</div>';
  const cur=pickVoice();
  return voices.map(v=>{
    const natural=voiceScore(v)>=6;
    const remote=v.localService===false;
    const sel=cur && v.voiceURI===cur.voiceURI;
    const uri=(v.voiceURI||'').replace(/'/g,"\\'");
    return uiRow({title:esc(v.name)+(natural?' <span class="cgi-badge">натуральный</span>':'')+(remote?' <span class="cgi-badge is-neutral">нужен интернет</span>':''), titleHtml:true, radio:sel, action:`selectVoiceURI('${uri}')`});
  }).join('');
}
// Записанные голоса лежат рядом с приложением: работают офлайн и не отправляют
// текст фразы наружу. Выбор сразу даёт послушать — решает ухо, а не описание.
function bakedVoiceListHtml(){
  const bank=voiceBank;
  if(!bank || !bank.voices || !bank.voices.length){
    return '<div class="voice-hint">Записанные голоса не загрузились. Говорит голос устройства.</div>';
  }
  const rows=[uiRow({title:'Голос устройства', desc:'Тот, что стоит в системе. Читает и слова, которые вы завели сами',
                     radio:!S.bakedVoice, action:"setSetting('bakedVoice','')"})];
  for(const v of bank.voices){
    const sel=S.bakedVoice===v.id;
    rows.push(uiRow({
      title:esc(v.name)+' <span class="cgi-badge is-neutral">'+esc(v.sex)+'</span>', titleHtml:true,
      desc:sel?'Нажмите ещё раз, чтобы послушать':'',
      radio:sel,
      action:sel?`playVoiceSample('${v.id}')`:`setSetting('bakedVoice','${v.id}')`}));
  }
  rows.push('<div class="voice-hint">Записанные голоса звучат и без интернета. Слова, которые вы завели сами, читает голос устройства.</div>');
  return rows.join('');
}

function renderSpeech(){
  const el=document.getElementById('speechContent'); if(!el) return;
  el.innerHTML = [
    uiSection('Голос', [ voiceListHtml() ]),
    uiSection('Скорость', [
      uiSegment({title:'Скорость речи', options:[
        {label:'Медленно', active:S.speechRate<0.8,                          action:'setSpeechRate(0.7)'},
        {label:'Обычно',   active:S.speechRate>=0.8 && S.speechRate<1.0,     action:'setSpeechRate(0.9)'},
        {label:'Быстро',   active:S.speechRate>=1.0,                         action:'setSpeechRate(1.1)'}]}),
    ]),
    // Три варианта строками, а не кнопками в ряд: у каждого своё описание рядом с
    // отметкой, вместо одного абзаца над кнопками (решение владельца, 23 сентября 2026 года).
    uiSection('Озвучивание', [
      uiRow({title:'Всё', desc:'Слово при нажатии, название папки при открытии, фраза по кнопке',
             radio:S.speakMode==='all', action:"setSpeakMode('all')"}),
      uiRow({title:'Только слова', desc:'Слово при нажатии, фраза по кнопке',
             radio:S.speakMode!=='all'&&S.speakMode!=='strip', action:"setSpeakMode('words')"}),
      uiRow({title:'Только строку', desc:'Говорит только кнопка «Сказать вслух»',
             radio:S.speakMode==='strip', action:"setSpeakMode('strip')"}),
      `<div class="voice-hint">Кнопка «Сказать вслух» работает при любом выборе.</div>`,
    ]),
    uiSection('Кнопки и строка фразы', [
      uiToggle({id:'toggleSpeakKeys', setting:'speakKeys', title:'Озвучивать служебные кнопки', on:S.speakKeys,
                desc:'«Назад», «Домой», «Главные слова», «Поиск» и стрелки страниц называют себя при нажатии'}),
      uiToggle({id:'toggleAutoClear', setting:'autoClear', title:'Очищать после озвучивания', on:S.autoClear,
                desc:'Убирать фразу из строки, как только она сказана'}),
    ]),
    uiSection('Склонение слов', [
      uiSegment({title:'Склонение слов',
        desc:'«Говорящий сам» — устройство говорит ровно то, что выложено, без склонения. «Движок» — достраивает падежи и согласование',
        options:[{label:'Движок достраивает', active:!S.childBuilds, action:'setChildBuilds(false)'},
                 {label:'Говорящий сам',      active:!!S.childBuilds, action:'setChildBuilds(true)'}]}),
    ]),
    uiSection('Живой голос', [ bakedVoiceListHtml() ]),
  ].join('');
  renderIcons(el); a11yEnhance(el);
}

// ===== ЧТО ВИДИТ РЕБЁНОК =====
// Источник символов и их вид собраны в одном месте. Раньше они жили на двух разных
// экранах, поэтому при выборе эмодзи переключатель «цветные или чёрно-белые»
// оставался видимым и ни на что не влиял.
const IMAGE_LIBS = [
  { id:'arasaac', label:'ARASAAC', desc:'Профессиональные символы для общения, около 13 000 штук, есть русские. Загружаются из интернета и сохраняются на устройстве' },
];
// Карточка-образец для выбора вида: уменьшенная карточка слова «банан» с нужным
// оформлением и подписью варианта под ней. Режим цвета задаёт свой класс, а не атрибут
// на <body>, поэтому все образцы видны разом, в текущем режиме или нет.
function sampleCardOpt(label, cls, active, action){
  const html=`<div class="sample-card cat-noun ${cls}"><img src="pictos/банан.png" alt=""><span class="sample-label">банан</span></div><small>${esc(label)}</small>`;
  return {label, html, active, action};
}
function applyColorMode(){ document.body.dataset.colorMode = S.colorCode; }
function applyTheme(){ document.body.dataset.theme = S.theme==='dark' ? 'dark' : 'light'; }
// Подпись карточки: положение и размер задают атрибуты на <body>, раскладку делает CSS.
function applyCaption(){
  document.body.dataset.caption = S.captionPosition==='above' ? 'above' : 'below';
  document.body.dataset.captionSize = ['none','small','medium','large','text'].includes(S.captionSize) ? S.captionSize : 'medium';
}
// Полоска фразы сверху или снизу сетки: положение задаёт атрибут на экране доски,
// раскладку делает CSS. Сетка пересчитывает высоту строк после смены.
// Путь по папкам над окном можно скрыть: класс на экране доски, раскладку делает CSS.
function applyPathBar(){ const m=document.getElementById('aac-main'); if(m) m.classList.toggle('path-off', S.pathBar===false); }
function applyStripPosition(){
  const m=document.getElementById('aac-main'); if(m) m.dataset.strip = S.stripPosition==='bottom' ? 'bottom' : 'top';
}
// Сброс к спокойным умолчаниям (R-M3). Голос и живой голос не трогаем: это настройки
// приватности, а не сенсорики. Перечисляем в диалоге всё, что вернём.
function resetSensoryDefaults(){
  confirmDialog('Вернём спокойные настройки: без анимаций, цвет рамкой, цветные символы, подпись средняя под картинкой, обычная скорость речи, звучат только слова, служебные кнопки молчат, без автоочистки, вибрация включена. Голос и живой голос не трогаем.', ()=>{
    S.animations=false; S.colorCode='border'; S.arasaacColor=true;
    S.captionPosition='below'; S.captionSize='medium';
    S.speechRate=0.9;
    S.speakMode='words'; S.speakKeys=false; S.autoClear=false; S.vibration=true;
    applyColorMode(); applyCaption();
    renderAccess(); renderWindow(); renderPanelSections(); persist();
    showToast('Спокойные настройки восстановлены');
  }, {title:'Сброс настроек', okLabel:'Сбросить', danger:false});
}

// ===== О ПРИЛОЖЕНИИ =====
function renderAbout(){
  const el=document.getElementById('aboutContent'); if(!el) return;
  const online = navigator.onLine ? 'есть' : 'нет';
  el.innerHTML = uiSection('', [
    uiRow({title:'Символы ARASAAC', desc:'Автор символов Sergio Palao. Источник ARASAAC (arasaac.org), владелец — правительство Арагона. Лицензия Creative Commons BY-NC-SA: использование некоммерческое, с указанием авторства.'}),
    uiRow({title:'Связь с интернетом', desc:`Сейчас ${online}. Без сети приложение работает, а новые символы не загружаются.`}),
  ]);
  a11yEnhance(el);
}

// ===== ПЕРЕКЛЮЧАТЕЛИ =====
// Переключатель называет свою настройку сам, в data-setting. Раньше здесь стояла
// лестница из девяти условий по имени элемента: убрать экран настроек значило найти
// и выковырять из неё своё условие, а добавить — дописать десятое.
function toggleSwitch(el){
  el.classList.toggle('on');
  const on=el.classList.contains('on');
  el.setAttribute('aria-checked', on?'true':'false');   // состояние для скринридера (R-I2)
  const key=el.dataset.setting;
  if(key){ setSetting(key, on); return; }
  // Кнопки бокового столбца — не поле настройки, а её список: у них своя сборка.
  if(el.id && el.id.indexOf('toggleSide_')===0){ toggleSideButton(el.id.slice(11), on); return; }
  persist();
}


