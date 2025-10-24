import { LightningElement, api, wire, track } from 'lwc';
import { getRecord, getFieldValue, deleteRecord, updateRecord } from 'lightning/uiRecordApi';
import { getObjectInfo, getPicklistValuesByRecordType } from 'lightning/uiObjectInfoApi';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

/* ---------- Apex ---------- */
import getOrCreateCreds      from '@salesforce/apex/DocShare_JournalCreds.getOrCreate';
import createForJournalBulk  from '@salesforce/apex/DocShareService.createForJournalBulk';
import replaceSharedDocument from '@salesforce/apex/DocShareService.replaceSharedDocument';
import getByJournal          from '@salesforce/apex/DocShare_Query.getByJournal';

/* ---------- Schema ---------- */
import JOURNAL_ID   from '@salesforce/schema/Journal__c.Id';
import NAME_FIELD   from '@salesforce/schema/Journal__c.Name';
import EXT_ID_FIELD from '@salesforce/schema/Journal__c.External_ID__c';
import TOK_FIELD    from '@salesforce/schema/Journal__c.Access_Token__c';
import SHARED_DOC_OBJECT from '@salesforce/schema/Shared_Document__c';
const FIELDS = [JOURNAL_ID, NAME_FIELD, EXT_ID_FIELD, TOK_FIELD];

/* ---------- Constants ---------- */
const API_BASE         = 'https://ysu7eo2haj.execute-api.eu-north-1.amazonaws.com/prod';
const UPLOAD_START_URL = `${API_BASE}/upload-start`;

/** Unicode-ish letter class (for word-ish boundaries when matching names) */
const LETTERS = 'A-Za-zÀ-ÖØ-öø-ÿÆØÅæøå';
const WORD_SEP = new RegExp(`(^|[^${LETTERS}])`);
const WORD_END = new RegExp(`([^${LETTERS}]|$)`);

export default class JournalDocConsole extends LightningElement {
  /* ========== reactive state ========== */
  @api   recordId;          // Journal__c.Id
  @track rows = [];         // [{id,name,file,status,putUrl,key,contentType}]
  @track docs = [];         // normalized docs for view
  @track messageSuccess = '';
  @track messageError = '';
  @track activeTab = 'newest';

  ready    = false;
  disabled = true;

  /* journal auth fields */
  journalId;
  journalName; // e.g., J-0054489
  extId;
  token;

  /* internal helpers */
  _replaceTargetId = null;
  _wiredDocsResult;
  _justCreatedIds = new Set();

  /* picklist meta (for dependent picklist) */
  recordTypeId;
  _pickMeta = null; // { controllerValues, docTypeValues[] }

  /* ========== Wires ========== */

  // Load Journal credentials / auth
  @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
  async wiredJournal({ data, error }) {
    if (data) {
      this.journalId   = getFieldValue(data, JOURNAL_ID);
      this.journalName = getFieldValue(data, NAME_FIELD);
      this.extId       = getFieldValue(data, EXT_ID_FIELD);
      this.token       = getFieldValue(data, TOK_FIELD);
      try {
        await this.ensureCreds();
      } catch (e) {
        this._setError(e?.message || 'Could not ensure Journal credentials.');
      } finally {
        this.ready = true;
      }
    } else if (error) {
      this._setError('Could not load Journal fields.');
      this.ready = true;
    }
  }

  // Object info -> recordTypeId
  @wire(getObjectInfo, { objectApiName: SHARED_DOC_OBJECT })
  wiredObjInfo({ data }) {
    if (data) {
      this.recordTypeId = data.defaultRecordTypeId;
    }
  }

  // Picklist values by recordType (gets both controller + dependent data)
  @wire(getPicklistValuesByRecordType, { objectApiName: SHARED_DOC_OBJECT, recordTypeId: '$recordTypeId' })
  wiredPicklists({ data }) {
    if (!data) return;
    const pick = data.picklistFieldValues || {};
    const mu   = pick.Market_Unit__c;
    const dt   = pick.Document_Type__c;

    if (mu && dt) {
      this._pickMeta = {
        // IMPORTANT: controllerValues comes from the DEPENDENT field (Document_Type__c), not the controlling one.
        controllerValues: dt.controllerValues || {},
        // keep raw validFor (UI API returns an array of indexes; handle string for safety)
        docTypeValues: (dt.values || []).map(v => ({
          label: v.label,
          value: v.value,
          validFor: v.validFor
        }))
      };
      this._applyDocTypeOptionsToDocs();
    }
  }

  // Fetch Shared_Document__c list (via wrapper)
  @wire(getByJournal, { journalId: '$recordId' })
  wiredDocs(value) {
    this._wiredDocsResult = value;
    const { data, error } = value || {};
    if (data) {
      this.docs = this._normalizeDocs(data);
      this._applyDocTypeOptionsToDocs();
      this._tryAutoSetDocumentTypes();
    } else if (error) {
      // eslint-disable-next-line no-console
      console.warn('getByJournal failed', error);
    }
  }

  /* ========== Credential helper ========== */
  async ensureCreds() {
    if (this.extId && this.token) return;
    const res = await getOrCreateCreds({ journalId: this.recordId });
    this.extId = res?.externalId;
    this.token = res?.accessToken;
    if (!this.extId || !this.token) {
      throw new Error('Missing Journal auth fields after provisioning.');
    }
  }

  /* ========== Normalisation & helpers ========== */
  _formatDate(val) {
    if (!val) return '';
    try {
      // handle 'YYYY-MM-DD' and ISO strings
      const base = String(val).split('T')[0]; // YYYY-MM-DD
      const [yyyy, mm, dd] = base.split('-');
      if (yyyy && mm && dd) return `${dd.padStart(2,'0')}-${mm.padStart(2,'0')}-${yyyy}`;
      const d = new Date(val);
      if (isNaN(d)) return '';
      const DD = String(d.getDate()).padStart(2,'0');
      const MM = String(d.getMonth()+1).padStart(2,'0');
      const YYYY = d.getFullYear();
      return `${DD}-${MM}-${YYYY}`;
    } catch (_e) {
      return '';
    }
  }

  _normalizeDocs(list) {
    if (!Array.isArray(list)) return [];
    return list.map(r => {
      const id         = r.id;
      const name       = r.name;
      const version    = r.version;
      const status     = r.status;
      const isNewest   = r.isNewestVersion === true;
      const marketUnit = r.marketUnit;
      const docType    = r.documentType;

      const sent  = r.sentDate;
      const first = r.firstViewed;
      const last  = r.lastViewed;

      return {
        id,
        name,
        version,
        status,
        isNewest,
        marketUnit,
        docType,

        // activity dates + formatted
        sentDate: sent,
        firstViewed: first,
        lastViewed: last,
        sentFmt:  this._formatDate(sent),
        firstFmt: this._formatDate(first),
        lastFmt:  this._formatDate(last),
        hasActivity: !!(sent || first || last),

        statusBadgeClass: this._statusBadgeClass(status),
        docTypeOptions: [],
        docTypeOptionsDisabled: !this._pickMeta,
        flashSaved: false
      };
    });
  }

  _statusBadgeClass(status) {
    const s = (status || '').toLowerCase();
    if (s === 'draft')       return 'slds-badge badge-draft';
    if (s === 'sent')        return 'slds-badge badge-sent';
    if (s === 'viewed')      return 'slds-badge badge-viewed';
    if (s === 'approved')    return 'slds-badge badge-approved';
    if (s === 'superseded')  return 'slds-badge badge-superseded';
    return 'slds-badge';
  }

  _applyDocTypeOptionsToDocs() {
    if (!this._pickMeta || !Array.isArray(this.docs)) return;
    const next = this.docs.map(d => ({
      ...d,
      docTypeOptions: this._getDocTypeOptionsFor(d.marketUnit),
      docTypeOptionsDisabled: false
    }));
    this.docs = next;
  }

  // validFor helper: supports array of indices or base64 bitset
  _isValidFor(validFor, key) {
    if (key === undefined || key === null) return false;
    if (Array.isArray(validFor)) {
      return validFor.includes(key);
    }
    if (typeof validFor === 'string') {
      try {
        const bytes = atob(validFor); // base64 decode
        const byteIndex = Math.floor(key / 8);
        const bit = 1 << (key % 8);
        if (byteIndex >= bytes.length) return false;
        return (bytes.charCodeAt(byteIndex) & bit) !== 0;
      } catch (_e) {
        return false;
      }
    }
    return false;
  }

  _getDocTypeOptionsFor(marketUnit) {
    if (!this._pickMeta) return [];
    const { controllerValues, docTypeValues } = this._pickMeta;

    // If there is no Market Unit on the record or it isn't mapped, show no choices.
    if (!marketUnit || !(marketUnit in controllerValues)) {
      return [];
    }

    const key = controllerValues[marketUnit];

    return docTypeValues
      .filter(v => this._isValidFor(v.validFor, key))
      .map(v => ({ label: v.label, value: v.value }));
  }

  // Try to guess Document Type from filename – exact word match, case-insensitive
  _guessDocTypeFromName(name, options) {
    if (!name || !options?.length) return null;
    const lower = String(name).toLowerCase();
    for (const opt of options) {
      const needle = String(opt.label || opt.value || '').trim();
      if (!needle) continue;
      const nLower = needle.toLowerCase();
      const i = lower.indexOf(nLower);
      if (i < 0) continue;
      const before = lower[i - 1];
      const after  = lower[i + nLower.length];
      const leftOk  = (i === 0) || WORD_SEP.test(before || ' ');
      const rightOk = (i + nLower.length === lower.length) || WORD_END.test(after || ' ');
      if (leftOk && rightOk) return opt.value;
    }
    return null;
  }

  /* ========== Computed getters ========== */
  get newestDocs()  { return (this.docs || []).filter(d => d.isNewest === true); }
  get olderDocs()   { return (this.docs || []).filter(d => d.isNewest !== true); }
  get hasAnyDocs()  { return (this.docs || []).length > 0; }
  get newestTabLabel() {
    const n = this.newestDocs.length;
    return n ? `Newest (${n})` : 'Newest';
  }
  get olderTabLabel() {
    const n = this.olderDocs.length;
    return n ? `Older Versions (${n})` : 'Older Versions';
  }
  get latestSendoutLabel() {
    const arr = this.newestDocs.map(d => d.sentDate).filter(Boolean);
    if (!arr.length) return '—';
    // Strings in YYYY-MM-DD sort lexicographically; take max
    const latest = arr.sort().pop();
    return this._formatDate(latest);
  }

  /* ========== UI event handlers ========== */

  onTabActive(evt) {
    this.activeTab = evt?.detail?.value || 'newest';
  }

  onRefresh() {
    this._clearMessages();
    this.refreshDocs();
  }

  onPick(evt) {
    this.rows = [];
    this._clearMessages();
    const files = evt.target.files || [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      this.rows.push({
        id: `${Date.now()}-${i}`,
        name: f.name,
        file: f,
        status: 'Ready'
      });
    }
    this.disabled = this.rows.length === 0;
  }

  // Upload-to-S3 then create Draft documents
  async startUpload() {
    try {
      this._clearMessages();
      await this.ensureCreds();
      if (!this.rows.length) return;

      // ---- Enforce filename contains Journal Name (auto-number), case-insensitive
      const jn = String(this.journalName || '').toLowerCase();
      if (!jn) throw new Error('Journal name is missing.');
      const bad = this.rows.filter(r => !String(r.name || '').toLowerCase().includes(jn)).map(r => r.name);
      if (bad.length) {
        const msg = `Filnavn skal indeholde sagsnummeret "${this.journalName}". Ret venligst: ${bad.join(', ')}`;
        this._setError(msg);
        this._toast('Upload blokeret', msg, 'error');
        return;
      }

      /* ---------- 1) presign ---------- */
      this.rows.forEach(r => r.status = 'Requesting URL…');
      const presign = await this._fetchJson(UPLOAD_START_URL, {
        externalId: this.extId,
        accessToken: this.token,
        files: this.rows.map(r => ({
          name: r.name,
          size: r.file.size,
          type: r.file.type || 'application/pdf'
        }))
      });
      if (!presign.ok || !Array.isArray(presign.items)) {
        throw new Error(presign.error || 'upload-start failed');
      }
      presign.items.forEach((it, idx) => {
        Object.assign(this.rows[idx], {
          putUrl:      it.putUrl,
          key:         it.key,
          contentType: it.contentType || 'application/pdf',
          name:        it.fileName || this.rows[idx].name
        });
      });

      /* ---------- 2) PUT to S3 ---------- */
      for (const r of this.rows) {
        r.status = 'Uploading…';
        await fetch(r.putUrl, {
          method: 'PUT',
          headers: { 'Content-Type': r.contentType },
          body: r.file
        }).then(resp => {
          if (!resp.ok) throw new Error('S3 upload failed');
        });
        r.status = 'Uploaded';
      }

      /* ---------- 3) create Draft Shared_Document__c ---------- */
      const batch = this.rows.map(r => ({
        JournalId:     this.journalId || this.recordId,
        S3Key:         r.key,
        FileName:      r.name,
        InitialStatus: 'Draft'
      }));
      const results = await createForJournalBulk({ batch });
      if (!results || !results.length) throw new Error('Apex create failed');

      this._justCreatedIds = new Set(results.map(x => x.DocumentId));
      this.rows.forEach(r => r.status = 'Created');
      this._setSuccess(`Created ${this.rows.length} draft record(s).`);
      this.disabled = true;

      await this.refreshDocs();

      const fileInput = this.template.querySelector('lightning-input[type="file"]');
      if (fileInput) fileInput.value = null;
      this.rows = [];

    } catch (e) {
      // Reset any stuck statuses
      this.rows = this.rows.map(r => (r.status || '').startsWith('Requesting') ? { ...r, status: 'Ready' } : r);
      const msg = e?.message || 'Upload failed.';
      this._setError(msg);
      this._toast('Upload blokeret', msg, 'error');
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }

  // Delete a Shared Document
  async onDelete(event) {
    const id = event?.target?.dataset?.id;
    if (!id) return;
    // eslint-disable-next-line no-alert
    const ok = window.confirm('Delete this Shared Document? This cannot be undone.');
    if (!ok) return;
    try {
      this._clearMessages();
      await deleteRecord(id);
      this._setSuccess('Document deleted.');
      await this.refreshDocs();
    } catch (e) {
      const msg = e?.body?.message || e?.message || 'Delete failed.';
      this._setError(msg);
      this._toast('Fejl', msg, 'error');
    }
  }

  // Replace button pressed (only on Newest tab)
  onReplace(event) {
    const id = event?.target?.dataset?.id;
    if (!id) return;
    this._replaceTargetId = id;
    const input = this.template.querySelector('input[data-replace="true"]');
    if (input) {
      input.value = ''; // ensure change event fires even for same filename
      input.click();
    }
  }

  // File selected for Replace flow
  async onReplaceFilePicked(evt) {
    const file = evt?.target?.files?.[0];
    if (!file || !this._replaceTargetId) return;

    try {
      this._clearMessages();
      await this.ensureCreds();

      // ---- Enforce filename contains Journal Name on replace too
      const jn = String(this.journalName || '').toLowerCase();
      if (!jn) throw new Error('Journal name is missing.');
      if (!String(file.name || '').toLowerCase().includes(jn)) {
        const msg = `Filnavn skal indeholde sagsnummeret "${this.journalName}".`;
        this._setError(msg);
        this._toast('Upload blokeret', msg, 'error');
        return;
      }

      /* 1) presign single file */
      const presign = await this._fetchJson(UPLOAD_START_URL, {
        externalId: this.extId,
        accessToken: this.token,
        files: [{ name: file.name, size: file.size, type: file.type || 'application/pdf' }]
      });
      if (!presign.ok || !Array.isArray(presign.items) || !presign.items[0]) {
        throw new Error(presign.error || 'upload-start failed (replace)');
      }
      const it = presign.items[0];

      /* 2) PUT to S3 */
      await fetch(it.putUrl, {
        method: 'PUT',
        headers: { 'Content-Type': it.contentType || 'application/pdf' },
        body: file
      }).then(resp => {
        if (!resp.ok) throw new Error('S3 upload failed (replace)');
      });

      /* 3) Apex: create new Draft version */
      await replaceSharedDocument({
        docId:       this._replaceTargetId,
        newS3Key:    it.key,
        newFileName: it.fileName || file.name
      });

      await this.refreshDocs();
      this._setSuccess('Replaced with a new Draft version.');
    } catch (e) {
      const msg = e?.message || 'Replace failed.';
      this._setError(msg);
      this._toast('Fejl', msg, 'error');
    } finally {
      this._replaceTargetId = null;
    }
  }

  /* ========== Doc Type: change + auto-set after create ========== */

  async onDocTypeChange(evt) {
    const id = evt?.target?.dataset?.id;
    const value = evt?.detail?.value;
    if (!id) return;
    try {
      await updateRecord({ fields: { Id: id, Document_Type__c: value } });
      this.docs = this.docs.map(d => d.id === id ? { ...d, docType: value } : d);
      this._flashTypeSaved(id); // tiny success flash
      this._setSuccess('Document type updated.');
    } catch (e) {
      const msg = e?.body?.message || e?.message || 'Could not update Document Type.';
      this._setError(msg);
      this._toast('Fejl', msg, 'error');
      await this.refreshDocs();
    }
  }

  _flashTypeSaved(id) {
    // show
    this.docs = this.docs.map(d => d.id === id ? { ...d, flashSaved: true } : d);
    // hide after ~1.1s (matches CSS animation)
    window.setTimeout(() => {
      // if component is still around
      this.docs = this.docs.map(d => d.id === id ? { ...d, flashSaved: false } : d);
    }, 1100);
  }

  async _tryAutoSetDocumentTypes() {
    if (!this._justCreatedIds || this._justCreatedIds.size === 0 || !this._pickMeta) return;

    const updates = [];
    for (const d of this.docs) {
      if (!this._justCreatedIds.has(d.id)) continue;
      if (d.docType) continue;
      const options = this._getDocTypeOptionsFor(d.marketUnit);
      const guess = this._guessDocTypeFromName(d.name, options);
      if (guess) {
        updates.push(
          updateRecord({ fields: { Id: d.id, Document_Type__c: guess } })
            .then(() => { d.docType = guess; })
            .catch(() => { /* ignore */ })
        );
      }
    }
    if (updates.length) {
      try {
        await Promise.allSettled(updates);
        this._setSuccess('Set document type from filename for new document(s).');
      } finally {
        await this.refreshDocs();
      }
    }
    this._justCreatedIds.clear();
  }

  /* ========== helper utilities ========== */

  async _fetchJson(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(j?.error || 'Server error');
    }
    return j;
  }

  async refreshDocs() {
    if (this._wiredDocsResult) {
      await refreshApex(this._wiredDocsResult);
    }
  }

  _toast(title, message, variant = 'info') {
    this.dispatchEvent(new ShowToastEvent({ title, message, variant, mode: 'sticky' }));
  }

  _clearMessages() {
    this.messageSuccess = '';
    this.messageError   = '';
  }
  _setSuccess(msg) {
    this.messageSuccess = msg;
    this.messageError   = '';
  }
  _setError(msg) {
    this.messageError   = msg;
    this.messageSuccess = '';
  }
}