/* ------------------------------------------------------------------
   Konfiguration & helpers
------------------------------------------------------------------ */
const API  = new URLSearchParams(location.search).get('api')
          || 'https://21tpssexjd.execute-api.eu-north-1.amazonaws.com';

// Journal endpoints (unchanged)
const OTP_VERIFY = `${API}/otp-verify`,
      OTP_SEND   = `${API}/otp-send`,
      DOC_LIST   = `${API}/doc-list`,
      DOC_URL    = `${API}/doc-url`,
      APPROVE_URL= `${API}/approve`,
      CHAT_LIST  = `${API}/chat/list`,
      CHAT_SEND  = `${API}/chat/send`;

// Identifier endpoints
const ID_REQUEST_OTP = `${API}/identifier/request-otp`,
      ID_VERIFY_OTP  = `${API}/identifier/verify-otp`,
      ID_LIST        = `${API}/identifier/list`,
      ID_DOC_URL     = `${API}/identifier/doc-url`,
      ID_APPROVE     = `${API}/identifier/approve`;

/* Default intro video */
const DEFAULT_VIDEO_URL = 'https://www.youtube.com/embed/a5DPLsmaltE?rel=0';
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

const MODE = (externalId && accessToken) ? 'journal' : 'identifier';

/* ---------------- Identifier session state ---------------- */
let identifierType  = 'phone';    // 'phone' | 'email'
let identifierValue = '';         // e164 phone or email string for verify-sub
let sessionToken    = '';         // Bearer token returned by /identifier/verify-otp

/* Brand-aware options */
const VIDEO_URL  = qs.get('video') || (window.__BRAND && window.__BRAND.video) || DEFAULT_VIDEO_URL;
const SHOW_INTRO = (window.__BRAND && window.__BRAND.showVideo) !== false;
const SHOW_FAQ = (window.__BRAND && typeof window.__BRAND.showFAQ !== 'undefined')
  ? !!window.__BRAND.showFAQ
  : true;
const BRAND_KEY = (document.documentElement.getAttribute('data-brand') || 'dk').toLowerCase();
const DEFAULT_PHONE_ISO = (window.__BRAND && window.__BRAND.countryIso) || (BRAND_KEY==='se' ? 'SE' : BRAND_KEY==='ie' ? 'IE' : 'DK');

const $    = id => document.getElementById(id),
      show = el => el && el.classList.remove('hidden'),
      hide = el => el && el.classList.add('hidden'),
      setMsg = t => { const m=$('msg'); if(m) m.textContent = t || ''; },
      setIdMsg = t => { const m=$('idMsg'); if(m) m.textContent = t || ''; },
      spin   = on => { const ov=$('loadingOverlay'); if(ov) ov.classList.toggle('hidden', !on); };

const SHOW_APPROVE_ALL = false;

const CHAT_SEEN_KEY = 'dfj_chat_opened';
function hasSeenLabel(){
  try { return localStorage.getItem(CHAT_SEEN_KEY) === '1'; } catch(e){ return false; }
}

let docs = [], active = 0, completionShown = false, currentPresigned = '';
let shouldStartTour = false, tourActive = false;

/* ----------------------------------------------------------
   i18n helpers & dynamic substitutions
---------------------------------------------------------- */
function _t_safe(k){ try{ return window._t ? window._t(k) : (k||''); } catch(_){ return k||''; } }

/* Build nested accordions from .faq-blocks (kept) */
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
function enhanceFaqNestedAccordions(){
  try{
    document.querySelectorAll('#faqModal .acc-content').forEach(section=>{
      const blocks = Array.from(section.querySelectorAll('.faq-block'));
      if (!blocks.length) return;
      const holder = document.createElement('div');
      holder.className = 'faq-items';
      holder.appendChild(buildDetailsFromBlocks(blocks));
      section.innerHTML = '';
      section.appendChild(holder);
    });
  }catch(e){}
}
function enhancePostApprovalAccordions(){
  try{
    document.querySelectorAll('#completionModal .acc-content').forEach(section=>{
      const blocks = Array.from(section.querySelectorAll('.faq-block'));
      if (!blocks.length) return;
      const holder = document.createElement('div');
      holder.className = 'faq-items';
      holder.appendChild(buildDetailsFromBlocks(blocks));
      section.innerHTML = '';
      section.appendChild(holder);
    });
  }catch(e){}
}

/* Apply static texts + dynamic {btn} token in subtitle */
(function applyTexts(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    el.textContent = _t_safe(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el=>{
    el.innerHTML = _t_safe(el.dataset.i18nHtml);
  });
  const ce = $('chatEditor');
  if (ce) ce.setAttribute('placeholder', _t_safe('CHAT_PLACEHOLDER'));

  // Dynamic substitution: replace {btn} with the localized “send code” label
  const sub = document.querySelector('[data-i18n="OTP_SUBTITLE"]');
  if (sub){
    let tpl = _t_safe('OTP_SUBTITLE');
    sub.innerHTML = (tpl || '').replace('{btn}', _t_safe('OTP_RESEND_BTN'));
  }

  enhanceFaqNestedAccordions();
  enhancePostApprovalAccordions();
})();

/* ----------------------------------------------------------
   Sidebar toggle (unchanged)
---------------------------------------------------------- */
const menuBtn = $('menuBtn');
if (menuBtn) menuBtn.onclick = () => $('sidebar').classList.toggle('open');
function maybeCloseSidebar(){ if (window.innerWidth <= 1024) $('sidebar')?.classList.remove('open'); }

/* ----------------------------------------------------------
   Intro modal (unchanged)
---------------------------------------------------------- */
function openIntro(){ if (SHOW_INTRO && $('videoFrame')) $('videoFrame').src = ytUrlWithSafeParams(VIDEO_URL); show($('introModal')); }
function closeIntro(){ const f=$('videoFrame'); if(f) f.src=''; hide($('introModal')); if (shouldStartTour && !tourActive && typeof startTour==='function') startTour(); }
const introBtn=$('introBtn'); if (introBtn) introBtn.onclick=openIntro;
const introX=$('introCloseBtn'); if (introX) introX.onclick=closeIntro;
const introOkay=$('introOkayBtn'); if (introOkay) introOkay.onclick=closeIntro;
const introOverlay=$('introModal'); if (introOverlay) introOverlay.onclick=e=>{ if(e.target&&e.target.id==='introModal') closeIntro(); };
window.addEventListener('keydown', e=>{ if(e.key==='Escape' && !$('introModal')?.classList.contains('hidden')) closeIntro(); });
if (!SHOW_INTRO){ const vw=document.querySelector('.video-wrapper'); if (vw) vw.classList.add('hidden'); }

/* ----------------------------------------------------------
   FAQ modal (unchanged)
---------------------------------------------------------- */
function openFAQ(){ enhanceFaqNestedAccordions(); show($('faqModal')); }
function closeFAQ(){ hide($('faqModal')); }
(function initFaqButton(){
  const btn=$('faqBtn'); if (!btn) return;
  if (SHOW_FAQ){ btn.classList.remove('hidden'); btn.onclick=openFAQ; }
  else { btn.classList.add('hidden'); btn.onclick=null; }
})();
if ($('faqCloseBtn')) $('faqCloseBtn').onclick = closeFAQ;
if ($('faqOkayBtn'))  $('faqOkayBtn').onclick  = closeFAQ;
if ($('faqModal'))    $('faqModal').onclick    = e=>{ if(e.target.id==='faqModal') closeFAQ(); };
document.querySelectorAll('.acc-header').forEach(btn=>{
  btn.onclick = ()=>{
    btn.classList.toggle('open');
    const c = btn.nextElementSibling;
    if(c) c.classList.toggle('hidden');
  };
});

/* ----------------------------------------------------------
   Completion modal (unchanged content, new buttons wired below)
---------------------------------------------------------- */
function openCompletion(){ enhancePostApprovalAccordions(); show($('completionModal')); }
function closeCompletion(){ hide($('completionModal')); }
if ($('completionCloseBtn')) $('completionCloseBtn').onclick = closeCompletion;
if ($('completionOkayBtn'))  $('completionOkayBtn').onclick  = closeCompletion;
if ($('completionModal'))    $('completionModal').onclick    = e=>{ if(e.target.id==='completionModal') closeCompletion(); };
if ($('viewCompletionBtn'))  $('viewCompletionBtn').onclick  = openCompletion;

/* ----------------------------------------------------------
   McPhone normalization (ported)
   Returns { digits: '45xxxxxxxx', ok: boolean, warning: string|null, e164: '+45xxxxxxxx' }
---------------------------------------------------------- */
function mcNormDK(raw){
  const out = { digits:null, ok:false, warning:null, e164:'' };
  if (!raw || !raw.trim()){ out.warning='Blank input'; return out; }
  let digits = raw.replace(/[^0-9]/g,'');
  if (!digits){ out.warning='No digits found'; return out; }
  if (digits.startsWith('0045')) digits = '45' + digits.substring(4);
  if (digits.length === 8) digits = '45' + digits;
  const ok = (digits.startsWith('45') && digits.length === 10);
  out.digits = digits; out.ok = ok; out.warning = ok?null:'DK sanity check failed (expect 45 + 8 digits)'; out.e164 = digits?('+'+digits):''; return out;
}
function mcNormSE(raw){
  const out = { digits:null, ok:false, warning:null, e164:'' };
  if (!raw || !raw.trim()){ out.warning='Blank input'; return out; }
  let digits = raw.replace(/[^0-9]/g,'');
  if (!digits){ out.warning='No digits found'; return out; }
  if (digits.startsWith('0046')) digits = '46' + digits.substring(4);
  else if (digits.startsWith('46')) { /* ok */ }
  else if (digits.startsWith('0') && digits.length >= 2) digits = '46' + digits.substring(1);
  const ok = (digits.startsWith('46') && digits.length >= 10 && digits.length <= 12);
  out.digits = digits; out.ok = ok; out.warning = ok?null:'SE sanity check failed (expect starts with 46 and reasonable length)'; out.e164 = digits?('+'+digits):''; return out;
}
function mcNormIE(raw){
  const out = { digits:null, ok:false, warning:null, e164:'' };
  if (!raw || !raw.trim()){ out.warning='Blank input'; return out; }
  let digits = raw.replace(/[^0-9]/g,'');
  if (!digits){ out.warning='No digits found'; return out; }
  if (digits.startsWith('00353')) digits = '353' + digits.substring(5);
  else if (digits.startsWith('353')) { /* ok */ }
  else if (digits.startsWith('0') && digits.length >= 2) digits = '353' + digits.substring(1);
  const ok = (digits.startsWith('353') && digits.length >= 12 && digits.length <= 13);
  out.digits = digits; out.ok = ok; out.warning = ok?null:'IE sanity check failed (expect starts with 353 and reasonable length)'; out.e164 = digits?('+'+digits):''; return out;
}
function mcNormalize(raw, iso){
  switch((iso||'').toUpperCase()){
    case 'DK': return mcNormDK(raw);
    case 'SE': return mcNormSE(raw);
    case 'IE': return mcNormIE(raw);
    default: {
      const digits = (raw||'').replace(/[^0-9]/g,'');
      return { digits, ok: !!digits, warning: digits?null:'Blank or no digits', e164: digits?('+'+digits):'' };
    }
  }
}

/* Country list for phone picker (Nordic + nearby) */
const PHONE_COUNTRIES = [
  { iso:'DK', dial:'45',  name:'Denmark' },
  { iso:'SE', dial:'46',  name:'Sweden' },
  { iso:'NO', dial:'47',  name:'Norway' },
  { iso:'DE', dial:'49',  name:'Germany' },
  { iso:'IE', dial:'353', name:'Ireland' },
  { iso:'NL', dial:'31',  name:'Netherlands' },
  { iso:'FI', dial:'358', name:'Finland' },
  { iso:'UK', dial:'44',  name:'United Kingdom' }
];

/* ----------------------------------------------------------
   OTP / Identifier logic
---------------------------------------------------------- */
function showStep(which){
  const idStep = $('idStep');
  const verifyStep = $('verifyStep');
  if (which === 'verify'){ hide(idStep); show(verifyStep); }
  else { show(idStep); hide(verifyStep); }
}
function setVerifySub(){
  const el = $('verifySub'); if (!el) return;
  const channel = (identifierType === 'phone')
    ? _t_safe('VERIFY_CHANNEL_PHONE')
    : _t_safe('VERIFY_CHANNEL_EMAIL');
  let tpl = _t_safe('VERIFY_SUB_TPL');
  try{ tpl = tpl.replace('{channel}', channel).replace('{value}', identifierValue || ''); }catch(_){}
  el.textContent = tpl;
}
function startOver(){
  const otpInput = $('otp');    if (otpInput) otpInput.value = '';
  const phoneLocal = $('phoneLocal'); if (phoneLocal) phoneLocal.value='';
  const emailInput = $('emailInput'); if (emailInput) emailInput.value='';
  identifierValue = ''; sessionToken = '';
  setMsg(''); setIdMsg('');
  showStep('auth');
  if (identifierType === 'phone') $('phoneLocal')?.focus?.(); else $('emailInput')?.focus?.();
}

async function requestOtpIdentifier(){
  // Gather input depending on channel
  let payload = { channel: identifierType, market: (window.__BRAND && window.__BRAND.market) || '' };

  if (identifierType === 'phone'){
    const phoneLocal = ($('phoneLocal')?.value || '').trim();
    const iso = $('phoneCountryBtn')?.dataset?.iso || DEFAULT_PHONE_ISO;
    const dial = (PHONE_COUNTRIES.find(c=>c.iso===iso) || PHONE_COUNTRIES[0]).dial;
    const raw = `+${dial}${phoneLocal}`;
    const norm = mcNormalize(raw, iso);
    identifierValue = norm.e164 || raw;
    payload.phone       = norm.e164 || raw;
    payload.phoneDigits = norm.digits || '';
    payload.country     = iso;
  } else {
    const email = ($('emailInput')?.value || '').trim().toLowerCase();
    if (!email){ setIdMsg(_t_safe('OTP_INPUT_EMAIL')); return; }
    identifierValue = email;
    payload.email = email;
  }

  // UX: proceed to verify regardless of match result so backend can create OTP__c = "No Match" if applicable.
  setIdMsg(_t_safe('OTP_SENDING'));
  try{
    const r = await fetch(ID_REQUEST_OTP, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    // ignore r.ok here on purpose (requirement #3)
    await r.json().catch(()=>({}));
  }catch(_){/* swallow */ }

  // Go to Verify
  setIdMsg(_t_safe('OTP_SENT'));
  setVerifySub();
  showStep('verify');
  $('otp')?.focus?.();
}

async function verifyOtpIdentifier(code){
  const iso = $('phoneCountryBtn')?.dataset?.iso || DEFAULT_PHONE_ISO;
  const payload = (identifierType === 'phone')
    ? { phone: identifierValue, otp: code, country: iso }
    : { email: identifierValue, otp: code };
  const r = await fetch(ID_VERIFY_OTP, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const j = await r.json().catch(()=>({}));
  if (!r.ok || !j.ok) throw Error(j.error || _t_safe('OTP_INVALID'));
  sessionToken = j.session || '';
  if (!sessionToken) throw Error('Session missing');
}

async function verifyOtpJournal(code){
  const r = await fetch(OTP_VERIFY,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({externalId,otp:code})
  });
  const j = await r.json().catch(()=>({}));
  if(!r.ok||!j.ok) throw Error(j.error||_t_safe('OTP_INVALID'));
}

async function resendOtp(){
  if (MODE === 'journal'){
    const r = await fetch(OTP_SEND,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({externalId}) });
    const j = await r.json().catch(()=>({}));
    if(!r.ok||!j.ok) throw Error(j.error||_t_safe('OTP_RESEND_FAILED'));
  } else {
    await requestOtpIdentifier();
  }
}

/* ----------------------------------------------------------
   Document helpers
---------------------------------------------------------- */
function getDocName(d){ return d.name || d.fileName || d.filename || d.key || 'Document'; }
function getSortField(d){
  const v = d.sortOrder ?? d.SortOrder ?? d.sort_order ?? d.displayOrder ?? d.DisplayOrder ?? d.order ?? d.Order ?? d.sequence ?? d.Sequence;
  if (v === null || v === undefined) return Number.MAX_SAFE_INTEGER;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}
async function fetchDocs(){
  if (MODE === 'journal'){
    const r = await fetch(DOC_LIST,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({externalId,accessToken}) });
    const j = await r.json().catch(()=>({}));
    if(!r.ok||!j.ok) throw Error(_t_safe('LIST_FAILED'));
    docs = (j.documents || []);
  } else {
    const payload = (identifierType === 'phone') ? { phone: identifierValue } : { email: identifierValue };
    const r = await fetch(ID_LIST,{ method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${sessionToken}`}, body:JSON.stringify(payload) });
    const j = await r.json().catch(()=>({}));
    if(!r.ok||!j.ok) throw Error(_t_safe('LIST_FAILED'));
    docs = (j.items || []);
  }
  docs = docs
    .filter(d => d.isNewestVersion)
    .sort((a,b)=>{
      const sa = getSortField(a), sb = getSortField(b);
      if (sa !== sb) return sa - sb;
      return getDocName(a).localeCompare(getDocName(b), undefined, {numeric:true, sensitivity:'base'});
    });
  if(!docs.length) throw Error(_t_safe('NO_DOCS_NEWEST'));
}
async function presign(id){
  if (MODE === 'journal'){
    const r = await fetch(DOC_URL,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({externalId,accessToken,docId:id}) });
    const j = await r.json().catch(()=>({}));
    if(!r.ok||!j.ok) throw Error(_t_safe('PRESIGN_FAILED'));
    return j.url;
  } else {
    const r = await fetch(ID_DOC_URL,{ method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${sessionToken}`}, body:JSON.stringify({docId:id}) });
    const j = await r.json().catch(()=>({}));
    if(!r.ok||!j.ok) throw Error(_t_safe('PRESIGN_FAILED'));
    return j.url;
  }
}

/* ----------------------------------------------------------
   Sidebar render (unchanged)
---------------------------------------------------------- */
function renderLists(){
  const pending  = docs.filter(d=>d.status!=='Approved'),
        approved = docs.filter(d=>d.status==='Approved');

  if ($('pendingCount'))  $('pendingCount').textContent  = pending.length;
  if ($('approvedCount')) $('approvedCount').textContent = approved.length;

  const render = (el,list,emptyKey)=>{
    if (!el) return;
    el.innerHTML='';
    if(!list.length){
      const p=document.createElement('div');
      p.className='doc-empty';
      p.textContent=_t_safe(emptyKey);
      el.appendChild(p);
      return;
    }
    list.forEach(doc=>{
      const div=document.createElement('div');
      div.className='doc-item'+(doc.status==='Approved'?' approved':'')+(doc===docs[active]?' active':'');
      const title=document.createElement('div');
      title.className='doc-title';
      title.textContent=getDocName(doc);
      div.appendChild(title);
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
        if (tourActive && typeof tour!=='undefined' && tour.state === 'waitForDocClick') tour.next();
      };
      el.appendChild(div);
    });
  };
  render($('pendingList'),pending,'PENDING_EMPTY');
  render($('approvedList'),approved,'APPROVED_EMPTY');
  if ($('approveAllBtn')) $('approveAllBtn').classList.toggle('hidden', !SHOW_APPROVE_ALL || !pending.length);
}

/* ----------------------------------------------------------
   Viewer + actions (download/print only on click)
---------------------------------------------------------- */
async function loadCurrent(){
  try{
    setMsg(_t_safe('LOADING')); if ($('pdf')) $('pdf').src='';
    spin(true);
    currentPresigned = await presign(docs[active].id);
    if ($('pdf')) $('pdf').src=currentPresigned+'#toolbar=0&zoom=150';
    setMsg('');
    try{
      if(docs[active].status === 'Sent'){
        docs[active].status = 'Viewed';
        renderLists();
      }
    }catch(_){}
  }catch(e){ setMsg(e.message);}finally{ spin(false); }

  const doc   = docs[active],
        allOk = docs.every(d=>d.status==='Approved'),
        curOk = doc.status==='Approved';

  if ($('headerText')) $('headerText').textContent = allOk ? _t_safe('HEADER_ALL_OK') : _t_safe('HEADER_PENDING');
  if ($('viewCompletionBtn')) $('viewCompletionBtn').classList.toggle('hidden', !allOk);

  const name = getDocName(doc);
  show($('approveRow'));
  if ($('approveBtn') && $('approveMsg')){
    if (curOk){
      $('approveBtn').textContent = `${name} er godkendt`;
      $('approveBtn').disabled = true;
      $('approveMsg').textContent = '';
    }else{
      $('approveBtn').textContent = `${_t_safe('APPROVE_PREFIX')} ${name}`;
      $('approveBtn').disabled = false;
      $('approveMsg').textContent = '';
    }
  }

  if(allOk && !completionShown){
    completionShown = true;
    openCompletion();
  }
}

/* shared handlers for download/print – triggered only by user click */
function doDownload(){
  try{
    const a=document.createElement('a');
    a.href=currentPresigned; a.download='document.pdf'; a.target='_blank';
    document.body.appendChild(a); a.click(); a.remove();
  }catch(e){ console.error(e); }
}
async function doPrint(){
  try {
    const res  = await fetch(currentPresigned, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error('PDF fetch failed');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const frame = document.createElement('iframe');
    frame.style.position='fixed'; frame.style.right='0'; frame.style.bottom='0'; frame.style.width='0'; frame.style.height='0'; frame.style.border='0';
    const cleanup=()=>{ try{URL.revokeObjectURL(url);}catch{} try{frame.remove();}catch{} };
    frame.onload = () => {
      const cw = frame.contentWindow; if(!cw) return cleanup();
      const cleanOnce = () => { cw.removeEventListener('afterprint', cleanOnce); window.removeEventListener('afterprint', cleanOnce); setTimeout(cleanup, 1000); };
      cw.addEventListener('afterprint', cleanOnce, { once: true });
      window.addEventListener('afterprint', cleanOnce, { once: true });
      try { cw.focus(); } catch {}
      cw.print();
      setTimeout(cleanOnce, 120000);
    };
    frame.src = url; document.body.appendChild(frame);
  } catch (_){
    try { $('pdf')?.contentWindow?.print?.(); } catch {}
  }
}

if ($('downloadBtn')) $('downloadBtn').onclick = doDownload;
if ($('printBtn'))    $('printBtn').onclick    = doPrint;
// Also expose the same actions inside the completion modal
if ($('completionDownloadBtn')) $('completionDownloadBtn').onclick = doDownload;
if ($('completionPrintBtn'))    $('completionPrintBtn').onclick    = doPrint;

/* ----------------------------------------------------------
   Approval modal + Approve handler
---------------------------------------------------------- */
let modalResolve=null;
function openApproval(ids){
  const many=ids.length>1,
        docsToShow=docs.filter(d=>ids.includes(d.id)),
        list=many?`<ul>${docsToShow.map(d=>`<li>${getDocName(d)}</li>`).join('')}</ul>`:'';

  if ($('confirmText')) $('confirmText').innerHTML = many
    ? `${_t_safe('MODAL_APPROVE_ALL_TXT')} ${list}`
    : `${_t_safe('MODAL_APPROVE_TXT')} <strong>${getDocName(docsToShow[0])}</strong>.`;
  if ($('confirmApprove')) $('confirmApprove').textContent = many?_t_safe('MODAL_APPROVE_ALL'):_t_safe('MODAL_APPROVE');
  show($('confirmModal'));
  return new Promise(res=>{modalResolve=res;});
}
if ($('confirmCancel' )) $('confirmCancel' ).onclick=()=>{hide($('confirmModal'));modalResolve(false);};
if ($('confirmCancel2')) $('confirmCancel2').onclick=()=>{hide($('confirmModal'));modalResolve(false);};
if ($('confirmApprove')) $('confirmApprove').onclick=()=>{hide($('confirmModal'));modalResolve(true);};

async function tryApprove(ids){
  if(!await openApproval(ids)) return;
  if ($('approveMsg')) $('approveMsg').textContent=_t_safe('GENERIC_SENDING');

  if (MODE === 'journal'){
    const r=await fetch(APPROVE_URL,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({externalId,accessToken,docIds:ids}) });
    const ok=r.ok&&(await r.json().catch(()=>({}))).ok;
    if(ok){
      ids.forEach(id=>{const d=docs.find(x=>x.id===id); if(d) d.status='Approved';});
      renderLists();await loadCurrent(); if ($('approveMsg')) $('approveMsg').textContent=_t_safe('APPROVE_THANKS');
    }else{ if ($('approveMsg')) $('approveMsg').textContent=_t_safe('GENERIC_ERROR'); }
  } else {
    const r=await fetch(ID_APPROVE,{ method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${sessionToken}`}, body:JSON.stringify({docIds:ids}) });
    const j=await r.json().catch(()=>({}));
    if(r.ok && j.ok){
      ids.forEach(id=>{const d=docs.find(x=>x.id===id); if(d) d.status='Approved';});
      renderLists();await loadCurrent(); if ($('approveMsg')) $('approveMsg').textContent=_t_safe('APPROVE_THANKS');
    }else{ if ($('approveMsg')) $('approveMsg').textContent=j.error || _t_safe('GENERIC_ERROR'); }
  }
}

/* ----------------------------------------------------------
   Chat (journal only)
---------------------------------------------------------- */
const chatSeen=new Set(),chatCache=[];
function renderChat(){
  const box=$('chatList');
  if(!box) return;
  if(!chatCache.length){ box.textContent=_t_safe('CHAT_NO_MESSAGES'); return; }
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
  const ed=$('chatEditor'), html=(ed?.innerHTML || '').trim(); if(!html) return;
  ed.setAttribute('contenteditable','false'); ed.textContent=_t_safe('GENERIC_SENDING');
  await fetch(CHAT_SEND,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({externalId,accessToken,body:html}) });
  ed.setAttribute('contenteditable','true'); ed.innerHTML=''; fetchChat();
}
document.querySelectorAll('.chat-tools button').forEach(b=>b.onclick=()=>document.execCommand(b.dataset.cmd,false));
function openChatPanel(source='user'){
  const panel=$('chatPanel'), label=$('chatLabel'), header=$('chatHeader');
  if (!panel || !header) return;
  panel.style.display='flex'; panel.classList.remove('hidden'); header.textContent = _t_safe('CHAT_HEADER_OPEN');
  if (label){ label.style.display='none'; label.classList.add('hidden'); }
  fetchChat();
  if (source === 'user') { try { localStorage.setItem(CHAT_SEEN_KEY,'1'); } catch(e){} }
}
function closeChatPanel(){
  const panel=$('chatPanel'), label=$('chatLabel'), header=$('chatHeader');
  if (!panel || !header) return;
  panel.style.display='none'; panel.classList.add('hidden'); header.textContent = _t_safe('CHAT_HEADER');
  if (!hasSeenLabel()){ if(label){ label.classList.remove('hidden'); label.style.display='block'; positionChatLabel(); } }
  else { if(label){ label.style.display='none'; label.classList.add('hidden'); } }
}
if ($('chatFab'))    $('chatFab').onclick=()=>{ if($('chatPanel')?.style.display==='flex'){ closeChatPanel(); } else { openChatPanel('user'); } };
if ($('chatHeader')) $('chatHeader').onclick=()=>{ if($('chatPanel')?.style.display==='flex'){ closeChatPanel(); } };
if ($('chatLabel'))  $('chatLabel').onclick = () => openChatPanel('user');
if ($('chatSend'))   $('chatSend').onclick=sendChat;
if ($('chatEditor')) $('chatEditor').addEventListener('keydown',e=>{ if(e.key==='Enter'&&e.ctrlKey) sendChat(); });
function positionChatLabel(){
  const fab=$('chatFab'), label=$('chatLabel'); if (!fab || !label) return; if (label.classList.contains('hidden')) return;
  const fr = fab.getBoundingClientRect();
  const prev = label.style.display; if (prev === 'none') label.style.display = 'block';
  const lr = label.getBoundingClientRect();
  label.style.left = (fr.left - lr.width - 12) + 'px'; label.style.top  = (fr.top + (fr.height - lr.height)/2) + 'px';
  label.style.display = prev;
}
window.addEventListener('resize', positionChatLabel);
window.addEventListener('scroll', positionChatLabel);

/* ----------------------------------------------------------
   In-app tour (your existing code can stay here)
---------------------------------------------------------- */
// ...

/* ----------------------------------------------------------
   Main flow
---------------------------------------------------------- */
function showBackToJournalsButton() {
  if (MODE !== 'identifier') return;
  
  const container = $('backToJournalsActions');
  const btn = $('backToJournalsBtn');
  if (!container || !btn) return;
  
  // Set up click handler (only once)
  if (!btn.onclick) {
    btn.onclick = () => {
      selectedJournalId = "";
      hide(container);
      
      // Hide portal UI
      hide($('sidebar'));
      hide($('viewerCard'));
      hide($('sidebarActions'));
      hide($('chatFab'));
      
      // Show journal selection again
      showJournalSelection();
    };
  }
  
  // Show the container
  container.classList.remove('hidden');
}

function enterPortalUI(){
  hide($('otpCard'));
  show($('sidebar'));
  show($('viewerCard'));
  show($('sidebarActions'));
  if (MODE === 'journal'){
    show($('chatFab'));
    if (!hasSeenLabel()){
      const lbl=$('chatLabel');
      if (lbl){ lbl.classList.remove('hidden'); lbl.style.display='block'; setTimeout(positionChatLabel, 0); }
    } else {
      const lbl=$('chatLabel');
      if (lbl){ lbl.classList.add('hidden'); lbl.style.display='none'; }
    }
  } else {
    hide($('chatFab')); hide($('chatLabel')); closeChatPanel();
  }
}

if ($('otpForm')) $('otpForm').onsubmit = async e=>{
  e.preventDefault(); spin(true); setMsg('');
  try{
    const code = ($('otp')?.value || '').trim();
    if (MODE === 'journal') await verifyOtpJournal(code);
    else                   await verifyOtpIdentifier(code);

    await fetchDocs(); renderLists(); await loadCurrent();
    enterPortalUI();

    const allOk = docs.every(d=>d.status==='Approved');
    spin(false);
    if(!allOk){ shouldStartTour = true; openIntro(); } else { shouldStartTour = false; }
    if (MODE === 'journal') setInterval(fetchChat,15000);
  }catch(err){ spin(false); setMsg(err.message); }
};

// (Resend button only exists in journal legacy – identifier flow uses requestOtpIdentifier again)
if ($('sendCodeBtn')) $('sendCodeBtn').onclick = async ()=>{
  const btn=$('sendCodeBtn'); if(btn.disabled) return;
  btn.disabled=true;
  try{
    setMsg(_t_safe('OTP_SENDING'));
    await resendOtp();
    setMsg(_t_safe('OTP_SENT'));
  }catch(e){
    setMsg(e.message); btn.disabled=false; btn.textContent=_t_safe('OTP_RESEND_BTN');
  }
};

/* ---------------- Identifier start UI (phone/email + picker) ---------------- */
(function initIdentifierStart(){
  const usePhoneBtn      = $('usePhoneBtn');
  const useEmailBtn      = $('useEmailBtn');
  const idForm           = $('idForm');

  const phoneGroup       = $('phoneGroup');
  const emailGroup       = $('emailGroup');
  const phoneCountryBtn  = $('phoneCountryBtn');
  const phoneDropdown    = $('phoneDropdown');
  const phoneLocal       = $('phoneLocal');
  let   phoneIso         = DEFAULT_PHONE_ISO;

  // Build dropdown
  function setPhoneButton(){
    const cfg = PHONE_COUNTRIES.find(c=>c.iso===phoneIso) || PHONE_COUNTRIES[0];
    phoneCountryBtn.textContent = `${cfg.name} (+${cfg.dial})`;
    phoneCountryBtn.dataset.iso = cfg.iso;
    phoneCountryBtn.dataset.dial = cfg.dial;
  }
  function buildPhoneDropdown(){
    phoneDropdown.innerHTML = '';
    PHONE_COUNTRIES.forEach(c=>{
      const b = document.createElement('button');
      b.type='button';
      b.className='phone-option';
      b.textContent = `${c.name} (+${c.dial})`;
      b.onclick = ()=>{ phoneIso=c.iso; setPhoneButton(); phoneDropdown.classList.add('hidden'); phoneLocal?.focus(); };
      phoneDropdown.appendChild(b);
    });
  }
  if (phoneCountryBtn && phoneDropdown){ buildPhoneDropdown(); setPhoneButton(); }
  if (phoneCountryBtn){
    phoneCountryBtn.onclick = (e)=>{ e.preventDefault(); phoneDropdown.classList.toggle('hidden'); };
    document.addEventListener('click', (e)=>{
      if (!phoneDropdown.contains(e.target) && e.target !== phoneCountryBtn) phoneDropdown.classList.add('hidden');
    });
  }

  function setType(t){
    identifierType = t;
    if (usePhoneBtn) usePhoneBtn.classList.toggle('active', t==='phone');
    if (useEmailBtn) useEmailBtn.classList.toggle('active', t==='email');
    if (t==='phone'){ show(phoneGroup); hide(emailGroup); phoneLocal?.focus(); }
    else            { show(emailGroup); hide(phoneGroup); $('emailInput')?.focus(); }
    setIdMsg('');
  }
  if (usePhoneBtn) usePhoneBtn.onclick = ()=> setType('phone');
  if (useEmailBtn) useEmailBtn.onclick = ()=> setType('email');

  if (idForm) idForm.onsubmit = async (e)=>{
    e.preventDefault();
    spin(true);
    try{
      await requestOtpIdentifier();
      setMsg('');
    }catch(err){ setIdMsg(err.message || _t_safe('OTP_RESEND_FAILED')); }
    finally{ spin(false); }
  };

  if (MODE === 'identifier'){ showStep('auth'); } else { showStep('verify'); }
  setType('phone');

  const so = $('startOverBtn');
  if (so) so.onclick = startOver;
})();

if ($('approveBtn'))    $('approveBtn').onclick   =()=>tryApprove([docs[active].id]);
if ($('approveAllBtn')) $('approveAllBtn').onclick=()=>tryApprove(docs.filter(d=>d.status!=='Approved').map(d=>d.id));

if ($('tourRelaunchBtn')) $('tourRelaunchBtn').onclick = ()=>{ shouldStartTour = false; if(typeof startTour==='function') startTour(); };
