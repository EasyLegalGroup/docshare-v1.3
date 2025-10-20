/* ------------------------------------------------------------------
   Konfiguration & helpers
------------------------------------------------------------------ */
const API  = 'https://ysu7eo2haj.execute-api.eu-north-1.amazonaws.com/prod';
const OTP_VERIFY = `${API}/otp-verify`,
      OTP_SEND   = `${API}/otp-send`,
      DOC_LIST   = `${API}/doc-list`,
      DOC_URL    = `${API}/doc-url`,
      APPROVE_URL= `${API}/approve`,
      CHAT_LIST  = `${API}/chat/list`,
      CHAT_SEND  = `${API}/chat/send`;

/* Default intro video (used if brand/video param not set) */
const DEFAULT_VIDEO_URL = 'https://www.youtube.com/embed/a5DPLsmaltE?rel=0';

/* Ensure YouTube embed won’t jump to “Up Next”
   - loops the same video
   - adds modest branding & playsinline
*/
function ytUrlWithSafeParams(url){
  try{
    const u = new URL(url);
    let id = '';
    if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
    else if (u.pathname.startsWith('/embed/')) id = u.pathname.split('/embed/')[1];
    else id = u.searchParams.get('v') || '';

    if (id){
      u.searchParams.set('rel','0');
      u.searchParams.set('modestbranding','1');
      u.searchParams.set('playsinline','1');
      u.searchParams.set('autoplay','0');
      u.searchParams.set('loop','0');
      u.searchParams.delete('playlist');
    }
    return u.toString();
  }catch(_){ return url; }
}

const qs          = new URLSearchParams(location.search),
      externalId  = qs.get('e') || '',
      accessToken = qs.get('t') || '';

/* Allow ?video= override, else take brand video, else fallback */
const VIDEO_URL  = qs.get('video') || (window.__BRAND && window.__BRAND.video) || DEFAULT_VIDEO_URL;
const SHOW_INTRO = (window.__BRAND && window.__BRAND.showVideo) !== false; // default true unless brand says false

/* Central flag to control FAQ visibility (SE hides by default; ?faq=1 to re-enable) */
const SHOW_FAQ = (window.__BRAND && typeof window.__BRAND.showFAQ !== 'undefined')
  ? !!window.__BRAND.showFAQ
  : true;

const $    = id => document.getElementById(id),
      show = el => el && el.classList.remove('hidden'),
      hide = el => el && el.classList.add('hidden'),
      setMsg = t => $('msg').textContent = t || '',
      spin   = on => $('loadingOverlay').classList.toggle('hidden', !on);

/* Toggle this to re-enable/disable "Godkend alle" visibility */
const SHOW_APPROVE_ALL = false;

/* Track if the user has manually opened chat at least once (not via tour) */
const CHAT_SEEN_KEY = 'dfj_chat_opened';
function hasSeenLabel(){
  try { return localStorage.getItem(CHAT_SEEN_KEY) === '1'; } catch(e){ return false; }
}

let docs = [], active = 0, completionShown = false, currentPresigned = '';
let shouldStartTour = false, tourActive = false;

/* ----------------------------------------------------------
   i18n – udfyld alle data-attributter
   (PLUS: enhance FAQ → convert .faq-blocks to nested <details>)
   (PLUS: enhance SE Post-Approval list into same nested accordions)
---------------------------------------------------------- */
(function applyTexts(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    el.textContent = _t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el=>{
    el.innerHTML = _t(el.dataset.i18nHtml);
  });
  $('chatEditor').setAttribute('placeholder', _t('CHAT_PLACEHOLDER'));

  enhanceFaqNestedAccordions();       // build nested Q&A accordions
  enhancePostApprovalAccordions();    // build nested accordions for SE completion modal
})();

/* Shared builder: turn an array of .faq-block elements into one <Fragment> of <details.faq-item> */
function buildDetailsFromBlocks(blocks){
  const frag = document.createDocumentFragment();
  blocks.forEach(block=>{
    const clone = block.cloneNode(true);
    const titleEl = clone.querySelector('h4,h3,h5,h2,.q,[data-q]');
    const title = titleEl ? titleEl.textContent.trim() : '…';
    if (titleEl) titleEl.remove();

    const details = document.createElement('details');
    details.className = 'faq-item';

    const summary = document.createElement('summary');
    summary.textContent = title;
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'faq-item-body';
    Array.from(clone.childNodes).forEach(n=>body.appendChild(n));
    details.appendChild(body);

    frag.appendChild(details);
  });
  return frag;
}

/* Turn each .faq-block inside each top-level FAQ section into a <details> accordion */
function enhanceFaqNestedAccordions(){
  try{
    document.querySelectorAll('#faqModal .acc-content').forEach(section=>{
      const blocks = Array.from(section.querySelectorAll('.faq-block'));
      if (!blocks.length) return;

      const frag = buildDetailsFromBlocks(blocks);
      section.innerHTML = '';
      section.appendChild(frag);
    });
  }catch(_){}
}

/* For Swedish Post-Approval modal → use same nested accordions as FAQ */
function enhancePostApprovalAccordions(){
  try{
    // Only for Swedish locale
    const lang = (window.__BRAND && window.__BRAND.lang) || (document.documentElement && document.documentElement.lang) || 'da';
    if (lang !== 'sv') return;

    const container = document.querySelector('#completionModal [data-i18n-html="POST_APPROVAL_P1"]');
    if (!container) return;

    // Idempotent: if we've already built details, skip
    if (container.querySelector('details.faq-item')) return;

    const nodes  = Array.from(container.childNodes);
    const blocks = nodes.filter(n => n.nodeType === 1 && n.classList.contains('faq-block'));
    if (!blocks.length) return;

    // Preserve non-block nodes (intro paragraphs etc.)
    const others = nodes.filter(n => !(n.nodeType === 1 && n.classList.contains('faq-block')));

    const frag = document.createDocumentFragment();
    others.forEach(n => frag.appendChild(n));              // keep intro text as-is
    frag.appendChild(buildDetailsFromBlocks(blocks));      // then add accordions

    container.innerHTML = '';
    container.appendChild(frag);
  }catch(_){}
}

/* ----------------------------------------------------------
   Sidebar toggle (hamburger)
---------------------------------------------------------- */
const menuBtn = $('menuBtn');
if (menuBtn) menuBtn.onclick = () => $('sidebar').classList.toggle('open');
function maybeCloseSidebar(){
  if (window.innerWidth <= 1024) $('sidebar').classList.remove('open');
}

/* ----------------------------------------------------------
   Intro / Welcome modal
---------------------------------------------------------- */
function openIntro(){
  // Only load a video for brands that allow it
  if (SHOW_INTRO) {
    $('videoFrame').src = ytUrlWithSafeParams(VIDEO_URL); // brand-aware video with safe params
  } else {
    $('videoFrame').src = '';
  }
  show($('introModal'));
  const introBox = document.querySelector('#introModal .modal');
  if (introBox) introBox.scrollTop = 0; // keep scrolled to top
}

function closeIntro(){
  const frame = $('videoFrame');
  if (frame) frame.src = '';            // stop playback
  hide($('introModal'));
  // Start the tour after closing, only when we planned to and it's not running
  if (shouldStartTour && !tourActive) startTour();
}

// Bind open/close handlers (defensive if elements are missing)
const introBtn = $('introBtn');
if (introBtn) introBtn.onclick = openIntro;

const introX = $('introCloseBtn');
if (introX) introX.onclick = closeIntro;

const introOkay = $('introOkayBtn');
if (introOkay) introOkay.onclick = closeIntro;

// Click outside the modal body closes it
const introOverlay = $('introModal');
if (introOverlay) {
  introOverlay.onclick = (e)=>{ if(e.target && e.target.id === 'introModal') closeIntro(); };
}

// Esc closes it while open
window.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && !$('introModal').classList.contains('hidden')) closeIntro(); });

// For SE/IE (SHOW_INTRO=false): keep the Welcome modal button visible, but hide the video area
if (!SHOW_INTRO) {
  const vw = document.querySelector('.video-wrapper');
  if (vw) vw.classList.add('hidden');
}

/* ----------------------------------------------------------
   FAQ modal (hide button if SHOW_FAQ=false)
---------------------------------------------------------- */
function openFAQ(){
  // idempotent: safe to call multiple times
  enhanceFaqNestedAccordions();
  show($('faqModal'));
}
function closeFAQ(){ hide($('faqModal')); }

// Bind + show/hide the button based on flag
(function initFaqButton(){
  const btn = $('faqBtn');
  if (!btn) return;
  if (SHOW_FAQ) {
    btn.classList.remove('hidden');
    btn.onclick = openFAQ;
  } else {
    btn.classList.add('hidden');
    btn.onclick = null;
  }
})();
$('faqCloseBtn').onclick = closeFAQ;
$('faqOkayBtn').onclick  = closeFAQ;
$('faqModal').onclick    = e=>{ if(e.target.id==='faqModal') closeFAQ(); };

/* accordion toggle */
document.querySelectorAll('.acc-header').forEach(btn=>{
  btn.onclick = ()=>{
    btn.classList.toggle('open');
    const c = btn.nextElementSibling;
    if(c) c.classList.toggle('hidden');
  };
});

/* ----------------------------------------------------------
   Completion modal
---------------------------------------------------------- */
function openCompletion(){
  // Ensure Swedish post-approval body is upgraded to accordions before show
  enhancePostApprovalAccordions();
  show($('completionModal'));
}
function closeCompletion(){ hide($('completionModal')); }
$('completionCloseBtn').onclick = closeCompletion;
$('completionOkayBtn').onclick  = closeCompletion;
$('completionModal').onclick    = e=>{ if(e.target.id==='completionModal') closeCompletion(); };

/* Extra: reopen-completion button */
$('viewCompletionBtn').onclick = openCompletion;

/* ----------------------------------------------------------
   OTP logic
---------------------------------------------------------- */
async function verifyOtp(code){
  const r = await fetch(OTP_VERIFY,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({externalId,otp:code})
  });
  const j = await r.json().catch(()=>({}));
  if(!r.ok||!j.ok) throw Error(j.error||'Invalid code');
}
async function resendOtp(){
  const r = await fetch(OTP_SEND,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({externalId})
  });
  const j = await r.json().catch(()=>({}));
  if(!r.ok||!j.ok) throw Error(j.error||'Could not resend');
}

function startOtpCooldown(seconds = 10){
  const btn   = $('sendCodeBtn');
  const label = _t('OTP_RESEND_BTN');
  btn.textContent = `${label} (${seconds})`;
  let left = seconds;
  const tick = setInterval(()=>{
    btn.textContent = `${label} (${--left})`;
    if(left < 0){
      clearInterval(tick);
      btn.disabled   = false;
      btn.textContent = label;
    }
  }, 1000);
}

/* ----------------------------------------------------------
   Document helpers
---------------------------------------------------------- */
async function fetchDocs(){
  const r = await fetch(DOC_LIST,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({externalId,accessToken})
  });
  const j = await r.json().catch(()=>({}));
  if(!r.ok||!j.ok) throw Error('List failed');
  docs = (j.documents||[]).filter(d=>d.isNewestVersion);
  if(!docs.length) throw Error('No newest-version documents found');
}
async function presign(id){
  const r = await fetch(DOC_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({externalId,accessToken,docId:id})
  });
  const j = await r.json().catch(()=>({}));
  if(!r.ok||!j.ok) throw Error('Presign failed');
  return j.url;
}

/* ----------------------------------------------------------
   Sidebar render (with empty states)
   (NEW) Adds a small document-type chip under the title if present
---------------------------------------------------------- */
function renderLists(){
  const pending  = docs.filter(d=>d.status!=='Approved'),
        approved = docs.filter(d=>d.status==='Approved');

  $('pendingCount').textContent  = pending.length;
  $('approvedCount').textContent = approved.length;

  const render = (el,list,emptyKey)=>{
    el.innerHTML='';
    if(!list.length){
      const p=document.createElement('div');
      p.className='doc-empty';
      p.textContent=_t(emptyKey);
      el.appendChild(p);
      return;
    }
    list.forEach(doc=>{
      const div=document.createElement('div');
      div.className='doc-item'+
                    (doc.status==='Approved'?' approved':'')+
                    (doc===docs[active]?' active':'');

      // Title
      const title=document.createElement('div');
      title.className='doc-title';
      title.textContent=doc.name||doc.fileName||doc.filename||doc.key||'Document';
      div.appendChild(title);

      // Optional document type badge
      if (doc.documentType){
        const badge=document.createElement('span');
        badge.className='doc-type-badge';
        badge.textContent=doc.documentType;
        div.appendChild(badge);
      }

      div.onclick=()=>{
        maybeCloseSidebar();
        active=docs.indexOf(doc);
        renderLists();
        loadCurrent();
        if (tourActive && tour.state === 'waitForDocClick') tour.next(); // advance tour when user clicks a doc
      };
      el.appendChild(div);
    });
  };
  render($('pendingList'),pending,'PENDING_EMPTY');
  render($('approvedList'),approved,'APPROVED_EMPTY');

  // hide Approve All unless explicitly enabled
  $('approveAllBtn').classList.toggle('hidden', !SHOW_APPROVE_ALL || !pending.length);
}

/* ----------------------------------------------------------
   Viewer
---------------------------------------------------------- */
async function loadCurrent(){
  try{
    setMsg('Indlæser…'); $('pdf').src=''; spin(true);
    currentPresigned = await presign(docs[active].id);
    $('pdf').src=currentPresigned+'#toolbar=0&zoom=150';
    setMsg('');

    // Optimistic local flip Sent -> Viewed after opening
    try{
      if(docs[active].status === 'Sent'){
        docs[active].status = 'Viewed';
        renderLists(); // reflect immediately in sidebar
      }
    }catch(_){}

  }catch(e){ setMsg(e.message);}finally{ spin(false); }

  const doc   = docs[active],
        allOk = docs.every(d=>d.status==='Approved'),
        curOk = doc.status==='Approved';

  // Full headline text when all approved
  $('headerText').textContent = allOk ? _t('HEADER_ALL_OK') : _t('HEADER_PENDING');

  $('viewCompletionBtn').classList.toggle('hidden', !allOk);

  // Always show approval row; adjust content based on status
  const name = doc.name||doc.fileName||doc.filename||doc.key||'Document';
  show($('approveRow'));
  if (curOk){
    $('approveBtn').textContent = `${name} er godkendt`;
    $('approveBtn').disabled = true;
    $('approveMsg').textContent = '';
  }else{
    $('approveBtn').textContent = `${_t('APPROVE_PREFIX')} ${name}`;
    $('approveBtn').disabled = false;
    $('approveMsg').textContent = '';
  }

  if(allOk && !completionShown){
    completionShown = true;
    openCompletion();
  }
}

/* ----------------------------------------------------------
   Approval modal
---------------------------------------------------------- */
let modalResolve=null;
function openApproval(ids){
  const many=ids.length>1,
        docsToShow=docs.filter(d=>ids.includes(d.id)),
        list=many?`<ul>${docsToShow.map(d=>`<li>${d.name||d.fileName||d.filename||d.key||'Document'}</li>`).join('')}</ul>`:'';

  $('confirmText').innerHTML = many
    ? `${_t('MODAL_APPROVE_ALL_TXT')} ${list}`
    : `${_t('MODAL_APPROVE_TXT')} <strong>${docsToShow[0].name||docsToShow[0].fileName||docsToShow[0].filename||docsToShow[0].key||'document'}</strong>.`;
  $('confirmApprove').textContent = many?_t('MODAL_APPROVE_ALL'):_t('MODAL_APPROVE');
  show($('confirmModal'));
  return new Promise(res=>{modalResolve=res;});
}
$('confirmCancel' ).onclick=()=>{hide($('confirmModal'));modalResolve(false);};
$('confirmCancel2').onclick=()=>{hide($('confirmModal'));modalResolve(false);};
$('confirmApprove').onclick=()=>{hide($('confirmModal'));modalResolve(true);};

async function tryApprove(ids){
  if(!await openApproval(ids)) return;
  $('approveMsg').textContent='Sender…';
  const r=await fetch(APPROVE_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({externalId,accessToken,docIds:ids})
  });
  const ok=r.ok&&(await r.json().catch(()=>({}))).ok;
  if(ok){
    ids.forEach(id=>{const d=docs.find(x=>x.id===id); if(d) d.status='Approved';});
    renderLists();await loadCurrent();
    $('approveMsg').textContent='Tak for din godkendelse ✔';
  }else{ $('approveMsg').textContent='Noget gik galt…'; }
}

/* ----------------------------------------------------------
   Download / Print current PDF
---------------------------------------------------------- */
$('downloadBtn').onclick = async ()=>{
  try{
    const a=document.createElement('a');
    a.href=currentPresigned;
    a.download='document.pdf';
    a.target='_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }catch(e){ console.error(e); }
};

$('printBtn').onclick = async () => {
  try {
    // 1) Fetch PDF as a blob (requires S3 CORS GET allowed)
    const res  = await fetch(currentPresigned, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error('PDF fetch failed');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);

    // 2) Hidden iframe for printing (no redirect)
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';

    // Cleanup only AFTER printing is done (or after a long fallback)
    const cleanup = () => {
      try { URL.revokeObjectURL(url); } catch {}
      try { frame.remove(); } catch {}
    };

    frame.onload = () => {
      const cw = frame.contentWindow;
      if (!cw) return cleanup();

      // Prefer cleanup on the actual print lifecycle end
      const cleanOnce = () => {
        cw.removeEventListener('afterprint', cleanOnce);
        window.removeEventListener('afterprint', cleanOnce);
        // small delay to allow dialog to fully close
        setTimeout(cleanup, 1000);
      };
      cw.addEventListener('afterprint', cleanOnce, { once: true });
      // Some Chrome builds only fire on the top window:
      window.addEventListener('afterprint', cleanOnce, { once: true });

      // Open the print dialog (synchronously in this handler)
      try { cw.focus(); } catch {}
      cw.print();

      // Fallback if afterprint never fires: clean up after 2 minutes
      setTimeout(cleanOnce, 120000);
    };

    frame.src = url;
    document.body.appendChild(frame);
  } catch (_) {
    // Last resort: try the visible viewer (may no-op on some Chrome builds)
    try { $('pdf')?.contentWindow?.print?.(); } catch {}
  }
};

/* ----------------------------------------------------------
   Chat (hidden pre-OTP; attention label until user opens)
---------------------------------------------------------- */
const chatSeen=new Set(),chatCache=[];
function renderChat(){
  const box=$('chatList');
  if(!chatCache.length){
    box.textContent=_t('CHAT_NO_MESSAGES');
    return;
  }
  box.innerHTML='';
  chatCache.forEach(m=>{
    const wrap=document.createElement('div'), ts=document.createElement('div'), row=document.createElement('div');
    wrap.className=(m.inbound||m.Is_Inbound__c)?'me':'them';
    ts.className='chat-ts'; ts.textContent=new Date(m.at||m.createdDate||Date.now()).toLocaleString();
    row.className='chat-row'; row.innerHTML=m.body;
    wrap.appendChild(row); box.appendChild(ts); box.appendChild(wrap);
  });
  box.scrollTop=box.scrollHeight;
}
async function fetchChat(){
  const u=new URL(CHAT_LIST); u.searchParams.set('e',externalId); u.searchParams.set('t',accessToken);
  const r=await fetch(u), j=await r.json().catch(()=>({})); if(!r.ok||!j.ok) return;
  j.messages.forEach(m=>{if(chatSeen.has(m.id))return; chatSeen.add(m.id); chatCache.push(m);});
  renderChat();
}
async function sendChat(){
  const ed=$('chatEditor'), html=ed.innerHTML.trim(); if(!html) return;
  ed.setAttribute('contenteditable','false'); ed.textContent='Sender…';
  await fetch(CHAT_SEND,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({externalId,accessToken,body:html})
  });
  ed.setAttribute('contenteditable','true'); ed.innerHTML=''; fetchChat();
}
document.querySelectorAll('.chat-tools button').forEach(b=>b.onclick=()=>document.execCommand(b.dataset.cmd,false));

function openChatPanel(source='user'){
  // make panel visible
  $('chatPanel').style.display='flex';
  $('chatPanel').classList.remove('hidden');
  $('chatHeader').textContent = _t('CHAT_HEADER_OPEN');

  // hide attention label while open
  $('chatLabel').style.display='none';
  $('chatLabel').classList.add('hidden');

  fetchChat();

  // only mark as seen when user opens (not the tour)
  if (source === 'user') {
    try { localStorage.setItem(CHAT_SEEN_KEY,'1'); } catch(e){}
  }
}
function closeChatPanel(){
  $('chatPanel').style.display='none';
  $('chatPanel').classList.add('hidden');
  $('chatHeader').textContent = _t('CHAT_HEADER');

  // If user hasn't opened chat before, show the label again
  if (!hasSeenLabel()){
    $('chatLabel').classList.remove('hidden');
    $('chatLabel').style.display='block';
    positionChatLabel();
  } else {
    $('chatLabel').style.display='none';
    $('chatLabel').classList.add('hidden');
  }
}

$('chatFab').onclick=()=>{
  if($('chatPanel').style.display==='flex'){ closeChatPanel(); }
  else{ openChatPanel('user'); } // mark as seen
};
$('chatHeader').onclick=()=>{
  // allow closing chat by clicking the blue header
  if($('chatPanel').style.display==='flex'){ closeChatPanel(); }
};
$('chatLabel').onclick = () => openChatPanel('user'); // clicking the label opens chat

$('chatSend').onclick=sendChat;
$('chatEditor').addEventListener('keydown',e=>{ if(e.key==='Enter'&&e.ctrlKey) sendChat(); });

/* Dynamic position for chat label to be vertically centered left of FAB */
function positionChatLabel(){
  const fab=$('chatFab'), label=$('chatLabel');
  if (!fab || !label) return;
  if (label.classList.contains('hidden')) return;

  const fr = fab.getBoundingClientRect();

  // Temporarily ensure it's displayed for measurement
  const prevDisplay = label.style.display;
  if (prevDisplay === 'none') label.style.display = 'block';

  const lr = label.getBoundingClientRect();
  label.style.left = (fr.left - lr.width - 12) + 'px';
  label.style.top  = (fr.top + (fr.height - lr.height)/2) + 'px';

  label.style.display = prevDisplay;
}
window.addEventListener('resize', positionChatLabel);
window.addEventListener('scroll', positionChatLabel);

/* ----------------------------------------------------------
   In-app guidance tour
   (Chat opens at start, stays open during tour, closes when finished)
   - Added FAQ step (3rd) — but only if SHOW_FAQ = true
   - Styled buttons: Done = green-ish, Close = red-ish
---------------------------------------------------------- */
const tour = {
  idx: 0,
  state: '',
  steps: (function buildSteps(){
    const arr = [
      { key:'SIDEBAR',   target:'#sidebar',   textKey:'TOUR_STEP_SIDEBAR', advanceOn:'docClick' }, // 1
      { key:'PDF',       target:'#pdf',       textKey:'TOUR_STEP_PDF' }                            // 2
    ];
    if (SHOW_FAQ) {
      arr.push({ key:'FAQ', target:'#faqBtn', textKey:'TOUR_STEP_FAQ' });                          // 3 (conditional)
    }
    arr.push(
      // 4
      { key:'CHAT',      target:'#chatPanel', textKey:'TOUR_STEP_CHAT', openChat:true, leftOf:true, nudgeX:-100 },
      // 5
      { key:'APPROVE',   target:'#approveBtn', textKey:'TOUR_STEP_APPROVE', showApprove:true, leftOf:true, nudgeY:-120 },
      // 6
      { key:'DOWNLOAD',  target:['#printBtn','#downloadBtn'], textKey:'TOUR_STEP_DOWNLOAD', below:true, wide:true }
    );
    return arr;
  })(),
  start(){
    tourActive = true;

    // Open chat at the very start (tour-driven, not user)
    openChatPanel('tour');

    // Style buttons: Done (green-ish), Close (red-ish)
    (function styleGuideButtons(){
      const done  = $('tourDoneBtn');
      const close = $('tourCloseBtn');
      if (done){
        // make it look like a green primary
        done.classList.remove('ghost');
        done.classList.add('primary');
        done.style.background = 'var(--ok)';
        done.style.border     = '1px solid var(--ok)';
        done.style.color      = '#fff';
      }
      if (close){
        // red-ish ghost
        close.classList.remove('primary');
        close.classList.add('ghost');
        close.style.background = '#fee2e2';
        close.style.border     = '1px solid #fecaca';
        close.style.color      = '#991b1b';
      }
    })();

    show($('tourDim')); show($('tourRing')); show($('tourTip'));
    this.idx = 0;
    this.showStep();
  },
  end(){
    tourActive = false;
    this.state = '';
    hide($('tourDim')); hide($('tourRing')); hide($('tourTip'));

    // Close chat when the tour ends
    closeChatPanel();

    // restore approve row to correct state
    loadCurrent();
  },
  showStep(){
    const s = this.steps[this.idx];
    if(!s) return this.end();

    // Keep chat open if step requests it (idempotent)
    if(s.openChat){ openChatPanel('tour'); }

    // ensure Approve row shows correctly when guide highlights it
    if (s.showApprove){
      const doc = docs[active];
      const name = (doc.name||doc.fileName||doc.filename||doc.key||'Document');
      show($('approveRow'));
      if (doc.status === 'Approved'){
        $('approveBtn').textContent = `${name} er godkendt`;
        $('approveBtn').disabled = true;
      }else{
        $('approveBtn').textContent = `${_t('APPROVE_PREFIX')} ${name}`;
        $('approveBtn').disabled = false;
      }
    }

    const targets = Array.isArray(s.target) ? s.target : [s.target];
    const els = targets.map(t => document.querySelector(t)).filter(Boolean);
    if(!els.length){ this.next(); return; }

    // Aggregate a rectangle that covers all targets
    const pad = 8;
    const rects = els.map(el => el.getBoundingClientRect());
    const agg = rects.reduce((a,r)=>({
      left: Math.min(a.left, r.left),
      top: Math.min(a.top, r.top),
      right: Math.max(a.right, r.right),
      bottom: Math.max(a.bottom, r.bottom)
    }), {left:Infinity, top:Infinity, right:-Infinity, bottom:-Infinity});
    const r = {
      left: agg.left,
      top: agg.top,
      right: agg.right,
      bottom: agg.bottom,
      width: agg.right - agg.left,
      height: agg.bottom - agg.top
    };

    // position ring
    const ring = $('tourRing');
    ring.style.left   = (r.left - pad) + 'px';
    ring.style.top    = (r.top  - pad) + 'px';
    ring.style.width  = (r.width  + pad*2) + 'px';
    ring.style.height = (r.height + pad*2) + 'px';

    // place tip
    const tip = $('tourTip');
    const tipW = s.wide ? 420 : 340;
    const tipText = s.text || _t(s.textKey); // allow literal text for new step
    $('tourTipText').textContent = tipText;
    $('tourCounter').textContent = `${this.idx+1}/${this.steps.length}`;
    let left = Math.min(window.innerWidth - tipW - 16, r.left + r.width + 12);
    let top  = Math.max(16, r.top);

    // left-of (used for CHAT and APPROVE so it doesn't overlap)
    if (s.leftOf){
      left = Math.max(16, r.left - tipW - 12);
      top  = Math.max(16, r.top);
    }
    // below target (for Print/Download buttons to avoid overlap)
    if (s.below){
      left = Math.min(window.innerWidth - tipW - 16, Math.max(16, r.left + (r.width - tipW)/2));
      top  = r.bottom + 12;
    }

    // Optional nudges (fine-grained placement)
    if (typeof s.nudgeX === 'number') left += s.nudgeX;
    if (typeof s.nudgeY === 'number') top  += s.nudgeY;

    tip.style.left = left + 'px';
    tip.style.top  = top  + 'px';

    // set state for special advancing
    this.state = (s.advanceOn === 'docClick') ? 'waitForDocClick' : '';

    // buttons visibility
    $('tourBackBtn').style.display  = (this.idx > 0) ? 'inline-block' : 'none';
    $('tourNextBtn').style.display  = (this.idx < this.steps.length - 1) ? 'inline-block' : 'none';
    $('tourDoneBtn').style.display  = (this.idx === this.steps.length - 1) ? 'inline-block' : 'none';
  },
  next(){ this.idx++; if(this.idx >= this.steps.length) return this.end(); this.showStep(); },
  prev(){ if (this.idx === 0) return; this.idx--; this.showStep(); }
};

$('tourNextBtn').onclick  = ()=>tour.next();
$('tourBackBtn').onclick  = ()=>tour.prev();
$('tourDoneBtn').onclick  = ()=>tour.end();
$('tourCloseBtn').onclick = ()=>tour.end();
// Allow closing the guide by clicking the dim background or pressing ESC
$('tourDim').onclick = ()=>tour.end();
window.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && tourActive) tour.end(); });

function startTour(){ tour.start(); }

/* ----------------------------------------------------------
   Main flow
---------------------------------------------------------- */
$('otpForm').onsubmit = async e=>{
  e.preventDefault(); spin(true); setMsg('');
  try{
    await verifyOtp($('otp').value.trim());
    hide($('otpCard'));
    await fetchDocs(); renderLists(); await loadCurrent();

    show($('sidebar')); show($('viewerCard'));
    show($('sidebarActions'));                        // reveal bottom actions (guide + FAQ)

    // Reveal chat FAB post-OTP
    show($('chatFab'));

    // Show the attention label only if the user hasn’t manually opened chat before
    if (!hasSeenLabel()){
      $('chatLabel').classList.remove('hidden');
      $('chatLabel').style.display='block';
      // next frame => measure positions correctly
      setTimeout(positionChatLabel, 0);
    } else {
      $('chatLabel').classList.add('hidden');
      $('chatLabel').style.display='none';
    }

    // Only auto-open intro / run tour if NOT all approved
    const allOk = docs.every(d=>d.status==='Approved');
    spin(false);
    if(!allOk){
      shouldStartTour = true;       // after intro closes, tour will start
      openIntro();                  // opens for all brands; video loads only if SHOW_INTRO
    }else{
      shouldStartTour = false;
    }

    setInterval(fetchChat,15000);
  }catch(err){ spin(false); setMsg(err.message); }
};

$('sendCodeBtn').onclick = async ()=>{
  const btn=$('sendCodeBtn'); if(btn.disabled) return;
  const label = _t('OTP_RESEND_BTN');
  btn.disabled=true;
  try{
    setMsg(_t('OTP_SENDING'));
    await resendOtp();
    setMsg(_t('OTP_SENT'));
    startOtpCooldown(10);
  }catch(e){
    setMsg(e.message);btn.disabled=false;btn.textContent=label;
  }
};

$('approveBtn').onclick   =()=>tryApprove([docs[active].id]);
$('approveAllBtn').onclick=()=>tryApprove(docs.filter(d=>d.status!=='Approved').map(d=>d.id));

/* Relaunch guide button */
$('tourRelaunchBtn').onclick = ()=>{
  shouldStartTour = false;
  startTour();
};
