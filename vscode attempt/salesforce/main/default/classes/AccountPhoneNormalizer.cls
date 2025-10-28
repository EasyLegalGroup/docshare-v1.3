/**
 * Queueable class to normalize Account phone numbers asynchronously.
 * Matches the logic from Lambda's normalize_phone_basic() function.
 */
public class AccountPhoneNormalizer implements Queueable {
    
    private Set<Id> accountIds;
    
    public AccountPhoneNormalizer(Set<Id> accountIds) {
        this.accountIds = accountIds;
    }
    
    public void execute(QueueableContext context) {
        // Query accounts that need normalization
        List<Account> accountsToUpdate = [
            SELECT Id, Phone, Spouse_Phone__pc, Market_Unit__c
            FROM Account
            WHERE Id IN :accountIds
        ];
        
        List<Account> updates = new List<Account>();
        
        for (Account acc : accountsToUpdate) {
            Boolean needsUpdate = false;
            Account updatedAcc = new Account(Id = acc.Id);
            
            // Normalize Phone field
            if (String.isNotBlank(acc.Phone)) {
                String normalized = normalizePhone(acc.Phone, acc.Market_Unit__c);
                if (normalized != acc.Phone) {
                    updatedAcc.Phone = normalized;
                    needsUpdate = true;
                }
            }
            
            // Normalize Spouse_Phone__pc field
            if (String.isNotBlank(acc.Spouse_Phone__pc)) {
                String normalized = normalizePhone(acc.Spouse_Phone__pc, acc.Market_Unit__c);
                if (normalized != acc.Spouse_Phone__pc) {
                    updatedAcc.Spouse_Phone__pc = normalized;
                    needsUpdate = true;
                }
            }
            
            if (needsUpdate) {
                updates.add(updatedAcc);
            }
        }
        
        // Update records without re-triggering (will still fire trigger but won't queue again)
        if (!updates.isEmpty()) {
            update updates;
        }
    }
    
    /**
     * Normalize phone number to E.164 format: +[CountryCode][Number]
     * Industry best practice: Preserve existing country codes, use Market_Unit as fallback.
     * 
     * Steps:
     * 1. Strip all formatting characters (keep only digits and +)
     * 2. Convert 00 prefix to +
     * 3. If has country code (+), clean leading zeros after it
     * 4. If no country code, detect from number length + prefix
     * 5. Use Market_Unit as fallback for local numbers only
     * 
     * Result: Always returns + followed by digits only
     */
    public static String normalizePhonePublic(String raw, String marketUnit) {
        return normalizePhone(raw, marketUnit);
    }
    
    private static String normalizePhone(String raw, String marketUnit) {
        if (String.isBlank(raw)) {
            return raw;
        }
        
        // Step 1: Strip all non-digit characters except +
        String s = raw.trim();
        String cleaned = '';
        Boolean hasPlus = false;
        
        for (Integer i = 0; i < s.length(); i++) {
            String ch = s.substring(i, i + 1);
            if (ch >= '0' && ch <= '9') {
                cleaned += ch;
            } else if (ch == '+' && i == 0) {
                hasPlus = true;
            }
            // All other characters (spaces, -, (, ), etc.) are ignored
        }
        
        s = cleaned;
        
        // Step 2: Convert 00 prefix to + (international dialing prefix)
        if (!hasPlus && s.startsWith('00')) {
            s = s.substring(2);
            hasPlus = true;
        }
        
        // Step 3: If has + prefix, preserve country code but remove leading zero after it
        if (hasPlus && s.length() > 3) {
            // Danish: +45 0XX... -> +45 XX...
            if (s.substring(0, 2) == '45' && s.substring(2, 3) == '0') {
                s = s.substring(0, 2) + s.substring(3);
            }
            // Swedish: +46 0XX... -> +46 XX...
            else if (s.substring(0, 2) == '46' && s.substring(2, 3) == '0') {
                s = s.substring(0, 2) + s.substring(3);
            }
            // Irish: +353 0XX... -> +353 XX...
            else if (s.length() > 4 && s.substring(0, 3) == '353' && s.substring(3, 4) == '0') {
                s = s.substring(0, 3) + s.substring(4);
            }
            
            // Return with + prefix
            return '+' + s;
        }
        
        // Step 4: No + prefix - try to detect country code from number itself
        if (s.startsWith('45') && s.length() == 10) {
            // Danish format: 45 + 8 digits
            return '+' + s;
        } else if (s.startsWith('46') && s.length() == 11) {
            // Swedish format: 46 + 9 digits
            return '+' + s;
        } else if (s.startsWith('353') && (s.length() == 12 || s.length() == 13)) {
            // Irish format: 353 + 9-10 digits
            return '+' + s;
        }
        
        // Step 5: Remove leading zeros from local numbers
        while (s.startsWith('0') && s.length() > 1) {
            s = s.substring(1);
        }
        
        // Step 6: Use Market_Unit as fallback for local numbers without country code
        if (String.isNotBlank(marketUnit)) {
            if (marketUnit == 'DFJ_DK' || marketUnit == 'Testamente_DK') {
                // Danish local numbers are 8 digits
                if (s.length() == 8) {
                    return '+45' + s;
                }
            } else if (marketUnit == 'FA_SE') {
                // Swedish local numbers are 9 digits (7-10 without leading 0)
                if (s.length() >= 7 && s.length() <= 10) {
                    return '+46' + s;
                }
            } else if (marketUnit == 'Ireland') {
                // Irish local numbers are 9-10 digits
                if (s.length() >= 9 && s.length() <= 10) {
                    return '+353' + s;
                }
            }
        }
        
        // Step 7: If we still have digits but couldn't determine country, return with +
        if (s.length() > 0) {
            return '+' + s;
        }
        
        // Return original if completely invalid
        return raw;
    }
}
