public with sharing class DocShare_Query {

    public class DocRow {
        @AuraEnabled public Id      id;
        @AuraEnabled public String  name;
        @AuraEnabled public Integer version;
        @AuraEnabled public String  status;
        @AuraEnabled public String  s3Key;
        @AuraEnabled public Boolean isNewestVersion;

        // NEW: more surfaced fields
        @AuraEnabled public String   documentType;
        @AuraEnabled public String   marketUnit;
        @AuraEnabled public Date     sentDate;
        @AuraEnabled public Datetime firstViewed;
        @AuraEnabled public Datetime lastViewed;
        @AuraEnabled public Boolean  isGuidanceAcknowledged;
        @AuraEnabled public Datetime timeOfGuidanceAcknowledge;
    }

    @AuraEnabled(cacheable=true)
    public static List<DocRow> getByJournal(Id journalId) {
        if (journalId == null) {
            return new List<DocRow>();
        }

        List<Shared_Document__c> rows = [
            SELECT Id,
                   Name,
                   Version__c,
                   Status__c,
                   S3_Key__c,
                   Is_Newest_Version__c,
                   Document_Type__c,
                   Market_Unit__c,
                   Sent_Date__c,
                   First_Viewed__c,
                   Last_Viewed__c,
                   Is_Guidance_Acknowledged__c,
                   Time_of_Guidance_Acknowledge__c
            FROM Shared_Document__c
            WHERE Journal__c = :journalId
            ORDER BY Name
            LIMIT 500
        ];

        List<DocRow> out = new List<DocRow>();
        for (Shared_Document__c r : rows) {
            DocRow d = new DocRow();
            d.id               = r.Id;
            d.name             = r.Name;
            d.version          = (r.Version__c != null) ? r.Version__c.intValue() : null;
            d.status           = r.Status__c;
            d.s3Key            = r.S3_Key__c;
            d.isNewestVersion  = r.Is_Newest_Version__c;

            // NEW mappings
            d.documentType              = r.Document_Type__c;
            d.marketUnit                = r.Market_Unit__c;
            d.sentDate                  = r.Sent_Date__c;
            d.firstViewed               = r.First_Viewed__c;
            d.lastViewed                = r.Last_Viewed__c;
            d.isGuidanceAcknowledged    = r.Is_Guidance_Acknowledged__c;
            d.timeOfGuidanceAcknowledge = r.Time_of_Guidance_Acknowledge__c;

            out.add(d);
        }
        return out;
    }
}