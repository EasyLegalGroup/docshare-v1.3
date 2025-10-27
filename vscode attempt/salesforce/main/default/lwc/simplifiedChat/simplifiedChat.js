import { LightningElement, api, wire } from 'lwc';
import { refreshApex }              from '@salesforce/apex';
import { ShowToastEvent }           from 'lightning/platformShowToastEvent';

import getMessages  from '@salesforce/apex/SimplifiedChatService.getMessages';
import createMessage from '@salesforce/apex/SimplifiedChatService.createMessage';

const REFRESH_INTERVAL = 5000;   // 5 s polling cadence

export default class SimplifiedChat extends LightningElement {
    /* --------------------------------------------------------------------
       Public API
    -------------------------------------------------------------------- */
    @api recordId;                // Id of the parent record
    @api height = '400px';        // Component height (configurable)

    /* --------------------------------------------------------------------
       Reactive component state
    -------------------------------------------------------------------- */
    messages     = [];            // array<ChatMessage__c decorated>
    messageText  = '';            // textarea binding
    isLoading    = false;         // not currently surfaced but kept for UX hooks
    isSending    = false;         // disable send while DML in flight

    wiredMessagesResult;          // refresh handle for @wire
    refreshIntervalId;            // setInterval handle

    /* --------------------------------------------------------------------
       Wire adapter – fetch messages
    -------------------------------------------------------------------- */
    @wire(getMessages, { recordId: '$recordId' })
    wiredMessages(result) {
        this.wiredMessagesResult = result;

        if (result.data) {
            this.messages = result.data.map(msg => this._enrichMessage({
                ...msg,
                displayLabel : msg.Is_Inbound__c ? 'Inbound' : 'Outbound',
                formattedDate: this.formatDate(msg.CreatedDate),
                messageClass : msg.Is_Inbound__c ? 'message-left' : 'message-right'
            }));

            /* ensure scroll after render */
            Promise.resolve().then(() => this.scrollToBottom());
        } else if (result.error) {
            this.showToast(
                'Error',
                'Error loading messages: ' + result.error.body?.message,
                'error'
            );
        }
    }

    /* --------------------------------------------------------------------
       Pill enrichment logic
    -------------------------------------------------------------------- */
    _enrichMessage(msg) {
        const pills = [];
        const isInbound = msg.Is_Inbound__c;
        const messageType = msg.Message_Type__c;
        const originalTarget = msg.Original_Target__c;
        const finalTarget = msg.Final_Target__c;
        const targetChanged = msg.Target_Changed__c;
        const aiHelpful = msg.AI_Helpful__c;
        const aiEscalated = msg.AI_Escalated__c;

        if (isInbound) {
            // INBOUND MESSAGE PILLS
            // Show original target pill
            if (originalTarget === 'Human') {
                pills.push({ label: 'Asked Human', variant: 'pill-asked-human' });
            } else if (originalTarget === 'AI') {
                pills.push({ label: 'Asked AI', variant: 'pill-asked-ai' });
            }

            // Show routing change pills
            if (originalTarget === 'Human' && finalTarget === 'AI' && targetChanged) {
                pills.push({ label: 'Switched to AI', variant: 'pill-switched-ai' });
            } else if (originalTarget === 'AI' && finalTarget === 'Human' && targetChanged) {
                pills.push({ label: 'Escalated to Human', variant: 'pill-escalated-human' });
            } else if (originalTarget === 'Human' && finalTarget === 'Human' && targetChanged) {
                // They started Human, tried AI, but switched back to Human
                pills.push({ label: 'Tried AI', variant: 'pill-tried-ai' });
            }
        } else {
            // OUTBOUND MESSAGE PILLS
            if (messageType === 'AI') {
                pills.push({ label: '✨ Written by AI', variant: 'pill-written-ai' });
                
                // Show helpful pill if AI response was marked helpful
                if (aiHelpful) {
                    pills.push({ label: 'Helpful', variant: 'pill-helpful' });
                }
                
                // Show routed to agent pill if AI response was escalated
                if (aiEscalated) {
                    pills.push({ label: 'Routed to Agent', variant: 'pill-routed-agent' });
                }
            } else if (messageType === 'Human') {
                pills.push({ label: 'Written by Human', variant: 'pill-written-human' });
            }
        }

        return { ...msg, pills, hasPills: pills.length > 0 };
    }

    /* --------------------------------------------------------------------
       Lifecycle
    -------------------------------------------------------------------- */
    connectedCallback() {
        this.startRefresh();
    }

    renderedCallback() {
        this.setContainerHeight();
    }

    disconnectedCallback() {
        this.stopRefresh();
    }

    /* --------------------------------------------------------------------
       DOM helpers
    -------------------------------------------------------------------- */
    setContainerHeight() {
        const container = this.template.querySelector('.chat-container');
        if (container && this.height) {
            container.style.height = this.height;
        }
    }

    scrollToBottom() {
        const div = this.template.querySelector('.chat-messages');
        if (div) {
            div.scrollTop = div.scrollHeight;
        }
    }

    formatDate(dateString) {
        const d = new Date(dateString);
        return (
            d.toLocaleDateString() +
            ' ' +
            d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
    }

    /* --------------------------------------------------------------------
       Polling
    -------------------------------------------------------------------- */
    startRefresh() {
        this.refreshIntervalId = setInterval(() => {
            if (this.wiredMessagesResult) {
                refreshApex(this.wiredMessagesResult);
            }
        }, REFRESH_INTERVAL);
    }

    stopRefresh() {
        if (this.refreshIntervalId) {
            clearInterval(this.refreshIntervalId);
            this.refreshIntervalId = null;
        }
    }

    /* --------------------------------------------------------------------
       Event handlers
    -------------------------------------------------------------------- */
    handleMessageChange(event) {
        this.messageText = event.target.value;
    }

    handleKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    }

    async sendMessage() {
        if (!this.messageText.trim() || this.isSending) return;

        this.isSending = true;

        try {
            await createMessage({
                body      : this.messageText,
                recordId  : this.recordId,
                isInbound : false
            });

            this.messageText = '';
            await refreshApex(this.wiredMessagesResult);
        } catch (e) {
            this.showToast('Error', 'Error sending message: ' + e.body?.message, 'error');
        } finally {
            this.isSending = false;
        }
    }

    /* --------------------------------------------------------------------
       Getters for template
    -------------------------------------------------------------------- */
    get hasMessages() {
        return this.messages?.length > 0;
    }

    get sendDisabled() {
        return this.isSending || !this.messageText.trim();
    }

    /* --------------------------------------------------------------------
       Utility
    -------------------------------------------------------------------- */
    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}