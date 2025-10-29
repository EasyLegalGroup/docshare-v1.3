@IsTest
private class DocShareService_Tests {

    private static Journal__c makeJournal() {
        Account a = new Account(Name = 'DSTest Acct', Phone = '5550101');
        insert a;
        Journal__c j = new Journal__c(Account__c = a.Id, Market_Unit__c = 'DFJ_DK');
        insert j;
        return j;
    }

    @IsTest
    static void createForJournalSimple_insertsRecord_withDefaults() {
        Journal__c j = makeJournal();
        j = [SELECT Id, Name, Market_Unit__c FROM Journal__c WHERE Id = :j.Id];

        Test.startTest();
        DocShareService.CreateForJournalResult res =
            DocShareService.createForJournalSimple(
                j.Id,
                'customer-documents/' + j.Name + '/hello.pdf',
                'hello.pdf'
            );
        Test.stopTest();

        System.assertNotEquals(null, res, 'Result should not be null');
        System.assertNotEquals(null, res.DocumentId, 'DocumentId missing');

        Shared_Document__c d = [
            SELECT Journal__c, Name, S3_Key__c, Status__c, Version__c, Is_Newest_Version__c, Market_Unit__c, Sort_Order__c
            FROM Shared_Document__c
            WHERE Id = :res.DocumentId
        ];
        System.assertEquals(j.Id, d.Journal__c);
        System.assertEquals('hello.pdf', d.Name);
        System.assertEquals('customer-documents/' + j.Name + '/hello.pdf', d.S3_Key__c);
        System.assertEquals('Draft', d.Status__c, 'Default status should be Draft');
        System.assertEquals(1, d.Version__c,      'Default version should be 1');
        System.assertEquals(true, d.Is_Newest_Version__c, 'Newest flag should default true');
        System.assertEquals(j.Market_Unit__c, d.Market_Unit__c);
        System.assertNotEquals(null, d.Sort_Order__c);
    }

    @IsTest
    static void getDocsForJournal_includes_extra_fields() {
        Journal__c j = makeJournal();
        j = [SELECT Id, Name, Market_Unit__c FROM Journal__c WHERE Id = :j.Id];

        DocShareService.CreateForJournalResult res =
            DocShareService.createForJournalSimple(
                j.Id,
                'customer-documents/' + j.Name + '/meta.pdf',
                'meta.pdf'
            );

        Date     sent  = Date.today();
        Datetime first = System.now().addMinutes(-30);
        Datetime last  = System.now();
        Boolean  ack   = true;
        Datetime ackTs = System.now();

        update new Shared_Document__c(
            Id = res.DocumentId,
            Sent_Date__c = sent,
            First_Viewed__c = first,
            Last_Viewed__c = last,
            Is_Guidance_Acknowledged__c = ack,
            Time_of_Guidance_Acknowledge__c = ackTs
        );

        Test.startTest();
        List<Shared_Document__c> rows = DocShareService.getDocsForJournal(j.Id);
        Test.stopTest();

        System.assert(rows.size() > 0, 'Should return at least one doc');

        Shared_Document__c got = null;
        for (Shared_Document__c r : rows) {
            if (r.Id == res.DocumentId) { got = r; break; }
        }
        System.assertNotEquals(null, got, 'Expected to find the inserted document');

        System.assertEquals('meta.pdf', got.Name);
        System.assertEquals('Draft', got.Status__c);
        System.assertEquals(1, got.Version__c);
        System.assertNotEquals(null, got.S3_Key__c, 'S3_Key__c should be selected in query');

        System.assertEquals(sent,  got.Sent_Date__c);
        System.assertEquals(first, got.First_Viewed__c);
        System.assertEquals(last,  got.Last_Viewed__c);
        System.assertEquals(true,  got.Is_Guidance_Acknowledged__c);
        System.assertEquals(ackTs, got.Time_of_Guidance_Acknowledge__c);
        System.assertEquals(j.Market_Unit__c, got.Market_Unit__c);
    }

    @IsTest
    static void trims_overlong_filename_preserving_journal_and_ext_on_create() {
        Journal__c j = makeJournal();
        j = [SELECT Id, Name FROM Journal__c WHERE Id = :j.Id];

        String longPrefix = 'Carmen Karin Bursan Phillip og Torben Emil Studsgaard Christoffersen - Testamente ';
        String fileName   = longPrefix + '(' + j.Name + ').pdf';
        String key        = 'customer-documents/' + j.Name + '/overlong.pdf';

        Test.startTest();
        DocShareService.CreateForJournalResult r =
            DocShareService.createForJournalSimple(j.Id, key, fileName);
        Test.stopTest();

        Shared_Document__c d = [SELECT Name FROM Shared_Document__c WHERE Id = :r.DocumentId];
        Integer maxLen = Schema.SObjectType.Shared_Document__c.fields.Name.getLength();
        System.assert(d.Name.length() <= maxLen, 'Name should be truncated to max length');
        System.assert(d.Name.endsWith(j.Name + ').pdf') || d.Name.endsWith('(' + j.Name + ').pdf') || d.Name.endsWith(' ' + j.Name + ').pdf'),
            'Should preserve journal suffix and extension');
        System.assert(d.Name.contains('…'), 'Should include ellipsis when truncated');
    }

    @IsTest
    static void trims_in_bulk_and_in_replace_flows() {
        Journal__c j = makeJournal();
        j = [SELECT Id, Name FROM Journal__c WHERE Id = :j.Id];

        String veryLong = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
                          ' ' + '(' + j.Name + ').pdf';

        List<DocShareService.CreateForJournalRequest> batch = new List<DocShareService.CreateForJournalRequest>();
        DocShareService.CreateForJournalRequest a = new DocShareService.CreateForJournalRequest();
        a.JournalId = j.Id; a.S3Key = 'customer-documents/' + j.Name + '/a.pdf'; a.FileName = veryLong; batch.add(a);
        DocShareService.CreateForJournalRequest b = new DocShareService.CreateForJournalRequest();
        b.JournalId = j.Id; b.S3Key = 'customer-documents/' + j.Name + '/b.pdf'; b.FileName = veryLong; batch.add(b);

        Test.startTest();
        List<DocShareService.CreateForJournalResult> rs = DocShareService.createForJournalBulk(batch);
        Test.stopTest();

        for (DocShareService.CreateForJournalResult r : rs) {
            Shared_Document__c d = [SELECT Name FROM Shared_Document__c WHERE Id = :r.DocumentId];
            Integer maxLen = Schema.SObjectType.Shared_Document__c.fields.Name.getLength();
            System.assert(d.Name.length() <= maxLen, 'Bulk name should be truncated');
            System.assert(d.Name.endsWith(j.Name + ').pdf') || d.Name.endsWith('(' + j.Name + ').pdf') || d.Name.endsWith(' ' + j.Name + ').pdf'),
                'Bulk should preserve journal suffix and extension');
        }

        Shared_Document__c first = [SELECT Id FROM Shared_Document__c WHERE Id = :rs[0].DocumentId];
        DocShareService.CreateForJournalResult r2 = DocShareService.replaceSharedDocument(
                first.Id,
                'customer-documents/' + j.Name + '/rep.pdf',
                veryLong
            );
        Shared_Document__c rep = [SELECT Name FROM Shared_Document__c WHERE Id = :r2.DocumentId];
        System.assert(rep.Name.endsWith(j.Name + ').pdf') || rep.Name.endsWith('(' + j.Name + ').pdf') || rep.Name.endsWith(' ' + j.Name + ').pdf'),
            'Replace should preserve journal suffix and extension');
        System.assert(rep.Name.contains('…'), 'Replace should include ellipsis when truncated');
    }
}