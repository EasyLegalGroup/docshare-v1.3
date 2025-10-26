/* ------------------------------------------------------------------
   Redirect old journal links to identifier mode
------------------------------------------------------------------ */
(function redirectOldLinks(){
  const qs = new URLSearchParams(location.search);
  const hasE = qs.has('e');
  const hasT = qs.has('t');
  
  // If old journal parameters exist, redirect to clean URL
  if (hasE || hasT) {
    const cleanUrl = location.origin + location.pathname;
    window.location.replace(cleanUrl);
    return; // Stop execution
  }
})();

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
      ID_APPROVE     = `${API}/identifier/approve`,
      ID_CHAT_ASK    = `${API}/identifier/chat/ask`;  // AI-powered Q&A

/* Default intro video */
const DEFAULT_VIDEO_URL = 'https://www.youtube.com/embed/UsFmArdrO8s?rel=0';
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
let availableJournals = [];       // journals found for identifier (for selection)
let selectedJournalId = '';       // currently selected journal ID
let selectedJournalName = '';     // currently selected journal name (e.g. "J-0055362")

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

/* Session expiration handler */
function handleSessionExpired(){
  // Clear UI state
  docs = [];
  active = 0;
  completionShown = false;
  currentPresigned = '';
  
  // Reset to OTP screen
  hide($('sidebar'));
  hide($('viewerCard'));
  hide($('chatPillBtn'));
  show($('otpCard'));
  
  // Show appropriate step based on mode
  if (MODE === 'identifier') {
    // Back to identifier entry
    showStep('id');
    setIdMsg('Session expired. Please sign in again.');
  } else {
    // Back to OTP verification for journal mode
    showStep('verify');
    setVerifySub();
    setMsg('Session expired. Please enter the code again.');
  }
  
  spin(false);
}

function isSessionExpired(response, json){
  // Check for 401 status or session-related errors
  if (response.status === 401) return true;
  if (json && typeof json.error === 'string'){
    const err = json.error.toLowerCase();
    if (err.includes('session') || err.includes('expired') || err.includes('unauthorized') || err.includes('invalid token')) return true;
  }
  return false;
}

/* ----------------------------------------------------------
   Focus helpers (exclusive + visibility-aware)
   - Ensures only the latest requested focus "wins"
   - Waits until element is visible (not in a .hidden container)
   - Uses rAF + small retries for iOS Safari after class toggles
---------------------------------------------------------- */
const focusManager = (() => {
  let token = 0;
  let timer = null;

  function isVisible(el){
    if (!el || el.disabled) return false;
    // Hidden via CSS display:none or visibility:hidden
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    // Hidden via ancestor .hidden (display:none !important)
    let p = el;
    while (p) {
      if (p.classList && p.classList.contains('hidden')) return false;
      p = p.parentElement;
    }
    // If inside a display:none parent, offsetParent will be null (except position:fixed)
    if (!el.offsetParent && cs.position !== 'fixed') return false;
    return true;
  }

  function focusNow(el){
    try { el.focus({ preventScroll: true }); }
    catch(_) { try { el.focus(); } catch(__){} }
  }

  function schedule(target, { delay = 0, tries = 8, interval = 40 } = {}){
    const el = typeof target === 'string' ? $(target) : target;
    if (!el) return;

    token++;
    const myToken = token;
    if (timer) { clearTimeout(timer); timer = null; }

    const attempt = (left) => {
      if (myToken !== token) return; // superseded
      if (isVisible(el)) { focusNow(el); return; }
      if (left <= 0) return;
      timer = setTimeout(()=>attempt(left-1), interval);
    };

    const start = () => attempt(tries);
    if (delay > 0) timer = setTimeout(start, delay);
    else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(()=> setTimeout(start, 0));
    else start();
  }

  return { schedule };
})();
const autoFocus = (idOrEl, opts) => focusManager.schedule(idOrEl, opts);

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
if (menuBtn) {
  menuBtn.onclick = () => $('sidebar').classList.toggle('open');
  // Hide menu button initially (until portal UI loads)
  menuBtn.style.display = 'none';
}
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
  // Handle double-prefix: 4545... → 45...
  if (digits.startsWith('4545') && digits.length >= 12) digits = digits.substring(2);
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
  // Handle double-prefix: 4646... → 46...
  else if (digits.startsWith('4646') && digits.length >= 12) digits = digits.substring(2);
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
  // Handle double-prefix: 353353... → 353...
  else if (digits.startsWith('353353') && digits.length >= 16) digits = digits.substring(3);
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
  const subtitle = document.querySelector('[data-i18n="OTP_SUBTITLE"]');
  const idChooser = $('idChooser');
  
  if (which === 'verify'){ 
    hide(idStep); 
    show(verifyStep); 
    if (subtitle) hide(subtitle);
    if (idChooser) hide(idChooser);
    // Auto-focus OTP input when shown (visibility-aware, iOS-friendly)
    autoFocus('otp', { delay: 60, tries: 8, interval: 40 });
  } else { 
    show(idStep); 
    hide(verifyStep); 
    if (subtitle) show(subtitle);
    if (idChooser) show(idChooser);
  }
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
  // Focus correct field after returning to identifier step
  if (identifierType === 'phone') autoFocus('phoneLocal', { delay: 60 });
  else                            autoFocus('emailInput', { delay: 60 });
}

async function requestOtpIdentifier(){
  // Gather input depending on channel
  let payload = { channel: identifierType, market: (window.__BRAND && window.__BRAND.market) || '' };

  if (identifierType === 'phone'){
    const phoneLocal = ($('phoneLocal')?.value || '').trim();
    const iso = $('phoneCountryBtn')?.dataset?.iso || DEFAULT_PHONE_ISO;
    const dial = (PHONE_COUNTRIES.find(c=>c.iso===iso) || PHONE_COUNTRIES[0]).dial;
    
    // Fix: Detect if user pasted full international number to avoid double prefix
    let raw = phoneLocal;
    if (raw.startsWith('+') || raw.startsWith('00')) {
      // Already international format, use as-is
      raw = raw;
    } else if (raw.startsWith(dial)) {
      // Already has dial code, prepend +
      raw = '+' + raw;
    } else {
      // Normal case: prepend full prefix
      raw = `+${dial}${raw}`;
    }
    
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
  showStep('verify');           // this schedules focus on #otp
  // (Removed redundant immediate otp.focus() to avoid race conditions)
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
  
  // NEW: Fetch journals to determine if we need bridge page
  await fetchJournalsForIdentifier();
}

async function fetchJournalsForIdentifier() {
  try {
    const payload = (identifierType === 'phone')
      ? { phone: identifierValue }
      : { email: identifierValue };
    const r = await fetch(ID_LIST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`
      },
      body: JSON.stringify(payload)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw Error(j.error || 'Failed to fetch journals');
    
    console.log('fetchJournalsForIdentifier response:', j);
    
    // Check if journals array exists (new Lambda) or fallback to old behavior
    if (j.journals && Array.isArray(j.journals)) {
      availableJournals = j.journals;
      
      if (availableJournals.length === 0) {
        throw Error(_t_safe('NO_DOCUMENTS_FOUND') || 'No documents found');
      }
      // CHANGED: Always show bridge page (removed the single-journal skip logic)
      selectedJournalId = '';
    } else {
      // Old Lambda without journal grouping - extract journals from items
      console.warn('Lambda response missing journals array - using fallback logic');
      const items = j.items || [];
      if (items.length === 0) {
        throw Error(_t_safe('NO_DOCUMENTS_FOUND') || 'No documents found');
      }
      
      // Build journals from items
      const journalsMap = {};
      items.forEach(item => {
        const jId = item.journalId;
        const jName = item.journalName || jId;
        if (jId && !journalsMap[jId]) {
          journalsMap[jId] = {
            id: jId,
            name: jName,
            documentCount: 0
          };
        }
        if (jId) {
          journalsMap[jId].documentCount++;
        }
      });
      
      availableJournals = Object.values(journalsMap);
      
      if (availableJournals.length === 0) {
        throw Error(_t_safe('NO_DOCUMENTS_FOUND') || 'No documents found');
      }
      // CHANGED: Always show bridge page
      selectedJournalId = '';
    }
  } catch (err) {
    console.error('fetchJournalsForIdentifier error:', err);
    throw err;
  }
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
    if (isSessionExpired(r, j)) { handleSessionExpired(); return; }
    if(!r.ok||!j.ok) throw Error(_t_safe('LIST_FAILED'));
    docs = (j.documents || []);
  } else {
    const payload = (identifierType === 'phone') ? { phone: identifierValue } : { email: identifierValue };
    // Add journal filter if selected
    if (selectedJournalId) {
      payload.journalId = selectedJournalId;
    }
    const r = await fetch(ID_LIST,{ method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${sessionToken}`}, body:JSON.stringify(payload) });
    const j = await r.json().catch(()=>({}));
    if (isSessionExpired(r, j)) { handleSessionExpired(); return; }
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
    if (isSessionExpired(r, j)) { handleSessionExpired(); throw Error('Session expired'); }
    if(!r.ok||!j.ok) throw Error(_t_safe('PRESIGN_FAILED'));
    return j.url;
  } else {
    const r = await fetch(ID_DOC_URL,{ method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${sessionToken}`}, body:JSON.stringify({docId:id}) });
    const j = await r.json().catch(()=>({}));
    if (isSessionExpired(r, j)) { handleSessionExpired(); throw Error('Session expired'); }
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
      // Show only document type (no filename)
      div.textContent = doc.documentType || getDocName(doc);
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

  const docType = doc.documentType || getDocName(doc);
  show($('approveRow'));
  if ($('approveBtn') && $('approveMsg')){
    if (curOk){
      $('approveBtn').textContent = `${docType} er godkendt`;
      $('approveBtn').disabled = true;
      $('approveMsg').textContent = '';
    }else{
      $('approveBtn').textContent = `${_t_safe('APPROVE_PREFIX')} ${docType}`;
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
  if (!currentPresigned) {
    try { $('pdf')?.contentWindow?.print?.(); } catch {}
    return;
  }
  
  // Try using the existing PDF iframe first
  try {
    const pdfFrame = $('pdf');
    if (pdfFrame && pdfFrame.contentWindow) {
      pdfFrame.contentWindow.focus();
      pdfFrame.contentWindow.print();
      return;
    }
  } catch (e) {
    console.log('Direct iframe print failed, trying blob method:', e);
  }
  
  // Fallback: fetch and create blob URL
  try {
    const res = await fetch(currentPresigned, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error('PDF fetch failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
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
  } catch (err) {
    console.error('Blob print method failed:', err);
    // Last resort: open in new window
    window.open(currentPresigned, '_blank');
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
    const j=await r.json().catch(()=>({}));
    if (isSessionExpired(r, j)) { handleSessionExpired(); return; }
    const ok=r.ok&&j.ok;
    if(ok){
      ids.forEach(id=>{const d=docs.find(x=>x.id===id); if(d) d.status='Approved';});
      renderLists();await loadCurrent(); if ($('approveMsg')) $('approveMsg').textContent=_t_safe('APPROVE_THANKS');
    }else{ if ($('approveMsg')) $('approveMsg').textContent=_t_safe('GENERIC_ERROR'); }
  } else {
    const r=await fetch(ID_APPROVE,{ method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${sessionToken}`}, body:JSON.stringify({docIds:ids}) });
    const j=await r.json().catch(()=>({}));
    if (isSessionExpired(r, j)) { handleSessionExpired(); return; }
    if(r.ok && j.ok){
      ids.forEach(id=>{const d=docs.find(x=>x.id===id); if(d) d.status='Approved';});
      renderLists();await loadCurrent(); if ($('approveMsg')) $('approveMsg').textContent=_t_safe('APPROVE_THANKS');
    }else{ if ($('approveMsg')) $('approveMsg').textContent=j.error || _t_safe('GENERIC_ERROR'); }
  }
}

/* ----------------------------------------------------------
   Chat (document-scoped)
---------------------------------------------------------- */
const chatSeen=new Set(),chatCache=[];
function renderChat(scrollToMsgId = null){
  const box=$('chatList');
  if(!box) return;
  if(!chatCache.length){
    box.innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:#999;">
        <p style="font-size:18px; margin:0 0 10px;">📭</p>
        <p style="margin:0;">${_t_safe('CHAT_EMPTY')}</p>
      </div>
    `;
    return;
  }
  box.innerHTML='';
  chatCache.forEach(m=>{
    const isAI = (m.messageType === 'AI' || m.Message_Type__c === 'AI');
    const isThinking = m.isThinking || m.messageType === 'AI-thinking';
    const isInbound = (m.inbound || m.Is_Inbound__c);
    
    const wrap=document.createElement('div'), ts=document.createElement('div'), row=document.createElement('div');
    wrap.className = isInbound ?'me':'them';
    if (isAI || isThinking) wrap.classList.add('ai-message');
    wrap.setAttribute('data-msg-id', m.id);
    
    ts.className='chat-ts'; 
    ts.textContent=new Date(m.at||m.createdDate||Date.now()).toLocaleString();
    
    row.className='chat-row';
    if (isAI || isThinking) row.classList.add('ai-bubble');
    row.innerHTML=m.body;
    
    // Add AI feedback buttons (only for AI messages not yet marked)
    if (isAI && !isThinking && !m.aiHelpful && !m.aiEscalated && !m.AI_Helpful__c && !m.AI_Escalated__c) {
      const feedback = document.createElement('div');
      feedback.className = 'ai-feedback';
      feedback.innerHTML = `
        <button class="feedback-btn helpful" data-id="${m.id}" onclick="handleAIFeedback('${m.id}', 'helpful')">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          ${_t_safe('AI_HELPFUL_BTN')}
        </button>
        <button class="feedback-btn escalate" data-id="${m.id}" onclick="handleAIFeedback('${m.id}', 'escalate')">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M7 17L17 7M17 7H7M17 7v10"/>
          </svg>
          ${_t_safe('AI_ESCALATE_BTN')}
        </button>
      `;
      row.appendChild(feedback);
    } else if (m.aiHelpful || m.AI_Helpful__c) {
      const thanks = document.createElement('div');
      thanks.className = 'ai-feedback-done';
      thanks.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="color:#22c55e;">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
        ${_t_safe('AI_FEEDBACK_THANKS')}
      `;
      row.appendChild(thanks);
    } else if (m.aiEscalated || m.AI_Escalated__c) {
      const escalated = document.createElement('div');
      escalated.className = 'ai-feedback-done';
      escalated.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#0369a1;">
          <path d="M7 17L17 7M17 7H7M17 7v10"/>
        </svg>
        ${_t_safe('AI_ESCALATED')}
      `;
      row.appendChild(escalated);
    }
    
    // Add "Ask AI" button for human mode messages
    // Show when: user's own message (inbound=true, right side), in human mode, not AI, not thinking, not system, not already asked
    const isUserMessage = isInbound && !isAI && !isThinking && m.messageType !== 'System';
    if (isUserMessage && chatMode === 'human' && !m.askedAI) {
      const askAI = document.createElement('div');
      askAI.className = 'ask-ai-btn';
      askAI.innerHTML = `
        <button onclick="askAIAboutMessage('${m.id}', \`${escapeHtml(m.body)}\`)">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 2a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0V6H6a1 1 0 110-2h1V3a1 1 0 011-1zm0 7a3 3 0 100 6 3 3 0 000-6z"/>
          </svg>
          Spørg AI?
        </button>
      `;
      row.appendChild(askAI);
    }
    
    wrap.appendChild(row); box.appendChild(ts); box.appendChild(wrap);
  });
  
  // Smart scrolling
  if (scrollToMsgId) {
    setTimeout(() => {
      const targetMsg = box.querySelector(`[data-msg-id="${scrollToMsgId}"]`);
      if (targetMsg) {
        targetMsg.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        box.scrollTop = box.scrollHeight;
      }
    }, 100);
  } else {
    box.scrollTop = box.scrollHeight;
  }
}
async function fetchChat(){
  try {
    let url, options;
    if (MODE === 'journal') {
      // Journal mode: use query parameters
      url = `${CHAT_LIST}?e=${encodeURIComponent(externalId)}&t=${encodeURIComponent(accessToken)}`;
      options = { method: 'GET' };
    } else {
      // Identifier mode: POST with Bearer token and selected journal
      url = `${API}/identifier/chat/list`;
      options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ journalId: selectedJournalId })
      };
    }
    
    const r = await fetch(url, options);
    const j = await r.json().catch(()=>({}));
    if (isSessionExpired(r, j)) { handleSessionExpired(); return; }
    if(!r.ok||!j.ok) return;
    
    j.messages.forEach(m=>{
      if(chatSeen.has(m.id)) return;
      chatSeen.add(m.id);
      chatCache.push(m);
    });
    renderChat();
  } catch(e) {
    console.error('fetchChat error:', e);
  }
}
async function sendChat(){
  const ed=$('chatEditor'), html=(ed?.innerHTML || '').trim();
  if(!html) return;
  
  // Check if we should use AI mode (identifier mode + active document + AI mode selected)
  const useAI = (MODE === 'identifier' && active >= 0 && active < docs.length && chatMode === 'ai');
  
  if (useAI) {
    // AI-powered document Q&A
    ed.setAttribute('contenteditable','false');
    
    // Add user's question immediately
    const userMsgId = `q-${Date.now()}`;
    chatCache.push({
      id: userMsgId,
      body: html,
      inbound: true,
      at: new Date().toISOString(),
      messageType: 'Human'
    });
    
    // Add AI "thinking" placeholder
    const thinkingId = `thinking-${Date.now()}`;
    chatCache.push({
      id: thinkingId,
      body: '<span class="ai-thinking">🤔 AI tænker<span class="dots"></span></span>',
      inbound: false,
      at: new Date().toISOString(),
      messageType: 'AI-thinking',
      isThinking: true
    });
    
    ed.innerHTML='';
    renderChat();
    
    try {
      const currentDoc = docs[active];
      
      // Call AI endpoint
      const aiUrl = ID_CHAT_ASK;
      const aiOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          journalId: selectedJournalId,
          documentId: currentDoc.id,
          question: html.replace(/<[^>]*>/g, ''), // Strip HTML tags for question
          brand: BRAND_KEY,
          originalTarget: 'AI',
          finalTarget: 'AI',
          targetChanged: false
        })
      };
      
      const r = await fetch(aiUrl, aiOptions);
      const j = await r.json().catch(()=>({}));
      if (isSessionExpired(r, j)) { handleSessionExpired(); return; }
      
      if (!r.ok) {
        throw new Error(j.error || 'AI request failed');
      }
      
      // Remove thinking placeholder
      const thinkingIdx = chatCache.findIndex(m => m.id === thinkingId);
      if (thinkingIdx !== -1) chatCache.splice(thinkingIdx, 1);
      
      // Update user question with Salesforce ID
      const userMsg = chatCache.find(m => m.id === userMsgId);
      if (userMsg && j.inboundMessageId) {
        userMsg.id = j.inboundMessageId;
      }
      
      // Add AI response
      const aiMsgId = j.outboundMessageId || `ai-${Date.now()}`;
      chatCache.push({
        id: aiMsgId,
        body: `${j.answer}`,
        inbound: false,
        at: j.timestamp || new Date().toISOString(),
        messageType: 'AI',
        aiModel: j.aiModel,
        aiResponseTime: j.responseTimeMs,
        aiHelpful: false,
        aiEscalated: false
      });
      
      ed.setAttribute('contenteditable','true');
      renderChat(aiMsgId); // Pass AI message ID to scroll to it
      
    } catch(e) {
      console.error('AI chat error:', e);
      
      // Remove thinking placeholder
      const thinkingIdx = chatCache.findIndex(m => m.id === thinkingId);
      if (thinkingIdx !== -1) chatCache.splice(thinkingIdx, 1);
      
      ed.setAttribute('contenteditable','true');
      
      // Show error in chat
      chatCache.push({
        id: `err-${Date.now()}`,
        body: `❌ AI Fejl: ${e.message || 'Kunne ikke behandle spørgsmålet'}`,
        inbound: false,
        at: new Date().toISOString(),
        messageType: 'System'
      });
      renderChat();
    }
  } else {
    // Standard human chat (existing code)
    ed.setAttribute('contenteditable','false');
    ed.textContent=_t_safe('GENERIC_SENDING');
    
    try {
      let url, options;
      if (MODE === 'journal') {
        url = CHAT_SEND;
        options = {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            externalId,
            accessToken,
            body: html
          })
        };
      } else {
        // Identifier mode: POST with Bearer token and journal ID
        url = `${API}/identifier/chat/send`;
        
        // Determine routing metadata
        const originalTarget = chatMode === 'ai' ? 'AI' : 'Human';
        const finalTarget = originalTarget; // For regular send, they match
        const targetChanged = false; // No change during regular send
        
        options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken}`
          },
          body: JSON.stringify({
            journalId: selectedJournalId,
            body: html,
            messageType: 'Human', // Explicitly set message type for human messages
            originalTarget,
            finalTarget,
            targetChanged
          })
        };
      }
      
      const r = await fetch(url, options);
      const j = await r.json().catch(()=>({}));
      if (isSessionExpired(r, j)) { handleSessionExpired(); return; }
      
      ed.setAttribute('contenteditable','true');
      ed.innerHTML='';
      fetchChat();
    } catch(e) {
      console.error('sendChat error:', e);
      ed.setAttribute('contenteditable','true');
    }
  }
}

async function handleAIFeedback(messageId, action) {
  try {
    const r = await fetch(`${API}/identifier/chat/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`
      },
      body: JSON.stringify({ messageId, action })
    });
    const j = await r.json().catch(() => ({}));
    
    if (!r.ok || !j.ok) {
      console.error('AI feedback failed:', j.error);
      return;
    }
    
    // Update the message in cache
    const msg = chatCache.find(m => m.id === messageId);
    if (msg) {
      if (action === 'helpful') {
        msg.aiHelpful = true;
      } else if (action === 'escalate') {
        msg.aiEscalated = true;
        
        // Add system message about escalation
        chatCache.push({
          id: 'system-' + Date.now(),
          body: `<em style="color:#888;">${_t_safe('AI_ESCALATED_MESSAGE')}</em>`,
          at: new Date().toISOString(),
          inbound: false,
          messageType: 'System'
        });
      }
    }
    
    // Re-render chat to show updated buttons
    renderChat();
    
    // Optionally refresh to get the new human message if escalated
    if (action === 'escalate') {
      setTimeout(() => fetchChat(), 500);
    }
  } catch (e) {
    console.error('AI feedback error:', e);
  }
}

// Helper function to escape HTML for onclick attributes
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '');
}

// Ask AI about a message that was originally sent to human
async function askAIAboutMessage(messageId, messageBody) {
  try {
    // Mark the original message as having asked AI
    const msg = chatCache.find(m => m.id === messageId);
    if (msg) {
      msg.askedAI = true;
    }
    
    // Check if we have an active document
    if (active < 0 || active >= docs.length) {
      // No document selected - show error
      chatCache.push({
        id: 'error-' + Date.now(),
        body: `<em style="color:#dc2626;">Vælg venligst et dokument for at bruge AI.</em>`,
        at: new Date().toISOString(),
        inbound: false,
        messageType: 'System'
      });
      renderChat();
      return;
    }
    
    const currentDoc = docs[active];
    
    // Add thinking indicator (on LEFT side, from system)
    chatCache.push({
      id: 'thinking-' + Date.now(),
      body: '<span class="ai-thinking">🤔 AI tænker<span class="dots"></span></span>',
      at: new Date().toISOString(),
      inbound: false,  // LEFT side
      messageType: 'AI-thinking',
      isThinking: true
    });
    renderChat();
    
    // Send to AI with routing metadata
    const r = await fetch(`${API}/identifier/chat/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`
      },
      body: JSON.stringify({
        journalId: selectedJournalId,
        documentId: currentDoc.id,
        question: messageBody.replace(/<[^>]*>/g, ''),  // Strip HTML tags
        brand: BRAND_KEY,
        originalTarget: 'Human',
        finalTarget: 'AI',
        targetChanged: true
      })
    });
    
    const j = await r.json().catch(() => ({}));
    
    // Remove thinking indicator
    let newCache = chatCache.filter(m => !m.isThinking);
    chatCache = newCache;
    
    if (!r.ok) {
      console.error('Ask AI failed:', j.error || 'Request failed');
      chatCache.push({
        id: 'error-' + Date.now(),
        body: `<em style="color:#dc2626;">${j.error || 'Der opstod en fejl. Prøv igen.'}</em>`,
        at: new Date().toISOString(),
        inbound: false,
        messageType: 'System'
      });
      renderChat();
      return;
    }
    
    // Add AI response
    if (j.answer) {
      const aiMsgId = j.outboundMessageId || 'ai-' + Date.now();
      chatCache.push({
        id: aiMsgId,
        body: j.answer,
        at: j.timestamp || new Date().toISOString(),
        inbound: false,  // LEFT side
        messageType: 'AI',
        fromAI: true
      });
    }
    
    renderChat();
    
    // Optionally refresh to sync with server
    setTimeout(() => fetchChat(), 500);
  } catch (e) {
    console.error('Ask AI error:', e);
    let newCache = chatCache.filter(m => !m.isThinking);
    chatCache = newCache;
    chatCache.push({
      id: 'error-' + Date.now(),
      body: `<em style="color:#dc2626;">Der opstod en fejl. Prøv igen.</em>`,
      at: new Date().toISOString(),
      inbound: false,
      messageType: 'System'
    });
    renderChat();
  }
}

// Make functions globally accessible for onclick handlers
window.handleAIFeedback = handleAIFeedback;
window.askAIAboutMessage = askAIAboutMessage;

document.querySelectorAll('.chat-tools button').forEach(b=>b.onclick=()=>document.execCommand(b.dataset.cmd,false));

function openChatPanel(source='user'){
  const panel=$('chatPanel'), header=$('chatHeader'), pillBtn=$('chatPillBtn');
  if (!panel || !header) return;
  
  panel.style.display='flex'; panel.classList.remove('hidden'); header.textContent = _t_safe('CHAT_HEADER_OPEN');
  
  // Hide chat pill button when chat is open
  if (pillBtn) pillBtn.style.display = 'none';
  
  // Clear old messages when switching journals
  chatCache.length = 0;
  chatSeen.clear();
  
  fetchChat();
  if (source === 'user') { try { localStorage.setItem(CHAT_SEEN_KEY,'1'); } catch(e){} }
}

function closeChatPanel(){
  const panel=$('chatPanel'), header=$('chatHeader'), pillBtn=$('chatPillBtn');
  if (!panel || !header) return;
  panel.style.display='none'; panel.classList.add('hidden'); header.textContent = _t_safe('CHAT_HEADER');
  
  // Show chat pill button when chat is closed
  if (pillBtn) pillBtn.style.display = 'inline-flex';
}

if ($('chatPillBtn'))    $('chatPillBtn').onclick=()=>{ if($('chatPanel')?.style.display==='flex'){ closeChatPanel(); } else { openChatPanel('user'); } };
if ($('chatHeader')) $('chatHeader').onclick=()=>{ if($('chatPanel')?.style.display==='flex'){ closeChatPanel(); } };
if ($('chatSend'))   $('chatSend').onclick=sendChat;
if ($('chatEditor')) $('chatEditor').addEventListener('keydown',e=>{ if(e.key==='Enter'&&e.ctrlKey) sendChat(); });

/* Chat mode toggle */
let chatMode = 'ai'; // 'ai' or 'human'
if ($('modeAI')) {
  $('modeAI').onclick = () => {
    chatMode = 'ai';
    $('modeAI').classList.add('active');
    $('modeHuman').classList.remove('active');
  };
}
if ($('modeHuman')) {
  $('modeHuman').onclick = () => {
    chatMode = 'human';
    $('modeHuman').classList.add('active');
    $('modeAI').classList.remove('active');
  };
}

/* Chat expand/collapse */
if ($('chatExpandBtn')) {
  $('chatExpandBtn').onclick = () => {
    const panel = $('chatPanel');
    if (panel) {
      panel.classList.toggle('expanded');
      const btn = $('chatExpandBtn');
      const svg = btn.querySelector('svg');
      
      if (panel.classList.contains('expanded')) {
        // Minimize icon
        if (svg) {
          svg.innerHTML = '<path d="M3 3v3h3M17 17h-3v-3M17 3h-3V6M3 17v-3h3" stroke="currentColor" stroke-width="2" fill="none"/>';
        }
        btn.setAttribute('title', 'Minimer chat');
      } else {
        // Expand icon
        if (svg) {
          svg.innerHTML = '<path d="M14 3h3v3M3 17v-3h3M17 14v3h-3M3 6V3h3" stroke="currentColor" stroke-width="2" fill="none"/>';
        }
        btn.setAttribute('title', 'Udvid chat');
      }
    }
  };
}

/* Chat disclaimer close button */
const CHAT_DISCLAIMER_KEY = 'dfj_chat_disclaimer_dismissed';
if ($('chatDisclaimerClose')) {
  $('chatDisclaimerClose').onclick = () => {
    const disclaimer = $('chatDisclaimer');
    if (disclaimer) {
      disclaimer.classList.add('hidden');
      try { localStorage.setItem(CHAT_DISCLAIMER_KEY, '1'); } catch(e){}
    }
  };
}

/* Check if disclaimer was previously dismissed */
function showChatDisclaimer() {
  try {
    const dismissed = localStorage.getItem(CHAT_DISCLAIMER_KEY);
    const disclaimer = $('chatDisclaimer');
    if (disclaimer && dismissed === '1') {
      disclaimer.classList.add('hidden');
    }
  } catch(e){}
}
showChatDisclaimer();

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
    if (SHOW_INTRO) {  // Use SHOW_INTRO instead of SHOW_FAQ for FAQ visibility
      const faqBtn = $('faqBtn');
      if (faqBtn && !faqBtn.classList.contains('hidden')) {
        arr.push({ key:'FAQ', target:'#faqBtn', textKey:'TOUR_STEP_FAQ' });  // 3 (conditional)
      }
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
   Journal Selection (Bridge Page)
---------------------------------------------------------- */
function showJournalSelection() {
  const otpCard = $('otpCard');
  if (!otpCard) return;
  
  // Use "Overview" title (always showing this page now)
  const title = window._t ? window._t('JOURNAL_OVERVIEW_TITLE') : 'Overview';
  
  // Helper to format date
  const formatDate = (isoDate) => {
    if (!isoDate) return '';
    try {
      const d = new Date(isoDate);
      return d.toLocaleDateString(window.__BRAND?.lang || 'da-DK', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch(e) {
      return '';
    }
  };
  
  const html = `
    <div style="padding: 30px; max-width: 600px; margin: 0 auto;">
      <h2 style="margin-bottom: 24px; font-size: 24px; font-weight: 600;">${title}</h2>
      <div id="journalList" style="display: flex; flex-direction: column; gap: 12px;">
        ${availableJournals.map(j => {
          // Check if all documents are approved
          const allApproved = j.approvedCount > 0 && j.approvedCount === j.documentCount;
          const borderColor = allApproved ? '#10b981' : '#ddd';
          const bgColor = allApproved ? '#f0fdf4' : 'white';
          
          // Date with label
          const dateLabel = window._t ? window._t('JOURNAL_FIRST_DRAFT_SENT') : 'First draft sent: ';
          const dateStr = j.firstDraftSent 
            ? `<div style="color: #888; font-size: 13px; margin-top: 4px;">${dateLabel}${formatDate(j.firstDraftSent)}</div>` 
            : '';
          
          // All approved badge
          const approvedBadge = allApproved 
            ? `<div style="display: inline-block; padding: 4px 10px; background: #10b981; color: white; border-radius: 12px; font-size: 12px; font-weight: 600; margin-top: 8px;">
                ${window._t ? window._t('JOURNAL_ALL_APPROVED') : '✓ All approved'}
              </div>`
            : '';
          
          // Document type pills with approval indicators
          const docTypes = (j.documentTypes || []).length > 0 
            ? `<ul style="margin: 8px 0 0 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px;">
                ${j.documentTypes.map(dt => {
                  const stats = (j.documentStatuses || {})[dt] || {total: 0, approved: 0};
                  const isApproved = stats.approved === stats.total && stats.total > 0;
                  const pillBg = isApproved ? '#d1fae5' : '#f0f0f0';
                  const pillColor = isApproved ? '#065f46' : '#555';
                  const checkmark = isApproved ? '✓ ' : '';
                  return `<li style="display: inline-block; padding: 4px 10px; background: ${pillBg}; border-radius: 12px; font-size: 12px; color: ${pillColor}; font-weight: ${isApproved ? '600' : 'normal'};">
                    ${checkmark}📄 ${dt}
                  </li>`;
                }).join('')}
              </ul>`
            : '';
          
          return `
            <button 
              onclick="selectJournal('${j.id}')" 
              style="padding: 20px; background: ${bgColor}; border: 2px solid ${borderColor}; border-radius: 8px; cursor: pointer; text-align: left; transition: all 2:0s; font-family: inherit;"
              onmouseover="this.style.borderColor='var(--accent, #007bff)'; this.style.background='${allApproved ? '#f0fdf4' : '#f8f9fa'}';"
              onmouseout="this.style.borderColor='${borderColor}'; this.style.background='${bgColor}';"
            >
              <div style="font-weight: 600; font-size: 18px; margin-bottom: 6px;">${j.name || j.id}</div>
              ${dateStr}
              ${docTypes}
              ${approvedBadge}
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
  
  otpCard.innerHTML = html;
  show(otpCard);
}

async function selectJournal(journalId) {
  selectedJournalId = journalId;
  // Store journal name for brand bar display
  const journal = availableJournals.find(j => j.id === journalId);
  selectedJournalName = journal ? (journal.name || journal.id) : journalId;
  
  spin(true);
  try {
    await fetchDocs(); 
    renderLists(); 
    await loadCurrent();
    enterPortalUI();
    
    // Show back button
    showBackToJournalsButton();
    
    const allOk = docs.every(d=>d.status==='Approved');
    spin(false);
    if(!allOk){ shouldStartTour = true; openIntro(); } else { shouldStartTour = false; }
  } catch(err) {
    spin(false);
    alert(err.message || _t_safe('ERROR_GENERIC'));
  }
}

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
      hide($('chatPillBtn'));
      
      // Show journal selection again
      showJournalSelection();
    };
  }
  
  // Show the container (which has the sidebar-actions styling)
  container.classList.remove('hidden');
}

// Make globally accessible for onclick handlers
window.selectJournal = selectJournal;

/* ----------------------------------------------------------
   Main flow
---------------------------------------------------------- */
function enterPortalUI(){
  hide($('otpCard'));
  show($('sidebar'));
  show($('viewerCard'));
  show($('sidebarActions'));
  
  // Show menu button now that sidebar is active
  if (menuBtn) menuBtn.style.display = '';
  
  // Chat always visible (will load per-document messages)
  show($('chatPillBtn'));
  
  // Show back button (identifier mode only - always visible now)
  if (MODE === 'identifier') {
    showBackToJournalsButton();
  }
  
  // Display journal name in brand bar (journal mode only)
  const journalNameEl = $('journalName');
  if (journalNameEl) {
    if (MODE === 'journal' && externalId) {
      journalNameEl.textContent = `Journal: ${externalId}`;
      journalNameEl.classList.remove('hidden');
    } else if (MODE === 'identifier' && selectedJournalName) {
      journalNameEl.textContent = `Journal: ${selectedJournalName}`;
      journalNameEl.classList.remove('hidden');
    } else {
      journalNameEl.classList.add('hidden');
    }
  }
}

if ($('otpForm')) $('otpForm').onsubmit = async e=>{
  e.preventDefault(); spin(true); setMsg('');
  try{
    const code = ($('otp')?.value || '').trim();
    if (MODE === 'journal') await verifyOtpJournal(code);
    else                   await verifyOtpIdentifier(code);

    // In identifier mode, always show journal selection (bridge page)
    if (MODE === 'identifier' && !selectedJournalId) {
      spin(false);
      showJournalSelection();
      return;
    }

    await fetchDocs(); renderLists(); await loadCurrent();
    enterPortalUI();

    const allOk = docs.every(d=>d.status==='Approved');
    spin(false);
    if(!allOk){ shouldStartTour = true; openIntro(); } else { shouldStartTour = false; }
    // Note: Periodic chat refresh removed - chat now loads per-document on demand
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
      b.onclick = ()=>{
        phoneIso=c.iso;
        setPhoneButton();
        phoneDropdown.classList.add('hidden');
        // refocus phone input after selection (only if visible later)
        autoFocus('phoneLocal', { delay: 0 });
      };
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
    if (t==='phone'){ show(phoneGroup); hide(emailGroup); }
    else            { show(emailGroup); hide(phoneGroup); }
    setIdMsg('');
    // Only focus if identifier step is currently visible (avoid stealing focus from OTP/journal screens)
    const idStepVisible = !$('idStep')?.classList.contains('hidden');
    if (idStepVisible){
      if (t==='phone') autoFocus('phoneLocal', { delay: 30 });
      else             autoFocus('emailInput', { delay: 30 });
    }
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
  
  // Auto-focus the initial input field on page load (identifier mode only)
  setTimeout(() => {
    if (MODE === 'identifier') {
      if (identifierType === 'phone') autoFocus('phoneLocal', { delay: 0 });
      else                            autoFocus('emailInput', { delay: 0 });
    }
  }, 100);

  const so = $('startOverBtn');
  if (so) so.onclick = startOver;
})();

if ($('approveBtn'))    $('approveBtn').onclick   =()=>tryApprove([docs[active].id]);
if ($('approveAllBtn')) $('approveAllBtn').onclick=()=>tryApprove(docs.filter(d=>d.status!=='Approved').map(d=>d.id));

if ($('tourRelaunchBtn')) $('tourRelaunchBtn').onclick = ()=>{ shouldStartTour = false; if(typeof startTour==='function') startTour(); };