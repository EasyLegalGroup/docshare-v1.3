public with sharing class ClientImpersonationService {
    
    @AuraEnabled
    public static ImpersonationResult createImpersonation(Id journalId, Boolean allowApprove, Integer expiryHours) {
        ImpersonationResult result = new ImpersonationResult();
        result.success = false;
        
        try {
            // Validate input
            if (journalId == null) {
                result.errorMessage = 'Journal ID is required';
                return result;
            }
            
            // Fetch journal
            Journal__c journal = [
                SELECT Id, Name, Market_Unit__c
                FROM Journal__c 
                WHERE Id = :journalId 
                LIMIT 1
            ];
            
            // SECURITY: Invalidate ALL existing active impersonation records created by this user
            // Enforces one active link per user maximum (across all journals)
            List<Client_Impersonation__c> existingImpersonations = [
                SELECT Id, Used_At__c, Is_Revoked__c
                FROM Client_Impersonation__c
                WHERE CreatedById = :UserInfo.getUserId()
                  AND Expires_At__c > :System.now()
                  AND Used_At__c = null
                  AND Is_Revoked__c = false
            ];
            
            if (!existingImpersonations.isEmpty()) {
                // Mark them as revoked
                for (Client_Impersonation__c existing : existingImpersonations) {
                    existing.Is_Revoked__c = true;
                }
                update existingImpersonations;
            }
            
            // Generate secure token (64 hex chars)
            Blob tokenBlob = Crypto.generateAesKey(256);
            String token = EncodingUtil.convertToHex(tokenBlob).substring(0, 64);
            
            // Calculate expiry
            Integer hours = (expiryHours != null && expiryHours > 0) ? expiryHours : 2;
            
            // Create Client_Impersonation__c record
            Client_Impersonation__c impersonation = new Client_Impersonation__c(
                Token__c = token,
                Journal__c = journal.Id,
                Allow_Approve__c = (allowApprove != null ? allowApprove : false),
                Expires_At__c = System.now().addHours(hours)
            );
            
            insert impersonation;
            
            // Build URL based on org and Market_Unit__c
            String baseUrl = detectBrandUrl(journal.Market_Unit__c);
            
            // Add impersonation parameter (use & if baseUrl already has parameters)
            String separator = baseUrl.contains('?') ? '&' : '?';
            String impersonationUrl = baseUrl + separator + 'impersonate=' + token;
            
            // Populate success response
            result.success = true;
            result.token = token;
            result.url = impersonationUrl;
            result.journalName = journal.Name;
            result.expiresAt = impersonation.Expires_At__c;
            
        } catch (Exception e) {
            result.errorMessage = 'Error: ' + e.getMessage();
        }
        
        return result;
    }
    
    private static String detectBrandUrl(String marketUnit) {
        // Check if running in production org
        String orgId = UserInfo.getOrganizationId();
        Boolean isProduction = (orgId == '00D1t000000w9f2EAA');
        
        if (isProduction) {
            // Production URLs
            String mu = String.isNotBlank(marketUnit) ? marketUnit.trim() : '';
            
            if (mu == 'DFJ_DK' || String.isBlank(mu)) {
                return 'https://dok.dinfamiliejurist.dk';
            } else if (mu == 'FA_SE') {
                return 'https://dok.dinfamiljejurist.se';
            } else if (mu == 'Ireland') {
                return 'https://docs.hereslaw.ie';
            }
            
            // Default to DK production
            return 'https://dok.dinfamiliejurist.dk';
        } else {
            // Test environment - use S3 test bucket with brand parameter
            String mu = String.isNotBlank(marketUnit) ? marketUnit.trim() : '';
            String brand = 'dk'; // default
            
            if (mu == 'FA_SE') {
                brand = 'se';
            } else if (mu == 'Ireland') {
                brand = 'ie';
            }
            
            return 'http://dfj-docs-test.s3-website.eu-north-1.amazonaws.com/?brand=' + brand;
        }
    }
    
    public class ImpersonationResult {
        @AuraEnabled public Boolean success;
        @AuraEnabled public String token;
        @AuraEnabled public String url;
        @AuraEnabled public String journalName;
        @AuraEnabled public DateTime expiresAt;
        @AuraEnabled public String errorMessage;
    }
}
