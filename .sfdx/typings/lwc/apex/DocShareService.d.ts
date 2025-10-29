declare module "@salesforce/apex/DocShareService.createForJournalSimple" {
  export default function createForJournalSimple(param: {journalId: any, s3Key: any, fileName: any}): Promise<any>;
}
declare module "@salesforce/apex/DocShareService.createForJournal" {
  export default function createForJournal(param: {req: any}): Promise<any>;
}
declare module "@salesforce/apex/DocShareService.createForJournalBulk" {
  export default function createForJournalBulk(param: {batch: any}): Promise<any>;
}
declare module "@salesforce/apex/DocShareService.getDocsForJournal" {
  export default function getDocsForJournal(param: {journalId: any}): Promise<any>;
}
declare module "@salesforce/apex/DocShareService.replaceSharedDocument" {
  export default function replaceSharedDocument(param: {docId: any, newS3Key: any, newFileName: any}): Promise<any>;
}
declare module "@salesforce/apex/DocShareService.setDocumentOrder" {
  export default function setDocumentOrder(param: {journalId: any, docIdsInOrder: any}): Promise<any>;
}
declare module "@salesforce/apex/DocShareService.updateBlockApproval" {
  export default function updateBlockApproval(param: {docId: any, isBlocked: any}): Promise<any>;
}
declare module "@salesforce/apex/DocShareService.saveSortOrder" {
  export default function saveSortOrder(param: {docId: any, sortOrder: any}): Promise<any>;
}
