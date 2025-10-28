/**
 * Trigger to normalize phone numbers on Account records.
 * Runs asynchronously after insert/update to avoid DML issues.
 * Handles both Business Accounts (Phone) and Person Accounts (Phone + Spouse_Phone__pc).
 */
trigger AccountPhoneTrigger on Account (after insert, after update) {
    
    // Collect Account IDs that need phone normalization
    Set<Id> accountIdsToNormalize = new Set<Id>();
    
    for (Account acc : Trigger.new) {
        Boolean needsNormalization = false;
        
        // Check if Phone field has changed or exists
        if (Trigger.isInsert) {
            // Check regular Phone field
            if (String.isNotBlank(acc.Phone)) {
                needsNormalization = true;
            }
            // Check Spouse_Phone__pc for Person Accounts
            if (acc.IsPersonAccount && String.isNotBlank(acc.Spouse_Phone__pc)) {
                needsNormalization = true;
            }
        } else if (Trigger.isUpdate) {
            Account oldAcc = Trigger.oldMap.get(acc.Id);
            // Check if Phone changed
            if (acc.Phone != oldAcc.Phone) {
                needsNormalization = true;
            }
            // Check if Spouse_Phone__pc changed (Person Accounts only)
            if (acc.IsPersonAccount && acc.Spouse_Phone__pc != oldAcc.Spouse_Phone__pc) {
                needsNormalization = true;
            }
        }
        
        if (needsNormalization) {
            accountIdsToNormalize.add(acc.Id);
        }
    }
    
    // Execute async normalization if we have records to process
    if (!accountIdsToNormalize.isEmpty() && !System.isFuture() && !System.isBatch()) {
        System.enqueueJob(new AccountPhoneNormalizer(accountIdsToNormalize));
    }
}
