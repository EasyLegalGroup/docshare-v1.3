/**
 * Batch class to normalize existing Account phone numbers.
 * Finds all Accounts with incorrectly formatted phone numbers and normalizes them.
 * 
 * Usage:
 * AccountPhoneBatchNormalizer batch = new AccountPhoneBatchNormalizer();
 * Database.executeBatch(batch, 200);
 */
public class AccountPhoneBatchNormalizer implements Database.Batchable<SObject> {
    
    public Database.QueryLocator start(Database.BatchableContext bc) {
        // Query all Accounts where phone doesn't match E.164 format
        // E.164 format: starts with + followed by only digits
        // This will catch: spaces, -, (, ), missing +, etc.
        return Database.getQueryLocator([
            SELECT Id, Phone, Spouse_Phone__pc, Market_Unit__c, IsPersonAccount
            FROM Account
            WHERE Phone != null 
               OR Spouse_Phone__pc != null
        ]);
    }
    
    public void execute(Database.BatchableContext bc, List<Account> scope) {
        List<Account> accountsToUpdate = new List<Account>();
        
        for (Account acc : scope) {
            Boolean needsUpdate = false;
            Account updatedAcc = new Account(Id = acc.Id);
            
            // Normalize Phone if present
            if (String.isNotBlank(acc.Phone)) {
                String normalized = AccountPhoneNormalizer.normalizePhonePublic(acc.Phone, acc.Market_Unit__c);
                if (normalized != acc.Phone) {
                    updatedAcc.Phone = normalized;
                    needsUpdate = true;
                }
            }
            
            // Normalize Spouse_Phone__pc if present (Person Accounts only)
            if (acc.IsPersonAccount && String.isNotBlank(acc.Spouse_Phone__pc)) {
                String normalized = AccountPhoneNormalizer.normalizePhonePublic(acc.Spouse_Phone__pc, acc.Market_Unit__c);
                if (normalized != acc.Spouse_Phone__pc) {
                    updatedAcc.Spouse_Phone__pc = normalized;
                    needsUpdate = true;
                }
            }
            
            if (needsUpdate) {
                accountsToUpdate.add(updatedAcc);
            }
        }
        
        if (!accountsToUpdate.isEmpty()) {
            update accountsToUpdate;
        }
    }
    
    public void finish(Database.BatchableContext bc) {
        // Batch processing complete
    }
}
