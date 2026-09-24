// ===== ЯДРО: чистая логика (без DOM и без глобального состояния) =====
// Здесь живёт «думающая» часть приложения: грамматический движок, морфология
// карточек, матрица папки и окно на неё, перенос старых профилей. Всё это — чистые
// функции: результат зависит ТОЛЬКО от аргументов, никакого document, S, V или
// localStorage. Поэтому ядро можно проверять в терминале за секунду (см.
// test-core.js), не поднимая браузер, и логику правят отдельно от отрисовки.
//
// Как это работает без сборки. Файл подключён <script src="core.js"> ДО app.js.
// Верхнеуровневые function-объявления и const-таблицы попадают в общую глобальную
// область: app.js и инлайновые onclick видят их по имени как раньше. Порядок
// подключения важен — core.js должен идти первым. В самом низу — один guard
// module.exports для запуска в Node; в браузере module не определён, guard молчит.

// ===== ГРАММАТИКА: данные =====

// Маппинг любого подлежащего на ключ для CONJ
// Существительные-субъекты приводятся к ближайшему местоимению
const SUBJECT_MAP = {
  'я':'я', 'ты':'ты', 'он':'он', 'она':'она', 'мы':'мы', 'они':'они',
  'мне':'я',
  'мама':'она', 'папа':'он', 'друг':'он', 'сестра':'она',
  'учитель':'он', 'врач':'он', 'бабушка':'она', 'дедушка':'он',
};

// Полные таблицы спряжения для всех глаголов словаря
const CONJ = {
  'хотеть':    {я:'хочу',    ты:'хочешь',   он:'хочет',   она:'хочет',   мы:'хотим',   они:'хотят'},
  'идти':      {я:'иду',     ты:'идёшь',    он:'идёт',    она:'идёт',    мы:'идём',    они:'идут'},
  'есть':      {я:'ем',      ты:'ешь',      он:'ест',     она:'ест',     мы:'едим',    они:'едят'},
  'пить':      {я:'пью',     ты:'пьёшь',    он:'пьёт',    она:'пьёт',    мы:'пьём',    они:'пьют'},
  'играть':    {я:'играю',   ты:'играешь',  он:'играет',  она:'играет',  мы:'играем',  они:'играют'},
  'спать':     {я:'сплю',    ты:'спишь',    он:'спит',    она:'спит',    мы:'спим',    они:'спят'},
  'смотреть':  {я:'смотрю',  ты:'смотришь', он:'смотрит', она:'смотрит', мы:'смотрим', они:'смотрят'},
  'не хотеть': {я:'не хочу', ты:'не хочешь',он:'не хочет',она:'не хочет',мы:'не хотим',они:'не хотят'},
  'любить':    {я:'люблю',   ты:'любишь',   он:'любит',   она:'любит',   мы:'любим',   они:'любят'},
  'злиться':   {я:'злюсь',   ты:'злишься',  он:'злится',  она:'злится',  мы:'злимся',  они:'злятся'},
  'устать':    {я:'устал',   ты:'устал',    он:'устал',   она:'устала',  мы:'устали',  они:'устали'},
  'давать':    {я:'даю',     ты:'даёшь',    он:'даёт',    она:'даёт',    мы:'даём',    они:'дают'},
  'делать':    {я:'делаю',   ты:'делаешь',  он:'делает',  она:'делает',  мы:'делаем',  они:'делают'},
};

// Направленные формы мест (после «идти»)
const PLACES_DIRECTIONAL = {
  'дом':      'домой',
  'школа':    'в школу',
  'магазин':  'в магазин',
  'парк':     'в парк',
  'улица':    'на улицу',
  'больница': 'в больницу',
  'туалет':   'в туалет',
  'комната':  'в комнату',
};

// Переходные глаголы — требуют дополнения в вин. падеже
const TRANSITIVE_VERBS = new Set(['пить','есть','хотеть','не хотеть','любить','давать','делать','смотреть']);

// ДОГОВОР ДВИЖКА О СЛОВЕ. Он оформляет только эти три части речи: существительное
// ставит в падеж, местоимение берёт из своей таблицы, глагол спрягает. Прилагательное
// взрослого и готовую фразу возвращает как есть, не притворяясь, что знает их формы.
// Раньше правило было записано только «от противного» — всё, что не глагол, шло в
// винительный падеж, — и своя карточка взрослого «большая» звучала как «большаю», а
// готовая фраза «Пока» как «Поку». Спецификация (раздел «Как строится русская фраза»)
// перечисляет ровно существительное, место, глагол и местоимение; здесь то же самое,
// но записано в одном месте и проверяется сторожем.
const INFLECTED_POS = new Set(['noun','verb','pronoun']);

// Местоимения в винительном падеже — для дополнения после переходного глагола.
// «Я люблю ты» звучало как поломка; «Я люблю тебя» — та же мысль ребёнка, просто
// оформленная. Это остаётся работой ОФОРМИТЕЛЯ: слово выбрал ребёнок, движок лишь
// поставил его в нужную форму и ничего не добавил от себя.
// «мне» (дательный) и «это» не трогаем — они и так уместны.
const PRONOUN_ACC = { 'я':'меня', 'ты':'тебя', 'он':'его', 'она':'её', 'мы':'нас', 'они':'их' };

// ГРАНИЦА (доказательная): движок — ОФОРМИТЕЛЬ, а не АВТОР. Он склоняет/спрягает слова,
// которые выбрал САМ ребёнок, и добавляет только служебные слова (предлоги «в/на», «домой»).
// Он НЕ вставляет смысловые слова (существительные/глаголы) за ребёнка — это и есть активный
// ингредиент по доказательствам (детское комбинирование, Binger & Light 2007). Не пересекать
// эту черту в новых правилах G. Озвучка при этом остаётся грамматичной (телеграф отклонён).
const G = {
  'я хотеть молоко':'Я хочу молока','я хотеть вода':'Я хочу воды','я хотеть хлеб':'Я хочу хлеба',
  'я хотеть яблоко':'Я хочу яблоко','я хотеть сок':'Я хочу сока','я хотеть печенье':'Я хочу печенья',
  'я хотеть банан':'Я хочу банан','я хотеть каша':'Я хочу кашу','я хотеть пицца':'Я хочу пиццу',
  'я хотеть есть':'Я хочу есть','я хотеть пить':'Я хочу пить','я хотеть спать':'Я хочу спать',
  'я хотеть играть':'Я хочу играть','я хотеть идти дом':'Я хочу идти домой',
  'я хотеть идти улица':'Я хочу идти на улицу','я хотеть идти магазин':'Я хочу идти в магазин',
  'я хотеть идти школа':'Я хочу идти в школу','я хотеть идти парк':'Я хочу идти в парк',
  'я хотеть идти туалет':'Я хочу в туалет','я идти дом':'Я иду домой',
  'я идти школа':'Я иду в школу','я идти магазин':'Я иду в магазин','я идти улица':'Я иду на улицу',
  'я идти парк':'Я иду в парк','я есть каша':'Я ем кашу','я есть хлеб':'Я ем хлеб',
  'я есть яблоко':'Я ем яблоко','я есть печенье':'Я ем печенье','я есть пицца':'Я ем пиццу',
  'я пить молоко':'Я пью молоко','я пить вода':'Я пью воду','я пить сок':'Я пью сок',
  'мне больно':'Мне больно','я не хотеть есть':'Я не хочу есть','я не хотеть пить':'Я не хочу пить',
  'я не хотеть спать':'Я не хочу спать','я не хотеть идти школа':'Я не хочу идти в школу',
  'мама идти дом':'Мама идёт домой','мама идти магазин':'Мама идёт в магазин',
  'папа идти дом':'Папа идёт домой','он хотеть есть':'Он хочет есть','она хотеть пить':'Она хочет пить',
  'я хотеть идти':'Я хочу идти','мне хорошо':'Мне хорошо','мне плохо':'Мне плохо',
  'мне грустно':'Мне грустно','мне весело':'Мне весело','мне страшно':'Мне страшно',
  'я устать':'Я устал','я злиться':'Я злюсь','я любить мама':'Я люблю маму',
  'я любить папа':'Я люблю папу','я играть':'Я играю','я смотреть':'Я смотрю',
  'я спать':'Я сплю','мы идти парк':'Мы идём в парк','мы идти дом':'Мы идём домой',
  'мы хотеть есть':'Мы хотим есть','мы играть':'Мы играем','это мама':'Это мама','это папа':'Это папа',
};

// ===== ГРАММАТИКА: чистые помощники =====

// Найти эффективное подлежащее в массиве слов (первое вхождение)
// Учитывает customGender пользовательских слов
function findSubject(words) {
  for (const w of words) {
    if (w.customGender) return w.customGender === 'оно' ? 'он' : w.customGender; // ср.р. спрягается как муж.
    const s = SUBJECT_MAP[w.lemma];
    if (s) return s;
  }
  return null;
}

// Есть ли глагол с данной леммой в массиве слов
function hasVerb(lemma, words) {
  return words.some(w => w.lemma === lemma);
}

// Винительный падеж для существительного (прямое дополнение)
// Карточка без текста роняла здесь всю фразу целиком: ниже по коду пустые слова
// уже отсеиваются (см. grammar), но до того места доехать не удавалось. Доводим
// защиту до конца — битое сохранение, чужая копия или ошибка вызывающего теперь
// стоят одного пропущенного слова, а не пустого экрана у ребёнка.
function toAccusative(word) {
  const original = word == null ? '' : String(word);
  const w = original.toLowerCase().trim();
  if (!w) return original;
  if (w.endsWith('ья')) return original.slice(0,-2)+'ью';   // семья→семью
  if (w.endsWith('ия')) return original.slice(0,-2)+'ию';   // станция→станцию
  if (w.endsWith('я'))  return original.slice(0,-1)+'ю';    // дядя→дядю
  if (w.endsWith('а'))  return original.slice(0,-1)+'у';    // вода→воду, каша→кашу
  return original; // муж. неодуш. и ср.р. — форма не меняется
}

// Прямое дополнение после переходного глагола — одно место на все три ветки движка
// (частичное совпадение, алгоритм и форма одной карточки при нажатии). Раньше это
// правило было переписано трижды, и все три копии одинаково уродовали прилагательное.
function directObject(w) {
  if (!INFLECTED_POS.has(w.pos)) return w.text;              // прилагательное, готовая фраза
  if (w.pos === 'pronoun') return PRONOUN_ACC[w.lemma] || w.text;
  if (w.pos === 'verb') return w.text;                       // инфинитив после «хотеть»
  return toAccusative(w.text);
}

// Последний глагол в массиве — модальный? (хотеть / не хотеть)
// Если да, следующий глагол должен быть инфинитивом
function lastVerbIsModal(words) {
  for (let i = words.length - 1; i >= 0; i--) {
    if (words[i].pos === 'verb') {
      return words[i].lemma === 'хотеть' || words[i].lemma === 'не хотеть';
    }
  }
  return false;
}

// Последний глагол — переходный? (после него существительное в вин. падеже)
function lastVerbIsTransitive(words) {
  for (let i = words.length - 1; i >= 0; i--) {
    if (words[i].pos === 'verb') return TRANSITIVE_VERBS.has(words[i].lemma);
  }
  return false;
}

// ===== ГРАММАТИКА: движок =====
// Собирает грамматичную русскую фразу из выбранных ребёнком слов. Чистая: флаг
// «движок включён» приходит АРГУМЕНТОМ (engineActive), а не читается из состояния —
// в app.js вызывается как grammar(S.selectedWords, engineOn()).
function grammar(words, engineActive) {
  if (!words.length) return '';
  // Движок выключен (базовый уровень / «ребёнок строит сам») — ровно то, что выложено,
  // словарными формами, без склонения и особых случаев. Сообщение принадлежит ребёнку.
  if (!engineActive) {
    const s = words.map(w=>w.text).join(' ');
    return s.charAt(0).toUpperCase()+s.slice(1);
  }
  words = flattenParts(words);   // зачин «я хочу» = я + хотеть, только для движка
  const key = words.map(w=>w.lemma).join(' ').toLowerCase();
  // 1. Точное совпадение в G (особые случаи)
  if (G[key]) return G[key];
  // 2. Частичное совпадение от длинного к короткому
  for (let l=words.length;l>=2;l--) {
    const pk = words.slice(0,l).map(w=>w.lemma).join(' ').toLowerCase();
    if (G[pk]) {
      const matchedWords = words.slice(0,l);
      const restWords    = words.slice(l);
      // Последний глагол в совпавшей части — определяем контекст для остатка
      const lastV = [...matchedWords].reverse().find(w => w.pos==='verb');
      const endsTrans  = lastV && TRANSITIVE_VERBS.has(lastV.lemma);
      const endsMotion = lastV && lastV.lemma === 'идти';
      const restText = restWords.map(w => {
        if (endsMotion) {
          if (w.customDirectional) return w.customDirectional;
          if (PLACES_DIRECTIONAL[w.lemma]) return PLACES_DIRECTIONAL[w.lemma];
        }
        if (endsTrans) return directObject(w);
        return w.text;
      }).join(' ');
      return G[pk]+(restText?' '+restText:'');
    }
  }
  // 3. Алгоритмический движок с отслеживанием контекста
  const subj = findSubject(words);
  let afterModal      = false; // после «хотеть» — следующие глаголы остаются в инфинитиве
  let afterMotion     = false; // после «идти» — существительные-места становятся направленными
  let afterTransitive = false; // после переходного глагола — сущ. в вин. падеже
  const result = words.map(w => {
    if (w.pos === 'verb') {
      const isModal  = w.lemma === 'хотеть' || w.lemma === 'не хотеть';
      const isMotion = w.lemma === 'идти';
      const isTrans  = TRANSITIVE_VERBS.has(w.lemma);
      const conj = w.customConj || CONJ[w.lemma];
      if (isModal) {
        afterMotion = false;
        const form = (subj && conj && conj[subj]) ? conj[subj] : w.text;
        afterModal = true; afterTransitive = true; // хотеть переходный
        return form;
      }
      if (isMotion) {
        afterMotion = true; afterTransitive = false;
        if (afterModal) return w.text;
        const form = (subj && conj && conj[subj]) ? conj[subj] : w.text;
        afterModal = false;
        return form;
      }
      if (afterModal) return w.text;
      afterTransitive = isTrans; afterMotion = false;
      return (subj && conj && conj[subj]) ? conj[subj] : w.text;
    }
    // Место после «идти» — направленная форма
    if (afterMotion) {
      if (w.customDirectional) return w.customDirectional;
      if (PLACES_DIRECTIONAL[w.lemma]) return PLACES_DIRECTIONAL[w.lemma];
    }
    // Место после «идти» — направленная форма; после него глагол движения отработал
    if (afterMotion) { afterMotion = false; }
    // Прямое дополнение после переходного глагола — вин. падеж. Дополнение одно:
    // следующее слово («я хочу сок, я хочу…») уже не дополнение, иначе новое «я»
    // становилось «меня».
    if (afterTransitive) { afterTransitive = false; return directObject(w); }
    return w.text;
  });
  // Пустая карточка (битое сохранение, чужая копия) роняла всю доску: без слова
  // здесь нечего было писать с большой буквы. Пропускаем пустые.
  const clean=result.filter(t=>t && String(t).trim());
  if(!clean.length) return '';
  clean[0]=clean[0][0].toUpperCase()+clean[0].slice(1);
  return clean.join(' ');
}

// Форма ОДНОЙ карточки в контексте уже набранной фразы — то, что ребёнок услышит
// при тапе. Чистая: контекст (уже выбранные слова) и флаг движка приходят
// аргументами. В app.js вызывается как contextLabel(word, S.selectedWords, engineOn()).
// Те же правила, что в grammar(), но для одного слова относительно контекста —
// держим рядом в ядре, чтобы две копии правил не разъехались молча.
function contextLabel(word, context, engineActive) {
  context = flattenParts(context || []);
  // Движок выключен — всегда словарная форма из карточки (ребёнок строит сам)
  if (!engineActive) return word.text;
  // Зачин из нескольких слов («я хочу» = я + хотеть) звучит как хвост целой фразы:
  // так он согласуется с тем, что уже набрано, теми же правилами, что и фраза.
  if (Array.isArray(word.parts)) {
    const after = grammar(context.concat([word]), true);
    if (!context.length) return after;
    const before = grammar(context, true);
    if (before && after.indexOf(before + ' ') === 0) return after.slice(before.length + 1);
    return word.text;
  }
  // Сначала спрашиваем у самой сборки фразы, чем она отличается ДО и ПОСЛЕ этого
  // слова. Правила ниже знают только винительный падеж, а таблица особых случаев G
  // ставит после «хотеть» родительный: «Я хочу сока». Из-за этого одно и то же
  // слово звучало по-разному при нажатии («сок») и по кнопке «Сказать вслух»
  // («сока») — расходились молоко, вода, хлеб, сок и печенье.
  // Хвост берём только когда новая фраза начинается со старой. Если G перестроил
  // фразу целиком («я хотеть идти туалет» → «Я хочу в туалет», глагол исчез),
  // хвоста нет — и мы спокойно уходим на прежние правила.
  if (context.length) {
    const before = grammar(context, true);
    const after  = grammar(context.concat([word]), true);
    if (before && after.indexOf(before + ' ') === 0) return after.slice(before.length + 1);
  }
  if (word.pos === 'verb') {
    // После модального глагола — инфинитив, не спрягаем
    if (lastVerbIsModal(context)) return word.text;
    const subj = findSubject(context);
    if (!subj) return word.text;
    // Пользовательское спряжение (customConj) имеет приоритет
    const conj = word.customConj || CONJ[word.lemma];
    return (conj && conj[subj]) ? conj[subj] : word.text;
  }
  // Места — направленная форма после «идти»
  if (hasVerb('идти', context)) {
    if (word.customDirectional) return word.customDirectional;
    if (PLACES_DIRECTIONAL[word.lemma]) return PLACES_DIRECTIONAL[word.lemma];
  }
  // Прямое дополнение — вин. падеж после переходного глагола (пить, есть, хотеть, любить…)
  if (lastVerbIsTransitive(context) && !hasVerb('идти', context)) return directObject(word);
  return word.text;
}

// ===== МОРФОЛОГИЯ КАРТОЧКИ (авто-заполнение форм при добавлении слова) =====
// Чистые выводы: вся логика зашита окончаниями внутри, внешних таблиц нет.

// Авто-вывод всех форм из леммы (инфинитив или прошедшее время)
function autoFillVerbForms(lemma) {
  const l = lemma.toLowerCase().trim();
  // Прошедшее время: -ал/-яла/-ала
  if (l.endsWith('ал') && !l.endsWith('вал')) {
    const b = l.slice(0,-2);
    return {я:l, ты:l, он:l, она:b+'ала', мы:b+'али', они:b+'али'};
  }
  if (l.endsWith('ала')) {
    const b = l.slice(0,-3);
    return {я:b+'ал', ты:b+'ал', он:b+'ал', она:l, мы:b+'али', они:b+'али'};
  }
  if (l.endsWith('али')) {
    const b = l.slice(0,-3);
    return {я:b+'ал', ты:b+'ал', он:b+'ал', она:b+'ала', мы:l, они:l};
  }
  // Настоящее время из инфинитива
  if (l.endsWith('овать') || l.endsWith('евать')) {
    const b = l.slice(0,-5);
    return {я:b+'ую', ты:b+'уешь', он:b+'ует', она:b+'ует', мы:b+'уем', они:b+'уют'};
  }
  if (l.endsWith('ать') || l.endsWith('ять')) {
    const b = l.slice(0,-3);
    return {я:b+'аю', ты:b+'аешь', он:b+'ает', она:b+'ает', мы:b+'аем', они:b+'ают'};
  }
  if (l.endsWith('ить')) {
    const b = l.slice(0,-3);
    return {я:b+'ю', ты:b+'ишь', он:b+'ит', она:b+'ит', мы:b+'им', они:b+'ят'};
  }
  if (l.endsWith('еть')) {
    const b = l.slice(0,-3);
    return {я:b+'ею', ты:b+'еешь', он:b+'еет', она:b+'еет', мы:b+'еем', они:b+'еют'};
  }
  if (l.endsWith('уть')) {
    const b = l.slice(0,-3);
    return {я:b+'ну', ты:b+'нешь', он:b+'нет', она:b+'нет', мы:b+'нем', они:b+'нут'};
  }
  // Не распознали — показываем как есть, пусть пользователь заполнит
  return {я:l, ты:l, он:l, она:l, мы:l, они:l};
}

// Авто-предлог для места
function autoDirectional(word) {
  const w = word.toLowerCase().trim();
  if (w === 'дом')    return 'домой';
  if (w.endsWith('а') || w.endsWith('я')) return 'в ' + w.slice(0,-1) + 'у';
  return 'в ' + w;
}

// Авто-определение рода по окончанию
function autoGender(word) {
  const w = word.toLowerCase().trim();
  if (w.endsWith('ие') || w.endsWith('ье') || w.endsWith('ние') || w.endsWith('тие') ||
      w.endsWith('о') && !w.endsWith('го')) return 'оно';
  if (w.endsWith('а') || w.endsWith('я') || w.endsWith('ка') || w.endsWith('ша') || w.endsWith('ня')) return 'она';
  return 'он';
}

// ===== СТРОКОВЫЕ ПОМОЩНИКИ =====
// Русская плюрализация: one для 1, few для 2–4, many для 0/5+ (с учётом 11–19)
function plural(n,one,few,many){ n=Math.abs(n)%100; const d=n%10; if(n>10&&n<20)return many; if(d>1&&d<5)return few; if(d===1)return one; return many; }

// Экранирование пользовательского текста для вставки в разметку (innerHTML). Имя
// ребёнка и подписи карточек вводит взрослый вручную; символы < & " ' в них ломают
// разметку молча (амперсанд обрежет текст, угловая скобка откроет мнимый тег). На
// обычных словах ничего не меняет. Приложение локальное, так что это про
// устойчивость к редкому символу, а не про защиту от атаки.
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ===== СЛОВАРЬ: ПАПКА ЭТО МАТРИЦА, РАЗМЕР СЕТКИ ЭТО ОКНО =====
// Решение 0001 (Работа над продуктом/Решения по архитектуре): папка словаря это
// матрица клеток, восемь рядов в высоту и сколько угодно столбцов в ширину. У каждой
// карточки постоянное место «ряд:столбец». Настройка «карточек на доске» задаёт
// только окно: сколько столбцов и рядов видно. Окно двигается по матрице вправо на
// свою ширину, а когда столбцы кончились, переходит на следующую полосу рядов.
// Пустые клетки остаются пустыми: приложение никогда не сдвигает соседей само.
//
// Размеры пишем как «столбцы × ряды»: сначала ширина, потом высота, как у экрана
// (решение владельца от 24 сентября 2026 года). Ключ клетки при этом остаётся
// «ряд:столбец»: это форма данных, и её не меняем.
//
// Форма данных. Словарь V это набор папок по ключу: V[id] = {label, cells, pic?}.
// Корень лежит под ключом 'root', главные слова под 'core'. cells это объект
// «ряд:столбец» → клетка. Клетка-слово хранит саму карточку ({text, lemma, pos, …},
// hidden:true прячет её везде). Клетка-папка это {folder:'id', hide:{'р:с':true}}:
// одна папка может лежать в нескольких местах (связанная папка), а hide прячет её
// клетки «только здесь», то есть в этом месте словаря.

const MATRIX_ROWS = 8;   // высота матрицы задана словарём, не настройкой: ровно высота самого высокого окна
const VOCAB_COLS  = 8;   // стартовый словарь нарисован под восемь столбцов, как у Avaz

// Одиннадцать готовых размеров окна: карточек на доске → столбцы × ряды. Клетки окна
// растягиваются на всю доску, поэтому форма клетки зависит от формы окна. Набор
// подобран под поперечный планшет (доска примерно в полтора раза шире, чем выше):
// на нём каждое окно даёт клетку около 4 × 3, как карточка в строке фразы.
// Окно растёт по одному столбцу или ряду за шаг и не бывает выше матрицы.
// У Avaz было двенадцать размеров до 13 × 9; вытянутые окна вроде 3 × 1 и 4 × 2
// ломали форму клетки и убраны (24 сентября 2026).
const GRID_SIZES = [
  [1,1,1],[4,2,2],[9,3,3],[12,4,3],[16,4,4],[20,5,4],[24,6,4],
  [30,6,5],[42,7,6],[56,8,7],[80,10,8],
].map(([n,cols,rows]) => ({ n, rows, cols }));
const GRID_DEFAULT = 12;

function gridSize(n) {
  return GRID_SIZES.find(g => g.n === n) || GRID_SIZES.find(g => g.n === GRID_DEFAULT);
}
// Любое число картинок переводится в ближайший готовый размер: так читаются и
// старая настройка «столбцы × строки», и размер из прежнего списка двенадцати.
// При равном расстоянии берём меньший: крупнее карточки, а не больше их.
function nearestGridSize(count) {
  count = Number(count) || GRID_DEFAULT;
  let best = GRID_SIZES[0];
  for (const g of GRID_SIZES) {
    if (Math.abs(g.n - count) < Math.abs(best.n - count)) best = g;
  }
  return best.n;
}

function cellKey(r, c) { return r + ':' + c; }
function parseKey(k) { const p = String(k).split(':'); return { r: Number(p[0]), c: Number(p[1]) }; }

// Место i-й карточки при укладке подряд в матрицу шириной width. Сначала занимаем
// все ряды матрицы внутри width столбцов в порядке чтения, а когда матрица заполнена,
// растём вправо столбцами — тот же порядок, что у firstFreeCell.
//
// Формула была написана четырьмя копиями (два раза в переносе старого словаря, в
// «Убрать пропуски» и в расстановке по алфавиту) с двумя разными источниками ширины.
// У копий было общее последствие: деление ничем не ограничено, поэтому группа больше
// 32 слов давала ключи «4:0», «5:0» и ниже, а туда окно не смотрит — слова оставались
// в данных, но на доске не показывались и добраться до них было нельзя.
function matrixSlot(i, width) {
  width = Math.max(1, width || VOCAB_COLS);
  const full = MATRIX_ROWS * width;
  if (i < full) return cellKey(Math.floor(i / width), i % width);
  const beyond = i - full;
  return cellKey(beyond % MATRIX_ROWS, width + Math.floor(beyond / MATRIX_ROWS));
}

// Сколько рядов окна размера n реально может быть заполнено: выше матрицы окно не
// бывает. Нынешние окна в неё укладываются, ограничение остаётся на случай нового размера.
function windowRows(n) { return Math.min(gridSize(n).rows, MATRIX_ROWS); }

// Насколько крупно рисовать карточки в окне размера n. Решение «что такое крупно»
// жило в отрисовке доски, хотя зависит только от размера окна.
function windowDensity(n) {
  const rows = gridSize(n).rows;
  return rows <= 2 ? 'xl' : rows === 3 ? 'l' : rows <= 5 ? 'm' : rows <= 7 ? 's' : 'xs';
}

// Занятая часть матрицы: сколько рядов и столбцов реально используется.
// Скрытая карточка тоже занимает место: её клетка остаётся пустой, а не исчезает.
function matrixExtent(cells) {
  let rows = 0, cols = 0;
  for (const k in (cells || {})) {
    if (!cells[k]) continue;
    const { r, c } = parseKey(k);
    if (r >= MATRIX_ROWS) continue;
    rows = Math.max(rows, r + 1); cols = Math.max(cols, c + 1);
  }
  return { rows, cols };
}

// Сколько страниц у папки в окне размера n: столбцы листаются вправо, потом
// следующая полоса рядов. Проверено на папке «Действия» Avaz: 11 столбцов на окне
// в 8 столбцов дают две страницы (8 и 3 столбца), на окне в 10 столбцов тоже две (10 и 1).
function pageCount(cells, n) {
  const g = gridSize(n), ext = matrixExtent(cells);
  const hp = Math.max(1, Math.ceil(ext.cols / g.cols));
  const vp = Math.max(1, Math.ceil(Math.min(ext.rows, MATRIX_ROWS) / g.rows));
  return hp * vp;
}

// Клетки, которые видны в окне на странице page, в порядке чтения окна.
// Каждая запись: {r, c, key, cell, hidden}; cell равен null, если клетка пуста или
// скрыта (везде через cell.hidden или «только здесь» через hideMap этого места).
// В режиме правки (keepHidden) скрытая клетка возвращается вместе с пометкой
// hidden: 'all' или 'here', чтобы её можно было показать снова.
function windowCells(cells, n, page, hideMap, keepHidden) {
  cells = cells || {};
  const g = gridSize(n), ext = matrixExtent(cells);
  const hp = Math.max(1, Math.ceil(ext.cols / g.cols));
  page = Math.max(0, Math.min(page || 0, pageCount(cells, n) - 1));
  const band = Math.floor(page / hp), colPage = page % hp;
  const out = [];
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
    const R = band * g.rows + r, C = colPage * g.cols + c, key = cellKey(R, C);
    let cell = R < MATRIX_ROWS ? (cells[key] || null) : null;
    let hidden = null;
    if (cell && cell.hidden) hidden = 'all';
    else if (cell && hideMap && hideMap[key]) hidden = 'here';
    if (hidden && !keepHidden) cell = null;
    out.push({ r: R, c: C, key, cell, hidden });
  }
  return out;
}

// Ключи занятых клеток в порядке чтения: ряд за рядом, слева направо.
function orderedKeys(cells) {
  return Object.keys(cells || {}).filter(k => cells[k]).map(parseKey)
    .sort((a, b) => a.r - b.r || a.c - b.c).map(p => cellKey(p.r, p.c));
}

// Первая свободная клетка: сначала внутри восьми столбцов по всем рядам матрицы в
// порядке чтения, а если матрица заполнена, новый столбец справа. Новая карточка никого не сдвигает.
function firstFreeCell(cells, width) {
  cells = cells || {}; width = width || VOCAB_COLS;
  for (let r = 0; r < MATRIX_ROWS; r++) for (let c = 0; c < width; c++) {
    if (!cells[cellKey(r, c)]) return cellKey(r, c);
  }
  const ext = matrixExtent(cells);
  for (let c = width; c <= ext.cols; c++) for (let r = 0; r < MATRIX_ROWS; r++) {
    if (!cells[cellKey(r, c)]) return cellKey(r, c);
  }
  return cellKey(0, ext.cols);
}

// Положить клетки подряд, начиная с места at ('' — с первой свободной). Занятое место
// пропускается: новая карточка никого не сдвигает. Возвращает новый набор клеток и
// список мест, куда всё легло.
//
// Раньше эта связка — «взять свободную клетку, проверить занятость, записать» — стояла
// шестью копиями: слово, папка, много слов, вставка из буфера, связать папку, загрузить
// папку из файла. Копии успели разойтись мелочами, и каждая новая операция над словарём
// начиналась с того, что кто-то писал её заново.
function placeCells(cells, items, at, width) {
  const out = Object.assign({}, cells || {});
  const keys = [];
  let key = (at && !out[at]) ? at : firstFreeCell(out, width);
  (items || []).forEach(cell => {
    if (out[key]) key = firstFreeCell(out, width);
    out[key] = cell;
    keys.push(key);
    key = firstFreeCell(out, width);
  });
  return { cells: out, keys };
}

// Убрать клетки. Возвращает новый набор и то, что убрали, — вернуть на место можно
// по этому списку, ничего не угадывая.
function dropCells(cells, keys) {
  const out = Object.assign({}, cells || {});
  const dropped = [];
  (keys || []).forEach(k => {
    if (out[k]) { dropped.push({ key: k, cell: out[k] }); delete out[k]; }
  });
  return { cells: out, dropped };
}

// ===== ПРАВКА МАТРИЦЫ =====
// Два действия меняют места карточек: обмен двух клеток и «убрать пропуски». Оба
// возвращают новый объект клеток и карту переездов {старыйКлюч: новыйКлюч}: по ней
// переезжают скрытия «только здесь» на клетках-ссылках и путь по папкам.

// Обмен двух клеток. Пустая клетка тоже участвует: тогда это переезд.
function swapCells(cells, a, b) {
  const out = Object.assign({}, cells), map = {};
  const ca = cells[a], cb = cells[b];
  if (ca) { out[b] = ca; map[a] = b; } else delete out[b];
  if (cb) { out[a] = cb; map[b] = a; } else delete out[a];
  return { cells: out, map };
}
// Убрать пропуски: карточки ложатся подряд в порядке чтения, ширина матрицы прежняя.
// Это единственное действие, которое двигает соседей, и делает его только помощник.
function removeGaps(cells, width) {
  const keys = orderedKeys(cells);
  width = Math.max(1, width || matrixExtent(cells).cols || VOCAB_COLS);
  const out = {}, map = {};
  keys.forEach((k, i) => { const nk = matrixSlot(i, width); out[nk] = cells[k]; map[k] = nk; });
  return { cells: out, map };
}
// Расставить по алфавиту: папки первыми, потом слова, подряд в порядке чтения.
// labelOf(cell) отдаёт подпись клетки (для папки — название папки).
function arrangeAlpha(cells, width, labelOf) {
  const keys = orderedKeys(cells);
  const lab = k => String(labelOf ? labelOf(cells[k]) : (cells[k].text || '')).toLowerCase();
  const isFolder = k => !!cells[k].folder;
  keys.sort((a, b) => (isFolder(b) - isFolder(a)) || lab(a).localeCompare(lab(b), 'ru'));
  width = Math.max(1, width || matrixExtent(cells).cols || VOCAB_COLS);
  const out = {}, map = {};
  keys.forEach((k, i) => { const nk = matrixSlot(i, width); out[nk] = cells[k]; map[k] = nk; });
  return { cells: out, map };
}
// Перенести карту скрытий «только здесь» по карте переездов.
function remapHide(hide, map) {
  if (!hide) return hide;
  const out = {};
  for (const k in hide) if (hide[k]) out[map[k] || k] = true;
  return out;
}

// ===== ПОИСК ПУТИ К СЛОВУ (показ пути) =====
// На какой странице окна размера n лежит клетка key.
function pageOfKey(cells, n, key) {
  const g = gridSize(n), ext = matrixExtent(cells), { r, c } = parseKey(key);
  const hp = Math.max(1, Math.ceil(ext.cols / g.cols));
  return Math.floor(r / g.rows) * hp + Math.floor(c / g.cols);
}
// Кратчайший путь от домашней папки до слова в клетке key папки folderId.
// Возвращает путь в форме S.folderPath ([{id}, {id, from, key}, …]) или null, если
// слово оттуда недоступно: лежит выше дома, скрыто везде или скрыто «только здесь»
// на всех дорогах. Папка «Ключевые слова» достижима отовсюду кнопкой столбца.
function findPath(V, folderId, key, homeId) {
  homeId = V[homeId] ? homeId : 'root';
  const target = V[folderId] && V[folderId].cells[key];
  if (!target || target.hidden) return null;
  const visibleHere = (entry) => {
    if (!entry.from) return true;
    const link = V[entry.from] && V[entry.from].cells[entry.key];
    return !(link && link.hide && link.hide[key]);
  };
  const start = [{ id: homeId }];
  const queue = [start];
  const seen = new Set([homeId]);
  while (queue.length) {
    const path = queue.shift();
    const last = path[path.length - 1];
    if (last.id === folderId && visibleHere(last)) return path;
    const f = V[last.id]; if (!f) continue;
    const linkOfLast = last.from ? V[last.from].cells[last.key] : null;
    for (const k of orderedKeys(f.cells)) {
      const c = f.cells[k];
      if (!c || !c.folder || !V[c.folder] || c.hidden) continue;
      if (linkOfLast && linkOfLast.hide && linkOfLast.hide[k]) continue;   // ссылка скрыта «только здесь»
      const next = { id: c.folder, from: last.id, key: k };
      if (c.folder === folderId && visibleHere(next)) return path.concat([next]);
      if (seen.has(c.folder)) continue;
      seen.add(c.folder);
      queue.push(path.concat([next]));
    }
  }
  if (folderId === 'core' && V.core) return start.concat([{ id: 'core' }]);
  return null;
}

// ===== ПРИСПОСОБЛЕНИЯ К КАСАНИЮ =====
// Чистая машина касания. Событие {type:'down'|'move'|'up'|'timer', key, t} и настройки
// {select:'release'|'press', hold: мс, repeat: мс} превращаются в новое состояние и
// ключ клетки, которая сработала (fire), либо null. Время t приходит снаружи, поэтому
// машину можно проверить в терминале без таймеров.
function touchStart() { return { pressed: null, downAt: 0, blockedUntil: 0 }; }
function touchStep(st, ev, cfg) {
  st = st || touchStart();
  cfg = Object.assign({ select: 'release', hold: 0, repeat: 0 }, cfg || {});
  const fire = key => ({ state: { pressed: null, downAt: 0, blockedUntil: ev.t + cfg.repeat }, fire: key });
  const idle = { state: st, fire: null };
  if (ev.type === 'down') {
    if (ev.t < st.blockedUntil) return { state: st, fire: null, ignored: 'repeat' };
    if (!ev.key) return idle;
    if (cfg.select === 'press' && cfg.hold <= 0) return fire(ev.key);
    return { state: { pressed: ev.key, downAt: ev.t, blockedUntil: st.blockedUntil }, fire: null };
  }
  if (!st.pressed) return idle;
  if (ev.type === 'move') {
    // По отпусканию срабатывает клетка под пальцем в момент отрыва: палец может доехать
    if (cfg.select === 'release') return { state: Object.assign({}, st, { pressed: ev.key || st.pressed }), fire: null };
    // По нажатию уход с клетки отменяет удержание
    if (ev.key !== st.pressed) return { state: Object.assign({}, st, { pressed: null }), fire: null, ignored: 'left' };
    return idle;
  }
  if (ev.type === 'timer') {
    if (cfg.select === 'press' && ev.t - st.downAt >= cfg.hold) return fire(st.pressed);
    return idle;
  }
  if (ev.type === 'up') {
    if (cfg.select === 'release' && ev.t - st.downAt >= cfg.hold) return fire(ev.key || st.pressed);
    return { state: Object.assign({}, st, { pressed: null }), fire: null, ignored: cfg.select === 'release' ? 'short' : 'released' };
  }
  return idle;
}

// Зачин из нескольких слов («я хочу») хранится одной карточкой с полем parts.
// Для грамматики он разворачивается в свои части, а на экране остаётся одной клеткой.
function flattenParts(words) {
  const out = [];
  for (const w of (words || [])) {
    if (w && Array.isArray(w.parts)) out.push(...w.parts); else if (w) out.push(w);
  }
  return out;
}

// ===== ПЕРЕНОС СТАРЫХ ПРОФИЛЕЙ =====
// До 22 сентября 2026 года словарь был набором групп {label, words:[…]}, а полоса
// ключевых слов и «Избранное» жили отдельно. Старый профиль переезжает в матрицу
// сам: группы становятся папками в корне в прежнем порядке, слова каждой группы
// ложатся в порядке чтения по восемь в ряд, избранное уходит в папку «Быстрые фразы»,
// а ключевые слова берутся из стартового словаря. Никто ничего не теряет.
function isLegacyVocab(v) {
  return !!v && !v.root && Object.values(v).some(c => c && Array.isArray(c.words));
}
function migrateVocabV1(old, starter, order) {
  const V = {};
  order = order || [];
  const keys = [...order.filter(k => old[k]), ...Object.keys(old).filter(k => !order.includes(k))];
  const favs = [];
  keys.forEach(k => {
    const c = old[k] || {};
    const cells = {};
    (c.words || []).forEach((w, i) => {
      const nw = Object.assign({}, w);
      delete nw.emoji; delete nw.core;
      if (nw.fav) favs.push(Object.assign({}, nw));
      delete nw.fav;
      cells[matrixSlot(i, VOCAB_COLS)] = nw;
    });
    V[k] = { label: c.label || k, cells };
    if (c.picto) V[k].picto = c.picto;
  });
  if (V.quick && V.quick.label === 'Общение') V.quick.label = 'Быстрые фразы';
  if (favs.length) {
    if (!V.quick) V.quick = { label: 'Быстрые фразы', cells: {} };
    favs.forEach(w => { delete w.fav; V.quick.cells[firstFreeCell(V.quick.cells)] = w; });
  }
  const rootCells = {};
  Object.keys(V).forEach((k, i) => { rootCells[matrixSlot(i, VOCAB_COLS)] = { folder: k }; });
  V.root = { label: 'Домой', cells: rootCells };
  if (starter && starter.core) V.core = JSON.parse(JSON.stringify(starter.core));
  return V;
}
// Старые настройки: «столбцы × строки» → размер окна, текущая группа → путь по папкам.
function migrateSettingsV1(s) {
  if (!s || typeof s !== 'object') return s;
  if ('gridCols' in s || 'gridRows' in s) {
    if (!('gridSize' in s)) s.gridSize = nearestGridSize((Number(s.gridCols) || 3) * (Number(s.gridRows) || 3));
    delete s.gridCols; delete s.gridRows;
  }
  // Список размеров сокращён 24 сентября 2026 года: сохранённое значение из прежнего
  // списка (например, 15) уходит в ближайший нынешний размер, а не в умолчание.
  if ('gridSize' in s) s.gridSize = nearestGridSize(s.gridSize);
  if ('currentCategory' in s) {
    if (!Array.isArray(s.folderPath)) s.folderPath = [{ id: 'root' }];
    delete s.currentCategory;
  }
  // «Озвучивать при выборе» стало положением «что проговаривать»: выключено → только строку
  if ('speakOnSelect' in s) {
    if (!('speakMode' in s)) s.speakMode = s.speakOnSelect === false ? 'strip' : 'words';
    delete s.speakOnSelect;
  }
  return s;
}

// ===== СОХРАНЁНКА: ОДИН ВХОД, ОДИН ВЫХОД =====
// Всё, что приложение знает про устройство своих сохранённых данных, лежит здесь.
// Наружу торчат две операции: собрать сохранёнку из рабочего состояния (packState) и
// разобрать её обратно (unpackState). Само хранилище браузера живёт в app-6-boot,
// ядро про него не знает — поэтому круг «сохранил, загрузил, получил то же самое»
// проверяется в терминале.
//
// До 23 сентября 2026 года разбора как отдельной вещи не было. Перенос старого словаря
// стоял четырьмя дословными копиями, настройки писались дважды — и в профиль, и рядом
// с ним, — а чистка полей от убранных возможностей шла пятью кусками прямо в загрузчике.

// Поля убранных возможностей: код доступа, предсказание слов, ступени и фазы обучения,
// старая сетка «столбцы × строки». Выбрасываем, чтобы они не всплыли при откате версии.
const DEAD_SETTINGS = [
  'correctPin', 'pinCustomized', 'pin', 'predictive',
  'level', 'phase', 'grammarLevel', 'stage', 'learn', 'childReady', 'pauseSeconds',
  'gridCols', 'gridRows', 'currentCategory', 'tempCols', 'tempRows', 'speakOnSelect',
];

// Настройки одного профиля в нынешнем виде.
function migrateSettings(s) {
  s = migrateSettingsV1(Object.assign({}, s || {})) || {};
  if (typeof s.colorCode === 'boolean') s.colorCode = s.colorCode ? 'border' : 'off';   // был выключатель, стал вид оформления
  if (s.colorCode === 'fill') s.colorCode = 'border';                                   // заливка фона убрана
  // Листание было выключателем «свайпом да/нет», стало выбором из трёх. Явно включённый
  // свайп остаётся свайпом; выключенный был умолчанием, а не выбором, и уходит в новое
  // умолчание «свайпом и стрелками» (решение владельца от 23 сентября 2026 года).
  if ('swipePages' in s) {
    if (!('paging' in s) && s.swipePages === true) s.paging = 'swipe';
    delete s.swipePages;
  }
  // Недосказанная фраза: только осмысленные слова, на случай обрыва записи.
  if ('selectedWords' in s) {
    s.selectedWords = Array.isArray(s.selectedWords)
      ? s.selectedWords.filter(w => w && typeof w.text === 'string' && w.text.trim()) : [];
  }
  DEAD_SETTINGS.forEach(k => { delete s[k]; });
  return s;
}

// Один профиль в нынешнем виде: свой словарь-матрица и свои настройки.
function migrateProfile(p, starter, order) {
  if (!p || typeof p !== 'object') return p;
  delete p.log;                                     // наблюдения убраны 22 сентября 2026 года
  if (!p.vocab && starter) p.vocab = JSON.parse(JSON.stringify(starter));
  if (isLegacyVocab(p.vocab)) p.vocab = migrateVocabV1(p.vocab, starter, order);
  if (!p.settings || typeof p.settings !== 'object') p.settings = {};
  // Размер окна раньше лежал на самом профиле, а не в его настройках.
  if (p.gridCols || p.gridRows) {
    if (!('gridSize' in p.settings)) {
      p.settings.gridSize = nearestGridSize((Number(p.gridCols) || 3) * (Number(p.gridRows) || 3));
    }
    delete p.gridCols; delete p.gridRows;
  }
  p.settings = migrateSettings(p.settings);
  return p;
}

// Рабочее состояние → сохранёнка. Словарь и настройки активного профиля ложатся в сам
// профиль, второго экземпляра рядом больше нет. Фото карточек тяжёлые, и на пределе
// памяти браузера (около 5 МБ) вторая копия стоила места, за которым словарь просто
// переставал сохраняться.
function packState(st) {
  st = st || {};
  const profiles = (st.profiles || []).map(p => (p && p.active)
    ? Object.assign({}, p, { vocab: st.vocab, settings: st.settings })
    : p);
  return {
    stateVersion: 2,
    profiles,
    nextProfileId: st.nextProfileId,
    arasaacIds: st.arasaacIds || {},
  };
}

// Сохранёнка → рабочее состояние {profiles, nextProfileId, arasaacIds, vocab, settings}.
// starter — стартовый словарь, order — порядок папок старого словаря, defaults —
// значения настроек по умолчанию: чего в сохранёнке нет, берётся оттуда.
function unpackState(data, opts) {
  opts = opts || {};
  const starter = opts.starter, order = opts.order, defaults = opts.defaults || {};
  const d = (data && typeof data === 'object') ? data : {};
  const profiles = Array.isArray(d.profiles) ? d.profiles.filter(p => p && typeof p === 'object') : [];
  // Очень старая сохранёнка: словарь был один на всех и лежал наверху.
  if (d.V && !profiles.some(p => p.vocab)) {
    profiles.forEach(p => { p.vocab = JSON.parse(JSON.stringify(d.V)); });
  }
  const active = profiles.find(p => p.active) || profiles[0] || null;
  // Там же наверху лежали и настройки активного профиля. Берём их, только если у
  // профиля своих нет: иначе свежие затёрлись бы старой копией.
  if (active && !active.settings && d.settings) {
    active.settings = JSON.parse(JSON.stringify(d.settings));
  }
  profiles.forEach(p => migrateProfile(p, starter, order));

  let vocab = active ? active.vocab : null;
  if (!vocab && d.V) vocab = isLegacyVocab(d.V) ? migrateVocabV1(d.V, starter, order) : d.V;

  const saved = active ? active.settings : migrateSettings(d.settings);
  const settings = {};
  Object.keys(defaults).forEach(k => {
    const v = (k in saved) ? saved[k] : defaults[k];
    if (v !== undefined) settings[k] = JSON.parse(JSON.stringify(v));
  });

  return {
    profiles,
    nextProfileId: typeof d.nextProfileId === 'number' ? d.nextProfileId : null,
    arasaacIds: (d.arasaacIds && typeof d.arasaacIds === 'object') ? d.arasaacIds : {},
    vocab,
    settings,
  };
}

// ===== Экспорт для терминального теста (в браузере пропускается) =====
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // грамматика
    SUBJECT_MAP, CONJ, PLACES_DIRECTIONAL, TRANSITIVE_VERBS, PRONOUN_ACC, G,
    findSubject, hasVerb, toAccusative, directObject, INFLECTED_POS, lastVerbIsModal, lastVerbIsTransitive, grammar, contextLabel,
    // морфология
    autoFillVerbForms, autoDirectional, autoGender,
    // строки
    plural, esc,
    // матрица и окно
    MATRIX_ROWS, VOCAB_COLS, GRID_SIZES, GRID_DEFAULT, gridSize, nearestGridSize,
    cellKey, parseKey, matrixSlot, windowRows, windowDensity, matrixExtent, pageCount, windowCells, orderedKeys, firstFreeCell,
    placeCells, dropCells,
    flattenParts, isLegacyVocab, migrateVocabV1, migrateSettingsV1,
    // сохранёнка
    DEAD_SETTINGS, migrateSettings, migrateProfile, packState, unpackState,
    swapCells, removeGaps, remapHide, arrangeAlpha, pageOfKey, findPath,
    touchStart, touchStep,
  };
}
