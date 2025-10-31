@isTest
private class ClientImpersonationServiceTest {
    
    @TestSetup
    static void setup() {
        // Create test journals for different market units
        Journal__c journalDK = new Journal__c(
            Market_Unit__c = 'DFJ_DK'
        );
        insert journalDK;
        
        Journal__c journalSE = new Journal__c(
            Market_Unit__c = 'FA_SE'
        );
        insert journalSE;
        
        Journal__c journalIE = new Journal__c(
            Market_Unit__c = 'Ireland'
        );
        insert journalIE;
    }
    
    @isTest
    static void testCreateImpersonation_Success() {
        Journal__c journal = [SELECT Id, Name FROM Journal__c WHERE Market_Unit__c = 'DFJ_DK' LIMIT 1];
        
        Test.startTest();
        ClientImpersonationService.ImpersonationResult result = 
            ClientImpersonationService.createImpersonation(journal.Id, true, 2);
        Test.stopTest();
        
        // Verify success
        System.assertEquals(true, result.success, 'Should succeed. Error: ' + result.errorMessage);
        System.assertNotEquals(null, result.token, 'Token should be generated');
        System.assertEquals(64, result.token.length(), 'Token should be 64 characters');
        System.assertNotEquals(null, result.url, 'URL should be generated');
        System.assertEquals(journal.Name, result.journalName, 'Journal name should match');
        System.assertNotEquals(null, result.expiresAt, 'Expiry should be set');
        
        // Verify record was created
        List<Client_Impersonation__c> impersonations = [
            SELECT Id, Token__c, Journal__c, Allow_Approve__c, Expires_At__c, Used_At__c, Is_Revoked__c
            FROM Client_Impersonation__c
            WHERE Journal__c = :journal.Id
        ];
        System.assertEquals(1, impersonations.size(), 'Should create one record');
        System.assertEquals(result.token, impersonations[0].Token__c, 'Token should match');
        System.assertEquals(true, impersonations[0].Allow_Approve__c, 'Allow approve should be true');
        System.assertEquals(null, impersonations[0].Used_At__c, 'Should not be used yet');
        System.assertEquals(false, impersonations[0].Is_Revoked__c, 'Should not be revoked');
    }
    
    @isTest
    static void testCreateImpersonation_NullJournalId() {
        Test.startTest();
        ClientImpersonationService.ImpersonationResult result = 
            ClientImpersonationService.createImpersonation(null, false, 2);
        Test.stopTest();
        
        System.assertEquals(false, result.success, 'Should fail with null journal');
        System.assertEquals('Journal ID is required', result.errorMessage, 'Should have error message');
    }
    
    @isTest
    static void testCreateImpersonation_CustomExpiry() {
        Journal__c journal = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'DFJ_DK' LIMIT 1];
        
        Test.startTest();
        ClientImpersonationService.ImpersonationResult result = 
            ClientImpersonationService.createImpersonation(journal.Id, false, 24);
        Test.stopTest();
        
        System.assertEquals(true, result.success, 'Should succeed');
        
        // Verify expiry is approximately 24 hours from now
        Client_Impersonation__c record = [
            SELECT Expires_At__c 
            FROM Client_Impersonation__c 
            WHERE Token__c = :result.token
        ];
        
        Long hoursDiff = (record.Expires_At__c.getTime() - System.now().getTime()) / (1000 * 60 * 60);
        System.assert(hoursDiff >= 23 && hoursDiff <= 24, 'Expiry should be ~24 hours');
    }
    
    @isTest
    static void testCreateImpersonation_DefaultExpiry() {
        Journal__c journal = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'DFJ_DK' LIMIT 1];
        
        Test.startTest();
        ClientImpersonationService.ImpersonationResult result = 
            ClientImpersonationService.createImpersonation(journal.Id, false, null);
        Test.stopTest();
        
        System.assertEquals(true, result.success, 'Should succeed');
        
        // Verify default expiry is 2 hours
        Client_Impersonation__c record = [
            SELECT Expires_At__c 
            FROM Client_Impersonation__c 
            WHERE Token__c = :result.token
        ];
        
        Long hoursDiff = (record.Expires_At__c.getTime() - System.now().getTime()) / (1000 * 60 * 60);
        System.assert(hoursDiff >= 1 && hoursDiff <= 2, 'Default expiry should be ~2 hours');
    }
    
    @isTest
    static void testCreateImpersonation_RevokePreviousLinks() {
        Journal__c journalA = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'DFJ_DK' LIMIT 1];
        Journal__c journalB = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'FA_SE' LIMIT 1];
        
        Test.startTest();
        
        // Create first link for Journal A
        ClientImpersonationService.ImpersonationResult result1 = 
            ClientImpersonationService.createImpersonation(journalA.Id, false, 2);
        System.assertEquals(true, result1.success, 'First link should succeed');
        
        // Create second link for Journal B (should revoke first link)
        ClientImpersonationService.ImpersonationResult result2 = 
            ClientImpersonationService.createImpersonation(journalB.Id, false, 2);
        System.assertEquals(true, result2.success, 'Second link should succeed');
        
        Test.stopTest();
        
        // Verify first link is revoked
        Client_Impersonation__c firstLink = [
            SELECT Is_Revoked__c, Used_At__c
            FROM Client_Impersonation__c
            WHERE Token__c = :result1.token
        ];
        System.assertEquals(true, firstLink.Is_Revoked__c, 'First link should be revoked');
        System.assertEquals(null, firstLink.Used_At__c, 'First link should not be marked as used');
        
        // Verify second link is active
        Client_Impersonation__c secondLink = [
            SELECT Is_Revoked__c, Used_At__c
            FROM Client_Impersonation__c
            WHERE Token__c = :result2.token
        ];
        System.assertEquals(false, secondLink.Is_Revoked__c, 'Second link should be active');
        System.assertEquals(null, secondLink.Used_At__c, 'Second link should not be used');
    }
    
    @isTest
    static void testCreateImpersonation_RevokeMultiplePreviousLinks() {
        Journal__c journalA = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'DFJ_DK' LIMIT 1];
        Journal__c journalB = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'FA_SE' LIMIT 1];
        Journal__c journalC = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'Ireland' LIMIT 1];
        
        Test.startTest();
        
        // Create three links for different journals
        ClientImpersonationService.ImpersonationResult result1 = 
            ClientImpersonationService.createImpersonation(journalA.Id, false, 2);
        
        ClientImpersonationService.ImpersonationResult result2 = 
            ClientImpersonationService.createImpersonation(journalB.Id, false, 2);
        
        ClientImpersonationService.ImpersonationResult result3 = 
            ClientImpersonationService.createImpersonation(journalC.Id, false, 2);
        
        Test.stopTest();
        
        // Verify first two links are revoked
        List<Client_Impersonation__c> revokedLinks = [
            SELECT Token__c, Is_Revoked__c
            FROM Client_Impersonation__c
            WHERE Token__c IN (:result1.token, :result2.token)
            ORDER BY CreatedDate
        ];
        System.assertEquals(2, revokedLinks.size(), 'Should have two revoked links');
        System.assertEquals(true, revokedLinks[0].Is_Revoked__c, 'First link should be revoked');
        System.assertEquals(true, revokedLinks[1].Is_Revoked__c, 'Second link should be revoked');
        
        // Verify third link is active
        Client_Impersonation__c activeLink = [
            SELECT Is_Revoked__c
            FROM Client_Impersonation__c
            WHERE Token__c = :result3.token
        ];
        System.assertEquals(false, activeLink.Is_Revoked__c, 'Third link should be active');
    }
    
    @isTest
    static void testCreateImpersonation_DoesNotRevokeUsedLinks() {
        Journal__c journalA = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'DFJ_DK' LIMIT 1];
        Journal__c journalB = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'FA_SE' LIMIT 1];
        
        // Create first link
        ClientImpersonationService.ImpersonationResult result1 = 
            ClientImpersonationService.createImpersonation(journalA.Id, false, 2);
        
        // Manually mark first link as used (simulate Lambda marking it used)
        Client_Impersonation__c firstLink = [
            SELECT Id 
            FROM Client_Impersonation__c 
            WHERE Token__c = :result1.token
        ];
        firstLink.Used_At__c = System.now();
        update firstLink;
        
        Test.startTest();
        
        // Create second link (should NOT revoke first link since it's already used)
        ClientImpersonationService.ImpersonationResult result2 = 
            ClientImpersonationService.createImpersonation(journalB.Id, false, 2);
        
        Test.stopTest();
        
        // Verify first link is NOT revoked (because it was already used)
        Client_Impersonation__c firstLinkAfter = [
            SELECT Is_Revoked__c, Used_At__c
            FROM Client_Impersonation__c
            WHERE Token__c = :result1.token
        ];
        System.assertEquals(false, firstLinkAfter.Is_Revoked__c, 'Used link should not be revoked');
        System.assertNotEquals(null, firstLinkAfter.Used_At__c, 'Used link should still have Used_At__c');
        
        // Verify second link is active
        Client_Impersonation__c secondLink = [
            SELECT Is_Revoked__c
            FROM Client_Impersonation__c
            WHERE Token__c = :result2.token
        ];
        System.assertEquals(false, secondLink.Is_Revoked__c, 'Second link should be active');
    }
    
    @isTest
    static void testCreateImpersonation_DoesNotRevokeExpiredLinks() {
        Journal__c journalA = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'DFJ_DK' LIMIT 1];
        Journal__c journalB = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'FA_SE' LIMIT 1];
        
        // Create first link
        ClientImpersonationService.ImpersonationResult result1 = 
            ClientImpersonationService.createImpersonation(journalA.Id, false, 2);
        
        // Manually expire first link
        Client_Impersonation__c firstLink = [
            SELECT Id 
            FROM Client_Impersonation__c 
            WHERE Token__c = :result1.token
        ];
        firstLink.Expires_At__c = System.now().addHours(-1); // Already expired
        update firstLink;
        
        Test.startTest();
        
        // Create second link (should NOT try to revoke expired link)
        ClientImpersonationService.ImpersonationResult result2 = 
            ClientImpersonationService.createImpersonation(journalB.Id, false, 2);
        
        Test.stopTest();
        
        // Verify first link is still NOT revoked (query skipped it due to expiry)
        Client_Impersonation__c firstLinkAfter = [
            SELECT Is_Revoked__c
            FROM Client_Impersonation__c
            WHERE Token__c = :result1.token
        ];
        System.assertEquals(false, firstLinkAfter.Is_Revoked__c, 'Expired link should not be touched');
    }
    
    @isTest
    static void testUrlGeneration_ProductionDK() {
        // Note: This test checks URL generation based on org ID
        // In production org (00D1t000000w9f2EAA), uses production URLs
        // In sandbox/other orgs, uses test S3 URLs
        Journal__c journal = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'DFJ_DK' LIMIT 1];
        
        Test.startTest();
        ClientImpersonationService.ImpersonationResult result = 
            ClientImpersonationService.createImpersonation(journal.Id, false, 2);
        Test.stopTest();
        
        System.assertEquals(true, result.success, 'Should succeed');
        
        // Check if running in production org
        String orgId = UserInfo.getOrganizationId();
        if (orgId == '00D1t000000w9f2EAA') {
            // Production: should use production URL
            System.assert(result.url.contains('dok.dinfamiliejurist.dk'), 'Should use production DK URL');
        } else {
            // Sandbox: should use test S3 URL
            System.assert(result.url.contains('dfj-docs-test.s3-website'), 'Should use test S3 URL in sandbox');
            System.assert(result.url.contains('brand=dk'), 'Should include DK brand parameter');
        }
        System.assert(result.url.contains('impersonate='), 'Should include impersonate parameter');
        System.assert(!result.url.contains('??'), 'Should not have double question marks');
    }
    
    @isTest
    static void testUrlGeneration_ProductionSE() {
        Journal__c journal = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'FA_SE' LIMIT 1];
        
        Test.startTest();
        ClientImpersonationService.ImpersonationResult result = 
            ClientImpersonationService.createImpersonation(journal.Id, false, 2);
        Test.stopTest();
        
        System.assertEquals(true, result.success, 'Should succeed');
        
        // Check based on org
        String orgId = UserInfo.getOrganizationId();
        if (orgId == '00D1t000000w9f2EAA') {
            System.assert(result.url.contains('dok.dinfamiljejurist.se'), 'Should use production SE URL');
        } else {
            System.assert(result.url.contains('brand=se'), 'Should include SE brand parameter');
        }
    }
    
    @isTest
    static void testUrlGeneration_ProductionIE() {
        Journal__c journal = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'Ireland' LIMIT 1];
        
        Test.startTest();
        ClientImpersonationService.ImpersonationResult result = 
            ClientImpersonationService.createImpersonation(journal.Id, false, 2);
        Test.stopTest();
        
        System.assertEquals(true, result.success, 'Should succeed');
        
        // Check based on org
        String orgId = UserInfo.getOrganizationId();
        if (orgId == '00D1t000000w9f2EAA') {
            System.assert(result.url.contains('docs.hereslaw.ie'), 'Should use production IE URL');
        } else {
            System.assert(result.url.contains('brand=ie'), 'Should include IE brand parameter');
        }
    }
    
    @isTest
    static void testUrlGeneration_ParameterSeparator() {
        Journal__c journal = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'DFJ_DK' LIMIT 1];
        
        Test.startTest();
        ClientImpersonationService.ImpersonationResult result = 
            ClientImpersonationService.createImpersonation(journal.Id, false, 2);
        Test.stopTest();
        
        // Verify no double question marks
        System.assertEquals(false, result.url.contains('??'), 'Should not have double question marks');
        
        // Verify has both brand and impersonate parameters
        Integer questionMarkCount = result.url.countMatches('?');
        System.assertEquals(1, questionMarkCount, 'Should have exactly one question mark');
        
        System.assert(result.url.contains('&impersonate=') || result.url.contains('?impersonate='), 
                     'Should have impersonate parameter with correct separator');
    }
    
    @isTest
    static void testAllowApprove_True() {
        Journal__c journal = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'DFJ_DK' LIMIT 1];
        
        Test.startTest();
        ClientImpersonationService.ImpersonationResult result = 
            ClientImpersonationService.createImpersonation(journal.Id, true, 2);
        Test.stopTest();
        
        Client_Impersonation__c record = [
            SELECT Allow_Approve__c 
            FROM Client_Impersonation__c 
            WHERE Token__c = :result.token
        ];
        System.assertEquals(true, record.Allow_Approve__c, 'Allow approve should be true');
    }
    
    @isTest
    static void testAllowApprove_False() {
        Journal__c journal = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'DFJ_DK' LIMIT 1];
        
        Test.startTest();
        ClientImpersonationService.ImpersonationResult result = 
            ClientImpersonationService.createImpersonation(journal.Id, false, 2);
        Test.stopTest();
        
        Client_Impersonation__c record = [
            SELECT Allow_Approve__c 
            FROM Client_Impersonation__c 
            WHERE Token__c = :result.token
        ];
        System.assertEquals(false, record.Allow_Approve__c, 'Allow approve should be false');
    }
    
    @isTest
    static void testAllowApprove_Null() {
        Journal__c journal = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'DFJ_DK' LIMIT 1];
        
        Test.startTest();
        ClientImpersonationService.ImpersonationResult result = 
            ClientImpersonationService.createImpersonation(journal.Id, null, 2);
        Test.stopTest();
        
        Client_Impersonation__c record = [
            SELECT Allow_Approve__c 
            FROM Client_Impersonation__c 
            WHERE Token__c = :result.token
        ];
        System.assertEquals(false, record.Allow_Approve__c, 'Allow approve should default to false');
    }
    
    @isTest
    static void testTokenUniqueness() {
        Journal__c journal = [SELECT Id FROM Journal__c WHERE Market_Unit__c = 'DFJ_DK' LIMIT 1];
        
        Test.startTest();
        
        // Create multiple tokens
        ClientImpersonationService.ImpersonationResult result1 = 
            ClientImpersonationService.createImpersonation(journal.Id, false, 2);
        ClientImpersonationService.ImpersonationResult result2 = 
            ClientImpersonationService.createImpersonation(journal.Id, false, 2);
        
        Test.stopTest();
        
        // Verify tokens are different
        System.assertNotEquals(result1.token, result2.token, 'Tokens should be unique');
    }
}
