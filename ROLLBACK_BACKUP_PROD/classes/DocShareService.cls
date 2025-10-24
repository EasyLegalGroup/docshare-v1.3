public with sharing class DocShareService {
    // ---- Target object + field API names (edit if yours differ) ----
    private static final String OBJ_SHARED_DOC = 'Shared_Document__c';
    private static final String F_JOURNAL      = 'Journal__c';
    private static final String F_NAME         = 'Name';
    private static final String F_S3_KEY       = 'S3_Key__c';
    private static final String F_STATUS       = 'Status__c';
    private static final String F_VERSION      = 'Version__c';
    private static final String F_EXPIRATION   = 'Expiration_Date__c';
    private static final String F_IS_NEWEST    = 'Is_Newest_Version__c';

    // Fields surfaced to LWC / UI
    private static final String F_DOC_TYPE     = 'Document_Type__c';
    private static final String F_MARKET_UNIT  = 'Market_Unit__c';
    private static final String F_SENT_DATE    = 'Sent_Date__c';
    private static final String F_FIRST_VIEWED = 'First_Viewed__c';
    private static final String F_LAST_VIEWED  = 'Last_Viewed__c';

    // NEW guidance ack fields
    private static final String F_GUIDE_ACK    = 'Is_Guidance_Acknowledged__c';
    private static final String F_GUIDE_ACK_TS = 'Time_of_Guidance_Acknowledge__c';

    // ===== DTOs for LWC/Aura =====
    public class CreateForJournalRequest {
        @AuraEnabled public Id       JournalId      { get; set; }
        @AuraEnabled public String   S3Key          { get; set; }
        @AuraEnabled public String   FileName       { get; set; }       // optional; if blank, derived from S3Key
        @AuraEnabled public Integer  VersionNumber  { get; set; }       // optional (default 1)
        @AuraEnabled public Datetime Expiration     { get; set; }       // optional
        @AuraEnabled public String   InitialStatus  { get; set; }       // optional (default 'Draft')
        // Is_Newest_Version__c defaults to true on create
    }
    public class CreateForJournalResult {
        @AuraEnabled public Id DocumentId { get; set; }
    }

    /**
     * Ensure a filename fits into the Shared_Document__c.Name field while preserving
     * the journal identifier (typically at the end) and the file extension.
     * If trimming is required, we prefer keeping the right-hand side that includes
     * the journal name and insert a single ellipsis character (…)
     * between the kept prefix and suffix when space allows.
     */
    private static String safeFileName(String proposedName, String journalName) {
        String name = proposedName;
        if (String.isBlank(name)) return name;

    Integer maxLen = Schema.SObjectType.Shared_Document__c.fields.Name.getLength();
        if (name.length() <= maxLen) return name;

        // Split name into base and extension (last dot wins)
        Integer dot = name.lastIndexOf('.');
        String base = (dot != null && dot > 0) ? name.substring(0, dot) : name;
        String ext  = (dot != null && dot > 0) ? name.substring(dot)      : '';

        Integer allowedBaseLen = maxLen - ext.length();
        if (allowedBaseLen <= 0) {
            // Extension alone exceeds or equals the limit; keep the tail of the whole string
            return name.substring(Math.max(0, name.length() - maxLen));
        }

        // Nothing to do if base already fits
        if (base.length() <= allowedBaseLen) return base + ext;

        // Prefer to keep suffix that contains the journal name if present
        String baseLower = base.toLowerCase();
        String jnLower   = String.valueOf(journalName == null ? '' : journalName).toLowerCase();
        Integer idx = String.isBlank(jnLower) ? -1 : baseLower.lastIndexOf(jnLower);

        final String ELLIPSIS = '…';

        if (idx != null && idx >= 0) {
            Integer suffixStart = idx;
            // If the journal is usually wrapped like " (J-12345)", try to include the preceding "(" (and space if present)
            if (idx >= 1 && base.substring(idx - 1, idx) == '(') {
                suffixStart = idx - 1;
            } else if (idx >= 2 && base.substring(idx - 2, idx) == ' (') {
                suffixStart = idx - 2;
            }
            String suffix = base.substring(suffixStart); // from (optional) paren/journal occurrence to end
            if (suffix.length() >= allowedBaseLen) {
                // Not enough room for ellipsis or prefix, keep the rightmost allowed
                return suffix.substring(suffix.length() - allowedBaseLen) + ext;
            }
            Integer roomForPrefix = allowedBaseLen - suffix.length();
            // Prefer leaving space for an ellipsis if any prefix is trimmed
            if (idx > 0) {
                // We will include ellipsis where possible
                if (roomForPrefix > 1) {
                    Integer takePrefix = Math.min(idx, roomForPrefix - 1);
                    String prefix = base.substring(0, takePrefix);
                    return prefix + ELLIPSIS + suffix + ext;
                } else {
                    // No space for ellipsis; just take as much suffix as possible
                    return base.substring(base.length() - allowedBaseLen) + ext;
                }
            } else {
                // Journal is at the very beginning; trim from left only if needed
                return base.substring(0, allowedBaseLen) + ext;
            }
        } else {
            // Journal not found in name; keep rightmost part, add ellipsis if space
            if (allowedBaseLen > 1) {
                return ELLIPSIS + base.substring(base.length() - (allowedBaseLen - 1)) + ext;
            } else {
                return base.substring(base.length() - allowedBaseLen) + ext;
            }
        }
    }

    /**
     * Convenience creator: minimal arguments.
     */
    @AuraEnabled
    public static CreateForJournalResult createForJournalSimple(Id journalId, String s3Key, String fileName) {
        CreateForJournalRequest req = new CreateForJournalRequest();
        req.JournalId = journalId;
        req.S3Key     = s3Key;
        req.FileName  = fileName;
        return createForJournal(req);
    }

    /**
     * Full-featured create supporting version/status/expiration.
     * Defaults:
     *   - Status__c: 'Draft'
     *   - Version__c: 1 (if not provided)
     *   - Is_Newest_Version__c: true
     *   - Market_Unit__c: copied from related Journal__c (if present)
     */
    @AuraEnabled
    public static CreateForJournalResult createForJournal(CreateForJournalRequest req) {
        if (req == null || req.JournalId == null || String.isBlank(req.S3Key)) {
            throw new AuraHandledException('JournalId and S3Key are required.');
        }

        String nameToUse = String.isBlank(req.FileName) ? deriveNameFromKey(req.S3Key) : req.FileName;
        if (String.isBlank(nameToUse)) {
            nameToUse = 'Document ' + String.valueOf(Datetime.now().getTime());
        }

        Integer versionToUse = (req.VersionNumber == null) ? 1 : req.VersionNumber;
        String statusToUse   = String.isBlank(req.InitialStatus) ? 'Draft' : req.InitialStatus;

    // Fetch the journal's Name and Market Unit once
    Journal__c j = [SELECT Id, Name, Market_Unit__c FROM Journal__c WHERE Id = :req.JournalId];

        SObject doc = newSharedDoc();
        doc.put(F_JOURNAL, req.JournalId);
    // Ensure name fits field length while preserving journal tail and extension
    doc.put(F_NAME,    safeFileName(nameToUse, j != null ? j.Name : null));
        doc.put(F_S3_KEY,  req.S3Key);

        if (!String.isBlank(F_STATUS))    doc.put(F_STATUS,   statusToUse);
        if (!String.isBlank(F_VERSION))   doc.put(F_VERSION,  versionToUse);
        if (!String.isBlank(F_IS_NEWEST)) doc.put(F_IS_NEWEST, true);
        if (!String.isBlank(F_EXPIRATION) && req.Expiration != null) {
            doc.put(F_EXPIRATION, req.Expiration);
        }
        // NEW: stamp Market Unit from Journal
        if (!String.isBlank(F_MARKET_UNIT) && !String.isBlank(j.Market_Unit__c)) {
            doc.put(F_MARKET_UNIT, j.Market_Unit__c);
        }

        insert doc;

        CreateForJournalResult res = new CreateForJournalResult();
        res.DocumentId = (Id) doc.get('Id');
        return res;
    }

    /**
     * Bulk variant for LWC convenience.
     * Per-item defaults same as single create:
     *   - Status__c: 'Draft'
     *   - Version__c: 1 (if not provided)
     *   - Is_Newest_Version__c: true
     *   - Market_Unit__c: copied from related Journal__c (if present)
     */
    @AuraEnabled(cacheable=false)
    public static List<CreateForJournalResult> createForJournalBulk(List<CreateForJournalRequest> batch) {
        List<CreateForJournalResult> out = new List<CreateForJournalResult>();
        if (batch == null || batch.isEmpty()) return out;

        // Gather journalIds → market
        Set<Id> jIds = new Set<Id>();
        for (CreateForJournalRequest r : batch) {
            if (r == null || r.JournalId == null || String.isBlank(r.S3Key)) {
                throw new AuraHandledException('Each item requires JournalId and S3Key.');
            }
            jIds.add(r.JournalId);
        }
        Map<Id, Journal__c> journalsById = new Map<Id, Journal__c>([
            SELECT Id, Name, Market_Unit__c
            FROM Journal__c
            WHERE Id IN :jIds
        ]);

        List<SObject> toInsert = new List<SObject>();
        for (CreateForJournalRequest req : batch) {
            String nameToUse = String.isBlank(req.FileName) ? deriveNameFromKey(req.S3Key) : req.FileName;
            if (String.isBlank(nameToUse)) {
                nameToUse = 'Document ' + String.valueOf(Datetime.now().getTime());
            }

            Integer versionToUse = (req.VersionNumber == null) ? 1 : req.VersionNumber;
            String statusToUse   = String.isBlank(req.InitialStatus) ? 'Draft' : req.InitialStatus;

            SObject doc = newSharedDoc();
            doc.put(F_JOURNAL, req.JournalId);
            Journal__c j = journalsById.get(req.JournalId);
            doc.put(F_NAME,    safeFileName(nameToUse, j != null ? j.Name : null));
            doc.put(F_S3_KEY,  req.S3Key);

            if (!String.isBlank(F_STATUS))    doc.put(F_STATUS,   statusToUse);
            if (!String.isBlank(F_VERSION))   doc.put(F_VERSION,  versionToUse);
            if (!String.isBlank(F_IS_NEWEST)) doc.put(F_IS_NEWEST, true);
            if (!String.isBlank(F_EXPIRATION) && req.Expiration != null) {
                doc.put(F_EXPIRATION, req.Expiration);
            }
            // NEW: stamp market
            if (j != null && !String.isBlank(F_MARKET_UNIT) && !String.isBlank(j.Market_Unit__c)) {
                doc.put(F_MARKET_UNIT, j.Market_Unit__c);
            }

            toInsert.add(doc);
        }

        insert toInsert;

        for (SObject d : toInsert) {
            CreateForJournalResult r = new CreateForJournalResult();
            r.DocumentId = (Id) d.get('Id');
            out.add(r);
        }
        return out;
    }

    /**
     * Return docs for a Journal. Includes newest flag for the UI and extended fields.
     */
    @AuraEnabled(cacheable=true)
    public static List<Shared_Document__c> getDocsForJournal(Id journalId) {
        if (journalId == null) return new List<Shared_Document__c>();
        return [
            SELECT Id,
                   Name,
                   Version__c,
                   Status__c,
                   Is_Newest_Version__c,
                   Document_Type__c,
                   Market_Unit__c,
                   Sent_Date__c,
                   First_Viewed__c,
                   Last_Viewed__c,
                   S3_Key__c,
                   Is_Guidance_Acknowledged__c,
                   Time_of_Guidance_Acknowledge__c
            FROM Shared_Document__c
            WHERE Journal__c = :journalId
            ORDER BY Name
            LIMIT 500
        ];
    }

    /**
     * Replace / override an existing document by creating the next version.
     * Behavior:
     *  - Marks prior record Is_Newest_Version__c = false
     *  - Inserts a new record with Version__c = prior+1, Status__c = 'Draft', Is_Newest_Version__c = true
     *  - Keeps same Name unless a new file name is provided (fallback to name derived from S3 key)
     *  - Carries forward Market_Unit__c from the existing record (if any)
     */
    @AuraEnabled
    public static CreateForJournalResult replaceSharedDocument(Id docId, String newS3Key, String newFileName) {
        if (docId == null || String.isBlank(newS3Key)) {
            throw new AuraHandledException('docId and newS3Key are required.');
        }

    String soql = 'SELECT Id, ' + F_JOURNAL + ', ' + F_NAME + ', ' + F_VERSION +
              ', ' + F_MARKET_UNIT +
                      ' FROM ' + OBJ_SHARED_DOC +
                      ' WHERE Id = :docId FOR UPDATE';
        SObject current = Database.query(soql);

        Integer currVersion = 0;
        if (!String.isBlank(F_VERSION)) {
            Object v = current.get(F_VERSION);
            currVersion = (v == null) ? 0 : Integer.valueOf(String.valueOf(v));
        }
        Integer nextVersion = currVersion + 1;

        String existingName = (String) current.get(F_NAME);
        String nameToUse = !String.isBlank(newFileName) ? newFileName
                        : !String.isBlank(existingName) ? existingName
                        : deriveNameFromKey(newS3Key);
        if (String.isBlank(nameToUse)) {
            nameToUse = 'Document ' + String.valueOf(Datetime.now().getTime());
        }

        // Fetch journal name to help preserve its suffix when trimming
        Id journalId = (Id) current.get(F_JOURNAL);
        String journalName = null;
        if (journalId != null) {
            for (Journal__c jx : [SELECT Id, Name FROM Journal__c WHERE Id = :journalId]) {
                journalName = jx.Name;
            }
        }

        // 1) mark current record as not newest
        if (!String.isBlank(F_IS_NEWEST)) {
            current.put(F_IS_NEWEST, false);
        }
        update current;

        // 2) insert new record as the next version
        SObject next = newSharedDoc();
        next.put(F_JOURNAL, current.get(F_JOURNAL));
    next.put(F_NAME,    safeFileName(nameToUse, journalName));
        next.put(F_S3_KEY,  newS3Key);

        if (!String.isBlank(F_STATUS))    next.put(F_STATUS, 'Draft');
        if (!String.isBlank(F_VERSION))   next.put(F_VERSION, nextVersion);
        if (!String.isBlank(F_IS_NEWEST)) next.put(F_IS_NEWEST, true);

        // Carry forward market unit if present on current
        Object mu = current.get(F_MARKET_UNIT);
        if (mu != null && !String.isBlank(String.valueOf(mu))) {
            next.put(F_MARKET_UNIT, String.valueOf(mu));
        }

        insert next;

        CreateForJournalResult res = new CreateForJournalResult();
        res.DocumentId = (Id) next.get('Id');
        return res;
    }

    // ===== helpers =====
    private static String deriveNameFromKey(String key) {
        if (String.isBlank(key)) return null;
        List<String> parts = key.split('/');
        String last = parts.isEmpty() ? key : parts[parts.size() - 1];
        return String.isBlank(last) ? null : last;
    }

    private static SObject newSharedDoc() {
        Schema.SObjectType t = Schema.getGlobalDescribe().get(OBJ_SHARED_DOC);
        if (t == null) {
            throw new AuraHandledException('Object not found: ' + OBJ_SHARED_DOC);
        }
        return t.newSObject();
    }
}