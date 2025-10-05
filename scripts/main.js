
    // === Utils ===
    // Максимальні річні ліміти ФОП (2025)
      const FOP_LIMITS = {
        "1": 1182400,   // грн (1 група)
        "2": 7818900/1.35, // ≈5,8 млн грн (2 група)
        "3": 7818900,   // грн (3 група)
        "general": Infinity // без ліміту для загальної системи
      };
      const ESV_RATE = 0.22;

      // отримати ліміт для поточної групи
      function getFopLimit() {
        return FOP_LIMITS[groupEl.value] || Infinity;
      }

    const $ = (id) => document.getElementById(id);
    const fmtUAH = (v) => Number(v||0).toLocaleString('uk-UA',{style:'currency',currency:'UAH',maximumFractionDigits:2});
    const fmtUSD = (v) => Number(v||0).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2});
    const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));

    // Полные форматтеры
    const fmtUAHFull = (v) => Number(v||0).toLocaleString('uk-UA',{style:'currency',currency:'UAH',maximumFractionDigits:2});
    const fmtUSDFull = (v) => Number(v||0).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2});

    // Надёжный компакт: сначала пробуем currency+compact, если получилось длинно — делаем decimal+ручной символ
    function compactCurrency(locale, currency, value){
      const num = Number(value)||0;
      const full = new Intl.NumberFormat(locale,{style:'currency',currency,maximumFractionDigits:2}).format(num);
      let tryCompact = new Intl.NumberFormat(locale,{style:'currency',currency,notation:'compact',maximumFractionDigits:2}).format(num);
      // если compact "не сработал" (слишком длинно), делаем свою сборку
      if(tryCompact.length > 18){
        const dec = new Intl.NumberFormat(locale,{notation:'compact',maximumFractionDigits:2}).format(num);
        if(currency==='UAH'){
          tryCompact = `${dec} грн`; // в украинской локали валюта после числа
        }else if(currency==='USD'){
          const parts = new Intl.NumberFormat(locale,{style:'currency',currency, currencyDisplay:'narrowSymbol'}).formatToParts(1);
          const sym = (parts.find(p=>p.type==='currency')||{}).value || '$';
          tryCompact = `${sym}${dec}`;
        }else{
          tryCompact = `${dec} ${currency}`;
        }
      }
      return {full, compact:tryCompact};
    }

    // Порог для принудительного compact
    const FORCE_COMPACT_ABS = 1e4;
    const FORCE_COMPACT_LEN = 14;

    // KPI: показать деньги с автокомпактом
    function setMoney(el, value, currency='UAH') {
      const locale = currency==='USD' ? 'en-US' : 'uk-UA';
      const {full, compact} = compactCurrency(locale, currency, value);
      const mustCompact = Math.abs(Number(value)||0) >= FORCE_COMPACT_ABS || String(full).length > FORCE_COMPACT_LEN;
      el.textContent = mustCompact ? compact : full;
      el.title = full;
      el.classList.toggle('shrink', mustCompact);
      if(!mustCompact){
        requestAnimationFrame(()=>{ if(el.scrollWidth>el.clientWidth){ el.textContent=compact; el.classList.add('shrink'); } });
      }
    }

    // Чипы «Σ помісячно»
    function chipMoney(value, currency='UAH'){
      const locale = currency==='USD' ? 'en-US' : 'uk-UA';
      const {full, compact} = compactCurrency(locale, currency, value);
      const mustCompact = Math.abs(Number(value)||0) >= FORCE_COMPACT_ABS || String(full).length > FORCE_COMPACT_LEN;
      return { text: mustCompact ? compact : full, title: full };
    }

    // === Elements ===
    const groupEl = $('group');
    const periodEl = $('period');
    const incomeUAHEl = $('incomeUAH');
    const incomeCurrencyEl = $('incomeCurrency');
    const epModeEl = $('epMode');
    const epValueEl = $('epValue');
    const minWageUAHEl = $('minWageUAH');
    const monthsCountEl = $('monthsCount');
    const otherPercentEl = $('otherPercent');
    const otherFixedEl = $('otherFixed');
    const feesUAHEl = $('feesUAH');
    const militaryTaxEl  = $('militaryTax');
    const militaryBaseEl = $('militaryBase');

    const totalUSDEl = $('totalUSD');
    const totalUAHEl = $('totalUAH');
    const usdNoteEl = $('usdNote');
    const uahNoteEl = $('uahNote');
    const epUAHEl = $('epUAH');
    const esvUAHEl = $('esvUAH');
    const otherUAHEl = $('otherUAH');
    const epModeNoteEl = $('epModeNote');
    const esvNoteEl = $('esvNote');
    const otherNoteEl = $('otherNote');
    const vzUAHEl = $('vzUAH');
    const vzNoteEl = $('vzNote');
    const rateChipsEl = $('rateChips');

    const recalcBtn = $('recalcBtn');
    const resetBtn = $('resetBtn');

    // Monthly UI
    const useMonthlyEl      = $('useMonthly');
    const addMonthBtn       = $('addMonthBtn');
    const clearMonthsBtn    = $('clearMonthsBtn');
    const monthsListEl      = $('monthsList');
    const monthsSumWrapEl   = $('monthsSumWrap');
    const monthsHintEl      = $('monthsHint');
    const monthsAutoNoteEl  = $('monthsAutoNote');
    const monthlyCurrencyEl = $('monthlyCurrency');

    // === NBU FX Rate ===
    async function fetchNbuUsd(dateStr){
      const base='https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json';
      const url = dateStr ? `${base}&date=${dateStr}` : base;
      const r = await fetch(url);
      if(!r.ok) throw new Error('NBU rate fetch failed');
      const data = await r.json();
      if(!Array.isArray(data)||!data.length) throw new Error('NBU rate empty');
      return { rate:data[0].rate, exchangedate:data[0].exchangedate };
    }
    function yyyymmdd(d){
      const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
      return `${y}${m}${day}`;
    }

    let fx = { today:null, prev:null };

    async function loadRates(){
      rateChipsEl.innerHTML = `<span class="chip">Завантаження курсу…</span>`;
      try{
        const now=new Date(); const yesterday=new Date(now); yesterday.setDate(now.getDate()-1);
        const [today,prev]=await Promise.all([fetchNbuUsd(), fetchNbuUsd(yyyymmdd(yesterday))]);
        fx.today=today; fx.prev=prev;
        const delta=today.rate - prev.rate;
        const dirClass= delta>0?'rate-up':(delta<0?'rate-down':''); const arrow= delta>0?'↑':(delta<0?'↓':'→');
        const deltaAbs=Math.abs(delta).toFixed(3);
        rateChipsEl.innerHTML = `
          <span class="chip"><strong>Сьогодні:</strong> ${today.rate.toFixed(3)} UAH</span>
          <span class="chip">Дата: ${today.exchangedate}</span>
          <span class="chip ${dirClass}">${arrow} зміна: ${deltaAbs}</span>
          <span class="chip muted">Вчора: ${prev.rate.toFixed(3)} UAH (${prev.exchangedate})</span>
        `;
      }catch(e){
        rateChipsEl.innerHTML = `<span class="chip" style="color:#ffb020">Не вдалося отримати курс НБУ. Перевір підключення.</span>`;
      }
      recalc();
    }

    // === Group presets ===
    let userEditedMonths=false;
    monthsCountEl.addEventListener('input',()=>{ userEditedMonths=true; });
    periodEl.addEventListener('change',()=>{ userEditedMonths=false; });

    function applyGroupHints(){
      const g=groupEl.value, p=periodEl.value;

      if(g==='3'){
        epModeEl.value='percent';
        if(Number(epValueEl.value)===5 || Number(epValueEl.value)===0) epValueEl.value=5;
      } else if(g==='1'||g==='2'){
        epModeEl.value='fixed';
        if(Number(epValueEl.value)===5) epValueEl.value=0;
      } else if(g==='general'){
        epModeEl.value='percent';
        if(Number(epValueEl.value)===5) epValueEl.value=0;
      }

      if(!userEditedMonths){
        if(p==='month')   monthsCountEl.value=1;
        if(p==='quarter') monthsCountEl.value=3;
        if(p==='year')    monthsCountEl.value=12;
      }
    }

    // === Monthly salaries state ===
    let salaries = []; // [{id, amount}]
    let idSeq = 1;

    function addSalary(amount=''){
      salaries.push({ id: idSeq++, amount: amount!=='' ? Number(amount) : '' });
      renderMonths();
      recalc();
    }

    function getEsvPerMonthFromMinWage(){
  const mw = Number(minWageUAHEl?.value) || 0;
  return mw * ESV_RATE;
}


    function removeSalary(id){
      salaries = salaries.filter(x=>x.id!==id);
      renderMonths();
      recalc();
    }
    function setSalary(id, amount){
      const row = salaries.find(x=>x.id===id);
      if(row){
        let val = amount===''? '' : Number(amount);
        const max = getFopLimit();
        if(val > max){
          val = max; // обрезаем до максимума
          alert(`⚠️ Перевищено ліміт для ФОП (${max.toLocaleString('uk-UA')} грн). Значення скориговане.`);
        }
        row.amount = val;
      }
      renderSumChip();
      recalc();
}

    function monthlyRawSum(){
      return salaries.reduce((s,x)=> s + (Number(x.amount)||0), 0);
    }
    function monthlySumUAH(){
      const raw = monthlyRawSum();
      if(monthlyCurrencyEl.value==='UAH') return raw;
      if(fx.today?.rate){ return raw * fx.today.rate; }
      return 0;
    }

    function renderMonths(){
      monthsListEl.innerHTML = salaries.map((x, idx)=>`
        <div class="salary-item" data-id="${x.id}">
          <div class="idx">Місяць ${idx+1}</div>
          <input type="number" step="0.01" min="0" placeholder="Сума за місяць" value="${x.amount!==''?x.amount:''}">
          <button class="icon-btn delete-btn" title="Видалити місяць" aria-label="Видалити місяць">✖</button>
        </div>
      `).join('');

      [...monthsListEl.querySelectorAll('.salary-item')].forEach(el=>{
        const id = Number(el.getAttribute('data-id'));
        const input = el.querySelector('input');
        const delBtn = el.querySelector('button');
        input.addEventListener('input', e=> setSalary(id, e.target.value));
        delBtn.addEventListener('click', ()=> removeSalary(id));
      });

      renderSumChip();
      toggleMonthlyUI();
      if(useMonthlyEl.checked && !userEditedMonths){
        monthsCountEl.value = Math.max(1, salaries.length||1);
        monthsAutoNoteEl.textContent = `Авто: дорівнює кількості введених місяців (${monthsCountEl.value}).`;
      } else {
        monthsAutoNoteEl.textContent = '';
      }
    }

    function renderSumChip(){
      if(!useMonthlyEl.checked){ monthsSumWrapEl.innerHTML=''; return; }
      const raw = monthlyRawSum();
      const rawFmt = chipMoney(raw, monthlyCurrencyEl.value);
      const sumUAH = monthlySumUAH();
      const hasRate = Boolean(fx.today?.rate);

      const extra = monthlyCurrencyEl.value==='USD'
        ? (hasRate
            ? (() => {
                const uahFmt = chipMoney(sumUAH, 'UAH');
                return `<span class="chip muted" title="${uahFmt.title}">≈ ${uahFmt.text} (за курсом НБУ)</span>`;
              })()
            : `<span class="chip" style="color:#ffb020">Курс НБУ не завантажено — конвертація в UAH недоступна</span>`)
        : '';

      monthsSumWrapEl.innerHTML = `
        <span class="chip" title="${rawFmt.title}"><strong>Σ помісячно:</strong>&nbsp;${rawFmt.text}</span>
        ${extra}
        <span class="chip muted">К-ть записів: ${salaries.length||0}</span>
      `;
    }

    function toggleMonthlyUI(){
      const active = useMonthlyEl.checked;
      monthsListEl.classList.toggle('hide', !active);
      monthsHintEl.classList.toggle('hide', !active);
      monthsSumWrapEl.classList.toggle('hide', !active);
      monthlyCurrencyEl.disabled = !active;
      addMonthBtn.disabled = !active;
      clearMonthsBtn.disabled = !active;
    }

    // === Calc ===
    function getIncomeUAH(){
      if(useMonthlyEl.checked && salaries.length>0){ return monthlySumUAH(); }
      const income = Number(incomeUAHEl.value)||0;
      if(incomeCurrencyEl.value==='USD' && fx.today?.rate){ return income*fx.today.rate; }
      return income;
    }

    function calc(){
  applyGroupHints();

  const incomeUAH   = getIncomeUAH();
  const otherPercent= Number(otherPercentEl.value)||0;
  const otherFixed  = Number(otherFixedEl.value)||0;
  const feesUAH     = Number(feesUAHEl.value)||0;
  const months      = clamp(Number(monthsCountEl.value)||1, 1, 12);

  // ЄП
  let epUAH = 0;
  if (epModeEl.value === 'percent') {
    const ratePct = Number(epValueEl.value)||0;
    epUAH = incomeUAH * ratePct / 100;
    epModeNoteEl.textContent = `ЄП = ${ratePct}% від доходу`;
  } else {
    const fixed = Number(epValueEl.value)||0;
    epUAH = fixed * months;
    epModeNoteEl.textContent = `ЄП = фіксована сума × ${months} міс.`;
  }

  // ВЗ
  const militaryRate = Number(militaryTaxEl.value)||0;
  const baseInput    = Number(militaryBaseEl.value);
  const base         = Number.isFinite(baseInput) && baseInput>0 ? baseInput : incomeUAH;
  const militaryUAH  = base * militaryRate / 100;
  if (militaryRate > 0) {
    const { text, title } = chipMoney(base, 'UAH');
    vzNoteEl.textContent = `ВЗ = ${militaryRate}% від ${text}`;
    vzNoteEl.title = title;
  } else {
    vzNoteEl.textContent = '—';
    vzNoteEl.removeAttribute('title');
  }

  // ЄСВ (ОДИН раз)
  const esvPerMonth = getEsvPerMonthFromMinWage();
  const esvUAH      = esvPerMonth * months;
  const minWageVal  = Number(minWageUAHEl?.value) || 0;
  esvNoteEl.textContent = `ЄСВ = 22% × ${fmtUAH(minWageVal)} = ${fmtUAH(esvPerMonth)} × ${months} міс.`;

  // Інше
  const otherFromPercent = incomeUAH * otherPercent / 100;
  const otherUAH         = otherFromPercent + otherFixed + feesUAH;
  const otherParts = [];
  if (otherPercent>0) otherParts.push(`${otherPercent}% від доходу`);
  if (otherFixed>0)   otherParts.push(`фіксовано ${fmtUAH(otherFixed)}`);
  if (feesUAH>0)      otherParts.push(`комісії ${fmtUAH(feesUAH)}`);
  otherNoteEl.textContent = otherParts.length ? otherParts.join(' + ') : '—';

  const totalUAH = epUAH + esvUAH + otherUAH + militaryUAH;
  const usdRate  = fx.today?.rate || null;
  const totalUSD = usdRate ? (totalUAH / usdRate) : null;

  return { incomeUAH, epUAH, esvUAH, otherUAH, militaryUAH, totalUAH, totalUSD, usdRate };
}


    function recalc(){
      const r = calc();
      setMoney(epUAHEl,    r.epUAH,       'UAH');
      setMoney(esvUAHEl,   r.esvUAH,      'UAH');
      setMoney(vzUAHEl,    r.militaryUAH, 'UAH');
      setMoney(otherUAHEl, r.otherUAH,    'UAH');

      setMoney(totalUAHEl, r.totalUAH,    'UAH');
      uahNoteEl.textContent = `За курсом НБУ буде перераховано у USD для довідки.`;

      // % податків від доходу
       const percent = r.incomeUAH > 0 ? (r.totalUAH / r.incomeUAH * 100) : 0;
    document.getElementById('taxPercent').textContent = percent.toFixed(1) + '%';

    // «чистими» після податків
    const net = Math.max(0, r.incomeUAH - r.totalUAH);
    setMoney(document.getElementById('netSalary'), net, 'UAH');


      if(r.totalUSD!=null){
        setMoney(totalUSDEl, r.totalUSD,  'USD');
        usdNoteEl.textContent  = `Курс: ${r.usdRate?.toFixed(3)} UAH за 1 USD (НБУ)`;
      }else{
        totalUSDEl.textContent='—';
        usdNoteEl.textContent = `Немає курсу — перевір підключення.`;
      }
      renderSumChip();
    }

    // === Events ===
    [
      groupEl, periodEl, incomeUAHEl, incomeCurrencyEl, epModeEl, epValueEl,
      minWageUAHEl, monthsCountEl, otherPercentEl, otherFixedEl, feesUAHEl,
      militaryTaxEl, militaryBaseEl
    ].forEach(el => el.addEventListener('input', recalc));

    recalcBtn.addEventListener('click', recalc);
    resetBtn.addEventListener('click', ()=>{
      groupEl.value='3';
      periodEl.value='month';
      incomeUAHEl.value=100000;
      incomeCurrencyEl.value='UAH';
      epModeEl.value='percent';
      epValueEl.value=5;
      minWageUAHEl.value = 8000;
      monthsCountEl.value=1;
      otherPercentEl.value=0;
      otherFixedEl.value=0;
      feesUAHEl.value=0;
      militaryTaxEl.value=1;
      militaryBaseEl.value='';

      useMonthlyEl.checked=false;
      monthlyCurrencyEl.value='UAH';
      salaries = [];
      idSeq = 1;
      renderMonths();

      userEditedMonths=false;
      recalc();
    });

    useMonthlyEl.addEventListener('change', ()=>{
      toggleMonthlyUI();
      if(useMonthlyEl.checked && salaries.length===0) addSalary('');
      recalc();
    });
    addMonthBtn.addEventListener('click', ()=> addSalary(''));
    clearMonthsBtn.addEventListener('click', ()=>{
      salaries = [];
      renderMonths();
      recalc();
    });
    monthlyCurrencyEl.addEventListener('change', ()=>{
      renderSumChip();
      recalc();
    });

    renderMonths();
    toggleMonthlyUI();
    loadRates();