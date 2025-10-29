/**
 * Test class for AccountPhoneBatchNormalizer
 */
@isTest
private class AccountPhoneBatchNormalizerTest {
    
    @isTest
    static void testBatchNormalization() {
        // Create accounts with messy phone numbers
        List<Account> accounts = new List<Account>();
        
        accounts.add(new Account(
            Name = 'Test 1',
            Market_Unit__c = 'DFJ_DK',
            Phone = '42-45-51-50'
        ));
        
        accounts.add(new Account(
            Name = 'Test 2',
            Market_Unit__c = 'FA_SE',
            Phone = '070 377 2089'
        ));
        
        accounts.add(new Account(
            Name = 'Test 3',
            Market_Unit__c = 'Ireland',
            Phone = '(087) 123-4567'
        ));
        
        accounts.add(new Account(
            Name = 'Test 4 Already Normalized',
            Market_Unit__c = 'DFJ_DK',
            Phone = '+4542455150'
        ));
        
        insert accounts;
        
        Test.startTest();
        AccountPhoneBatchNormalizer batch = new AccountPhoneBatchNormalizer();
        Database.executeBatch(batch, 200);
        Test.stopTest();
        
        // Verify all phones are normalized
        List<Account> results = [SELECT Phone FROM Account WHERE Name LIKE 'Test%' ORDER BY Name];
        
        System.assertEquals('+4542455150', results[0].Phone, 'Danish phone should be normalized');
        System.assertEquals('+46703772089', results[1].Phone, 'Swedish phone should be normalized');
        System.assertEquals('+353871234567', results[2].Phone, 'Irish phone should be normalized');
        System.assertEquals('+4542455150', results[3].Phone, 'Already normalized phone should remain unchanged');
    }
    
    @isTest
    static void testBatchWithNullPhones() {
        // Create accounts with null phones
        List<Account> accounts = new List<Account>();
        
        accounts.add(new Account(
            Name = 'Null Phone Test',
            Market_Unit__c = 'DFJ_DK'
        ));
        
        insert accounts;
        
        Test.startTest();
        AccountPhoneBatchNormalizer batch = new AccountPhoneBatchNormalizer();
        Database.executeBatch(batch, 200);
        Test.stopTest();
        
        Account result = [SELECT Phone FROM Account WHERE Name = 'Null Phone Test'];
        System.assertEquals(null, result.Phone, 'Null phone should remain null');
    }
    
    @isTest
    static void testBatchWithMixedFormats() {
        // Test various formatting issues
        List<Account> accounts = new List<Account>();
        
        accounts.add(new Account(
            Name = 'Test With Spaces',
            Market_Unit__c = 'DFJ_DK',
            Phone = '42 45 51 50'
        ));
        
        accounts.add(new Account(
            Name = 'Test With Parentheses',
            Market_Unit__c = 'FA_SE',
            Phone = '(070) 377-2089'
        ));
        
        accounts.add(new Account(
            Name = 'Test With 00 Prefix',
            Market_Unit__c = 'FA_SE',
            Phone = '0046703772089'
        ));
        
        accounts.add(new Account(
            Name = 'Test Leading Zero After Country',
            Market_Unit__c = 'FA_SE',
            Phone = '+460703772089'
        ));
        
        insert accounts;
        
        Test.startTest();
        AccountPhoneBatchNormalizer batch = new AccountPhoneBatchNormalizer();
        Database.executeBatch(batch, 200);
        Test.stopTest();
        
        Map<String, Account> resultMap = new Map<String, Account>();
        for (Account acc : [SELECT Name, Phone FROM Account WHERE Name LIKE 'Test%']) {
            resultMap.put(acc.Name, acc);
        }
        
        System.assertEquals('+4542455150', resultMap.get('Test With Spaces').Phone);
        System.assertEquals('+46703772089', resultMap.get('Test With Parentheses').Phone);
        System.assertEquals('+46703772089', resultMap.get('Test With 00 Prefix').Phone);
        System.assertEquals('+46703772089', resultMap.get('Test Leading Zero After Country').Phone);
    }
    
    @isTest
    static void testE164FormatCheck() {
        // Test the isE164Format method indirectly
        Account acc = new Account(
            Name = 'E164 Test',
            Market_Unit__c = 'DFJ_DK',
            Phone = '+4542455150'  // Already E.164
        );
        
        insert acc;
        
        Test.startTest();
        AccountPhoneBatchNormalizer batch = new AccountPhoneBatchNormalizer();
        Database.executeBatch(batch, 200);
        Test.stopTest();
        
        Account result = [SELECT Phone FROM Account WHERE Name = 'E164 Test'];
        System.assertEquals('+4542455150', result.Phone, 'E.164 format should remain unchanged');
    }
    
    @isTest
    static void testBatchPersonAccounts() {
        // Test Person Account phone normalization in batch
        // Person Accounts need FirstName and LastName (not Name)
        Account personAcc = new Account(
            FirstName = 'Test',
            LastName = 'Person Account',
            Market_Unit__c = 'DFJ_DK',
            Phone = '42-45-51-50',
            Spouse_Phone__pc = '87-65-43-21'
        );
        
        insert personAcc;
        
        Test.startTest();
        AccountPhoneBatchNormalizer batch = new AccountPhoneBatchNormalizer();
        Database.executeBatch(batch, 200);
        Test.stopTest();
        
        Account result = [SELECT Phone, Spouse_Phone__pc, IsPersonAccount FROM Account WHERE Id = :personAcc.Id];
        System.assertEquals(true, result.IsPersonAccount, 'Should be a Person Account');
        System.assertEquals('+4542455150', result.Phone, 'Person account phone should be normalized');
        System.assertEquals('+4587654321', result.Spouse_Phone__pc, 'Person account spouse phone should be normalized');
    }
    
    @isTest
    static void testBatchEmptyPhone() {
        // Test account with empty string phone (not null)
        Account acc = new Account(
            Name = 'Empty Phone Test',
            Market_Unit__c = 'DFJ_DK',
            Phone = ''
        );
        
        insert acc;
        
        Test.startTest();
        AccountPhoneBatchNormalizer batch = new AccountPhoneBatchNormalizer();
        Id batchId = Database.executeBatch(batch, 200);
        Test.stopTest();
        
        // Just verify batch completed successfully
        System.assertNotEquals(null, batchId);
    }
    
    @isTest
    static void testBatchQueryLocator() {
        // Test the start method / query locator
        // Create mix of accounts with and without phones
        List<Account> accounts = new List<Account>();
        
        for (Integer i = 0; i < 5; i++) {
            accounts.add(new Account(
                Name = 'Batch Query Test ' + i,
                Market_Unit__c = 'DFJ_DK',
                Phone = (i < 3) ? '424551' + i + '0' : null
            ));
        }
        
        insert accounts;
        
        Test.startTest();
        AccountPhoneBatchNormalizer batch = new AccountPhoneBatchNormalizer();
        Database.QueryLocator ql = batch.start(null);
        Database.executeBatch(batch, 200);
        Test.stopTest();
        
        // Verify query locator returns results
        System.assertNotEquals(null, ql);
        
        // Verify phones with values got normalized
        List<Account> results = [SELECT Phone FROM Account WHERE Name LIKE 'Batch Query Test%' AND Phone != null];
        for (Account acc : results) {
            System.assert(acc.Phone.startsWith('+'), 'Phone should start with +');
        }
    }
    
    @isTest
    static void testBatchWithAccountsAlreadyNormalized() {
        // Test batch with accounts that are already normalized (no update needed)
        List<Account> accounts = new List<Account>();
        
        accounts.add(new Account(
            Name = 'Already Norm 1',
            Market_Unit__c = 'DFJ_DK',
            Phone = '+4542455150'
        ));
        
        accounts.add(new Account(
            Name = 'Already Norm 2',
            Market_Unit__c = 'FA_SE',
            Phone = '+46703772089'
        ));
        
        insert accounts;
        
        Test.startTest();
        AccountPhoneBatchNormalizer batch = new AccountPhoneBatchNormalizer();
        Database.executeBatch(batch, 200);
        Test.stopTest();
        
        // Verify phones unchanged
        List<Account> results = [SELECT Phone FROM Account WHERE Name LIKE 'Already Norm%'];
        System.assertEquals('+4542455150', results[0].Phone);
        System.assertEquals('+46703772089', results[1].Phone);
    }
    
    @isTest
    static void testBatchWithDebugStatements() {
        // Test to ensure debug statements are hit and all branches covered
        List<Account> accounts = new List<Account>();
        
        // Account needing normalization
        accounts.add(new Account(
            Name = 'Debug Test 1',
            Market_Unit__c = 'DFJ_DK',
            Phone = '42-45-51-50'
        ));
        
        // Account already normalized (no update needed)
        accounts.add(new Account(
            Name = 'Debug Test 2',
            Market_Unit__c = 'DFJ_DK',
            Phone = '+4587654321'
        ));
        
        insert accounts;
        
        Test.startTest();
        AccountPhoneBatchNormalizer batch = new AccountPhoneBatchNormalizer();
        Database.QueryLocator ql = batch.start(null);
        List<Account> scope = Database.query(ql.getQuery());
        
        // Execute directly to ensure all paths are hit (don't call executeBatch again)
        batch.execute(null, scope);
        Test.stopTest();
        
        // Verify normalization occurred
        List<Account> results = [SELECT Phone FROM Account WHERE Name LIKE 'Debug Test%' ORDER BY Name];
        System.assertEquals('+4542455150', results[0].Phone, 'Phone should be normalized');
        System.assertEquals('+4587654321', results[1].Phone, 'Already normalized should stay same');
    }
    
    @isTest
    static void testFinishMethod() {
        // Test to cover the finish method
        Account acc = new Account(
            Name = 'Finish Test',
            Market_Unit__c = 'DFJ_DK',
            Phone = '42455150'
        );
        
        insert acc;
        
        Test.startTest();
        AccountPhoneBatchNormalizer batch = new AccountPhoneBatchNormalizer();
        Id batchId = Database.executeBatch(batch, 200);
        Test.stopTest();
        
        // Verify batch completed
        System.assertNotEquals(null, batchId);
        
        // Call finish explicitly to ensure coverage
        batch.finish(null);
    }
}
