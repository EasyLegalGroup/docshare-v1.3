declare module "@salesforce/apex/SimplifiedChatService.getMessages" {
  export default function getMessages(param: {recordId: any}): Promise<any>;
}
declare module "@salesforce/apex/SimplifiedChatService.createMessage" {
  export default function createMessage(param: {body: any, recordId: any, isInbound: any}): Promise<any>;
}
