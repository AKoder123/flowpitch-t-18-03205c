(() => {
  const qs = (sel, ctx=document) => ctx.querySelector(sel);
  const qsa = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

  let slides = [];
  let currentIndex = 0;
  let io = null;

  document.addEventListener('DOMContentLoaded', () => {
    setupTopOffset();
    loadContent();
    bindGlobalKeys();
    setupRetry();
    setupResizeHandlers();
  });

  function setupRetry(){
    const btn = qs('#retryBtn');
    if(btn){ btn.addEventListener('click', () => { hideError(); loadContent(true); }); }
  }

  function setDeckTitle(txt){
    const nt = qs('#navDeckTitle');
    if(nt){ nt.textContent = txt || 'Deck'; }
    if(txt){ document.title = txt + ' — FlowPitch'; }
  }

  function setupTopOffset(){
    const nav = qs('#topnav');
    const apply = () => {
      const h = nav ? nav.getBoundingClientRect().height : 64;
      document.documentElement.style.setProperty('--topOffset', h + 'px');
    };
    apply();
    if(nav && 'ResizeObserver' in window){
      const ro = new ResizeObserver(() => apply());
      ro.observe(nav);
    } else {
      window.addEventListener('resize', apply, { passive: true });
    }
  }

  async function loadContent(cacheBust){
    const deck = qs('#deck');
    if(!deck) return;
    qs('#loadingState')?.classList.remove('hidden');
    hideError();
    try {
      const res = await fetch('./content.json?ts=' + Date.now(), { cache: 'no-store' });
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      renderDeck(data);
      setupObserver();
      setupPdfExport();
    } catch (err){
      console.error(err);
      showError('Could not load content.json. ' + (err?.message || ''));
    } finally {
      qs('#loadingState')?.classList.add('hidden');
    }
  }

  function showError(msg){
    const panel = qs('#errorPanel');
    if(panel){
      panel.hidden = false;
      const p = qs('.error-msg', panel);
      if(p) p.textContent = msg;
    }
  }
  function hideError(){ const panel = qs('#errorPanel'); if(panel) panel.hidden = true; }

  function renderDeck(data){
    try {
      const deck = qs('#deck');
      if(!deck) return;
      deck.innerHTML = '';
      const theme = (data?.meta?.theme || 'blue').toLowerCase();
      document.body.classList.remove('theme-blue','theme-purple','theme-green');
      document.body.classList.add('theme-' + theme);
      setDeckTitle(data?.meta?.title || 'Deck');

      slides = (data?.slides || []).map((s, idx) => createSlide(s, idx)).filter(Boolean);
      slides.forEach(sl => deck.appendChild(sl));
      currentIndex = 0;
      if(slides[0]) slides[0].classList.add('is-active');

      // Update progress
      updateProgress();
    } catch(e){
      console.error('Render error', e);
      showError('Render error: ' + (e?.message||''));
    }
  }

  function createSlide(s, idx){
    const sec = document.createElement('section');
    const type = s.type || 'content';
    sec.className = `slide type-${type}`;

    const frame = document.createElement('div');
    frame.className = 'frame';

    const dots = document.createElement('div');
    dots.className = 'window-dots';
    dots.innerHTML = '<i></i><i></i><i></i>';
    frame.appendChild(dots);

    let i = 0; // for stagger
    const pushAnim = (el) => { el.setAttribute('data-animate',''); el.style.setProperty('--i', String(i++)); };

    const hgroup = document.createElement('div');
    hgroup.className = 'hgroup';

    if(type === 'title'){
      if(s.headline){ const h = document.createElement('h1'); h.className = 'title grad'; h.textContent = s.headline; pushAnim(h); hgroup.appendChild(h); }
      if(s.subheadline){ const p = document.createElement('p'); p.className = 'sub'; p.textContent = s.subheadline; pushAnim(p); hgroup.appendChild(p); }
      frame.appendChild(hgroup);
    } else if(type === 'closing'){
      if(s.headline){ const h = document.createElement('h1'); h.className = 'title grad'; h.textContent = s.headline; pushAnim(h); hgroup.appendChild(h); }
      if(s.subheadline){ const p = document.createElement('p'); p.className = 'sub'; p.textContent = s.subheadline; pushAnim(p); hgroup.appendChild(p); }
      frame.appendChild(hgroup);
    } else if(type === 'section'){
      if(s.headline){ const h = document.createElement('h2'); h.className = 'h2 grad'; h.textContent = s.headline; pushAnim(h); hgroup.appendChild(h); }
      if(s.subheadline){ const p = document.createElement('p'); p.className = 'h3'; p.textContent = s.subheadline; pushAnim(p); hgroup.appendChild(p); }
      frame.appendChild(hgroup);
    } else {
      if(s.headline){ const h = document.createElement('h2'); h.className = 'h2 grad'; h.textContent = s.headline; pushAnim(h); hgroup.appendChild(h); }
      if(s.subheadline){ const p = document.createElement('p'); p.className = 'h3'; p.textContent = s.subheadline; pushAnim(p); hgroup.appendChild(p); }
      if(hgroup.children.length) frame.appendChild(hgroup);
    }

    // Content blocks
    if(s.left || s.right){
      const cols = document.createElement('div'); cols.className = 'cols';
      if(s.left){ cols.appendChild(buildColumn(s.left, pushAnim)); }
      if(s.right){ cols.appendChild(buildColumn(s.right, pushAnim)); }
      frame.appendChild(cols);
    } else if(Array.isArray(s.bullets)){
      const ul = buildBullets(s.bullets, pushAnim);
      frame.appendChild(ul);
    }

    sec.appendChild(frame);
    return sec;
  }

  function buildColumn(col, pushAnim){
    const wrap = document.createElement('div'); wrap.className = 'stack';
    if(col.title){ const t = document.createElement('div'); t.className = 'kicker'; t.textContent = col.title; pushAnim(t); wrap.appendChild(t); }
    if(Array.isArray(col.bullets)) wrap.appendChild(buildBullets(col.bullets, pushAnim));
    return wrap;
  }

  function buildBullets(list, pushAnim){
    const ul = document.createElement('ul'); ul.className = 'bullets';
    list.slice(0, 6).forEach((b, j) => { const li = document.createElement('li'); li.textContent = b; pushAnim(li); ul.appendChild(li); });
    return ul;
  }

  function setupObserver(){
    if(io) { try { io.disconnect(); } catch(_){} }
    const deck = qs('#deck');
    if(!deck) return;
    io = new IntersectionObserver((entries) => {
      entries.forEach(ent => {
        if(ent.isIntersecting){ ent.target.classList.add('is-active'); currentIndex = slides.indexOf(ent.target); updateProgress(); }
      });
    }, { root: deck, threshold: 0.6 });
    slides.forEach(sl => io.observe(sl));
  }

  function updateProgress(){
    const bar = qs('#progressBar');
    if(!bar || !slides || slides.length === 0) return;
    const pct = ((currentIndex + 1) / slides.length) * 100;
    bar.style.height = pct + '%';
  }

  function bindGlobalKeys(){
    window.addEventListener('keydown', (e) => {
      const tag = (e.target && (e.target.tagName || '')).toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable);
      if(isTyping) return;

      if(e.key === ' '){ e.preventDefault(); e.shiftKey ? prev() : next(); }
      else if(e.key === 'ArrowRight' || e.key === 'PageDown'){ e.preventDefault(); next(); }
      else if(e.key === 'ArrowLeft' || e.key === 'PageUp'){ e.preventDefault(); prev(); }
      else if(e.key === 'Home'){ e.preventDefault(); goTo(0); }
      else if(e.key === 'End'){ e.preventDefault(); goTo(slides.length - 1); }
    });
  }

  function next(){ goTo(currentIndex + 1); }
  function prev(){ goTo(currentIndex - 1); }
  function goTo(i){
    if(!slides || slides.length === 0) return;
    const deck = qs('#deck'); if(!deck) return;
    const clamped = Math.max(0, Math.min(i, slides.length - 1));
    const target = slides[clamped];
    if(target){ target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }

  function setupResizeHandlers(){
    let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { setupTopOffset(); }, 60); }, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(setupTopOffset, 250));
  }

  // PDF Export
  function setupPdfExport(){
    const btn = qs('#exportPdfBtn'); if(!btn) return;
    btn.addEventListener('click', async () => {
      try {
        btn.disabled = true; const original = btn.textContent; btn.textContent = 'Exporting…'; document.body.classList.add('exportingPdf');
        // Ensure all slides are considered active
        slides.forEach(sl => sl.classList.add('is-active'));

        await ensureLibs();
        const { jsPDF } = window.jspdf || {};
        if(!window.html2canvas || !jsPDF) throw new Error('Libraries not available');

        const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1920, 1080], compress: true });
        const stage = buildPdfStage();
        const scale = Math.max(2, Math.floor(window.devicePixelRatio || 1));

        for(let i=0; i<slides.length; i++){
          await placeSlideOnStage(stage, slides[i]);
          const canvas = await window.html2canvas(stage, { backgroundColor: null, scale, useCORS: true, logging: false, windowWidth: 1920, windowHeight: 1080 });
          const img = canvas.toDataURL('image/png', 1.0);
          if(i>0) pdf.addPage([1920,1080], 'landscape');
          pdf.addImage(img, 'PNG', 0, 0, 1920, 1080, undefined, 'FAST');
        }

        pdf.save('FlowPitch.pdf');
        cleanupStage(stage);
        document.body.classList.remove('exportingPdf');
        btn.textContent = original; btn.disabled = false;
      } catch(err){
        console.error(err);
        alert('PDF export failed. Please allow cdnjs.cloudflare.com or self-host the libraries.');
        document.body.classList.remove('exportingPdf');
        const btn = qs('#exportPdfBtn'); if(btn){ btn.disabled = false; btn.textContent = 'Export PDF'; }
      }
    });
  }

  function buildPdfStage(){
    // Remove existing
    const prev = qs('#pdfStage'); if(prev) prev.remove();
    const stage = document.createElement('div'); stage.id = 'pdfStage';
    // Clone bg layers (without nav)
    const bg = qs('#bg'); if(bg) stage.appendChild(bg.cloneNode(true));
    // Add a container to hold the slide
    const holder = document.createElement('div'); holder.className = 'stage-holder'; stage.appendChild(holder);
    document.body.appendChild(stage);
    return stage;
  }

  function cleanupStage(stage){ if(stage && stage.parentNode){ stage.parentNode.removeChild(stage); } }

  async function placeSlideOnStage(stage, slideEl){
    const holder = stage.querySelector('.stage-holder') || stage;
    holder.innerHTML = '';
    const clone = slideEl.cloneNode(true);
    clone.classList.add('is-active');
    holder.appendChild(clone);
    // Allow layout to settle
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  function loadScript(src){
    return new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = () => resolve(); s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  async function ensureLibs(){
    const needH2C = !window.html2canvas;
    const needPDF = !(window.jspdf && window.jspdf.jsPDF);
    if(!needH2C && !needPDF) return;
    const tasks = [];
    if(needH2C) tasks.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'));
    if(needPDF) tasks.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'));
    await Promise.all(tasks);
  }
})();
