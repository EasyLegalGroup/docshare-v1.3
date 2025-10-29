/**
 * Lightweight service that stores and retrieves ChatMessage__c
 * records tied to any parent entity (Parent_Record__c lookup).
 */
public with sharing class SimplifiedChatService {

    /* ------------------------------------------------------------------ *
     *  Retrieve up to 1 000 messages for a given record
     * ------------------------------------------------------------------ */
    @AuraEnabled(cacheable = true)
    public static List<ChatMessage__c> getMessages(String recordId) {
        try {
            return [
                SELECT Id,
                       Body__c,
                       Is_Inbound__c,
                       CreatedDate,
                       CreatedBy.Name,
                       CreatedById,
                       Message_Type__c,
                       AI_Model__c,
                       AI_Helpful__c,
                       AI_Escalated__c,
                       Original_Target__c,
                       Final_Target__c,
                       Target_Changed__c,
                       Escalated_From__c,
                       AI_Response_Time__c
                FROM   ChatMessage__c
                WHERE  Parent_Record__c = :recordId
                ORDER  BY CreatedDate ASC
                LIMIT  1000
            ];
        } catch (Exception e) {
            throw new AuraHandledException(
                'Error retrieving messages: ' + e.getMessage()
            );
        }
    }

    /* ------------------------------------------------------------------ *
     *  Persist a single ChatMessage__c and return the committed record
     * ------------------------------------------------------------------ */
    @AuraEnabled(cacheable = false)
    public static ChatMessage__c createMessage(
        String  body,
        String  recordId,
        Boolean isInbound
    ) {
        try {
            if (String.isBlank(body) || String.isBlank(recordId)) {
                throw new AuraHandledException(
                    'Message body and record ID are required.'
                );
            }

            ChatMessage__c msg = new ChatMessage__c(
                Body__c             = body,
                Parent_Record__c    = recordId,
                Is_Inbound__c       = isInbound,
                Has_Attachments__c  = false,
                Attachment_Count__c = 0,
                Message_Type__c     = isInbound ? null : 'Human'  // Outbound messages from LWC are written by humans
            );
            insert msg;

            // reload to include CreatedBy
            return [
                SELECT Id, Body__c, Is_Inbound__c,
                       CreatedDate, CreatedBy.Name, CreatedById
                FROM   ChatMessage__c
                WHERE  Id = :msg.Id
                LIMIT  1
            ];

        } catch (Exception e) {
            throw new AuraHandledException(
                'Error creating message: ' + e.getMessage()
            );
        }
    }
}