# GHL API — Webhooks Reference

## Webhook Setup

Webhooks are configured in: **Location Settings → Integrations → Webhooks**
Or programmatically via the Locations API.

All webhook payloads share this base structure:

```json
{
  "type": "EventName",
  "locationId": "string",
  "id": "string",          // resource ID (contactId, opportunityId, etc.)
  "appId": "string",
  "timestamp": "ISO 8601",
  "data": { ... }          // event-specific payload
}
```

---

## Contact Events

### ContactCreate / ContactUpdate / ContactDelete

```json
{
  "type": "ContactCreate",
  "locationId": "ve9EPM428h8vShlRx",
  "id": "contactId",
  "data": {
    "id": "string",
    "locationId": "string",
    "firstName": "string",
    "lastName": "string",
    "name": "string",
    "email": "string",
    "phone": "string",
    "address1": "string",
    "city": "string",
    "state": "string",
    "postalCode": "string",
    "country": "string",
    "companyName": "string",
    "source": "string",
    "dateAdded": "ISO 8601",
    "dateOfBirth": "string",
    "dnd": false,
    "tags": [],
    "website": "string",
    "assignedTo": "string",
    "attachments": [],
    "customFields": [{ "id": "string", "value": "string | number | array | object" }]
  }
}
```

### ContactDndUpdate

```json
{
  "type": "ContactDndUpdate",
  "data": {
    "id": "string",
    "locationId": "string",
    "dnd": true,
    "dndSettings": {
      "SMS": { "status": "active", "message": "string", "code": "string" },
      "Email": { "status": "inactive", "message": "", "code": "" },
      "Call": { "status": "active", "message": "", "code": "" },
      "WhatsApp": { "status": "active", "message": "", "code": "" }
    }
  }
}
```

### ContactTagUpdate

```json
{
  "type": "ContactTagUpdate",
  "data": {
    "id": "string",
    "locationId": "string",
    "tags": ["tag1", "tag2"]
  }
}
```

---

## Opportunity Events

### OpportunityCreate / OpportunityUpdate / OpportunityDelete

```json
{
  "type": "OpportunityCreate",
  "data": {
    "id": "string",
    "locationId": "string",
    "name": "string",
    "pipelineId": "string",
    "pipelineStageId": "string",
    "status": "open | won | lost | abandoned",
    "monetaryValue": 0,
    "assignedTo": "string",
    "contactId": "string",
    "source": "string",
    "lastStatusChangeAt": "ISO 8601",
    "createdAt": "ISO 8601",
    "updatedAt": "ISO 8601",
    "contact": {
      "id": "string",
      "name": "string",
      "email": "string",
      "phone": "string",
      "tags": []
    }
  }
}
```

### OpportunityStageUpdate

```json
{
  "type": "OpportunityStageUpdate",
  "data": {
    "id": "string",
    "locationId": "string",
    "pipelineId": "string",
    "pipelineStageId": "string",      // new stage
    "previousStageId": "string",       // previous stage
    "contactId": "string"
  }
}
```

### OpportunityStatusUpdate

```json
{
  "type": "OpportunityStatusUpdate",
  "data": {
    "id": "string",
    "locationId": "string",
    "status": "won",
    "previousStatus": "open",
    "contactId": "string"
  }
}
```

### OpportunityMonetaryValueUpdate

```json
{
  "type": "OpportunityMonetaryValueUpdate",
  "data": {
    "id": "string",
    "locationId": "string",
    "monetaryValue": 5000,
    "previousMonetaryValue": 3000,
    "contactId": "string"
  }
}
```

### OpportunityAssignedToUpdate

```json
{
  "type": "OpportunityAssignedToUpdate",
  "data": {
    "id": "string",
    "locationId": "string",
    "assignedTo": "newUserId",
    "previousAssignedTo": "oldUserId",
    "contactId": "string"
  }
}
```

---

## Appointment Events

### AppointmentCreate / AppointmentUpdate / AppointmentDelete

```json
{
  "type": "AppointmentCreate",
  "data": {
    "id": "string",
    "locationId": "string",
    "calendarId": "string",
    "contactId": "string",
    "title": "string",
    "startTime": "ISO 8601",
    "endTime": "ISO 8601",
    "appoinmentStatus": "new | confirmed | cancelled | showed | noshow | invalid",
    "assignedUserId": "string",
    "address": "string",
    "notes": "string"
  }
}
```

---

## Conversation / Message Events

### InboundMessage / OutboundMessage

```json
{
  "type": "InboundMessage",
  "data": {
    "locationId": "string",
    "conversationId": "string",
    "contactId": "string",
    "body": "string",
    "direction": "inbound | outbound",
    "status": "sent | delivered | read | failed | ...",
    "messageType": "TYPE_SMS | TYPE_EMAIL | TYPE_CALL | TYPE_FB | TYPE_IG | TYPE_WHATSAPP | TYPE_GMB | TYPE_LIVE_CHAT",
    "contentType": "text/plain | text/html",
    "attachments": [],
    "id": "string",
    "userId": "string",
    "dateAdded": "ISO 8601"
  }
}
```

### ConversationUnreadUpdate

```json
{
  "type": "ConversationUnreadUpdate",
  "data": {
    "locationId": "string",
    "conversationId": "string",
    "contactId": "string",
    "unreadCount": 3
  }
}
```

---

## Task Events

### TaskCreate / TaskUpdate / TaskDelete / TaskComplete

```json
{
  "type": "TaskCreate",
  "data": {
    "id": "string",
    "locationId": "string",
    "contactId": "string",
    "title": "string",
    "body": "string",
    "dueDate": "ISO 8601",
    "completed": false,
    "assignedTo": "string"
  }
}
```

---

## Form / Survey Events

### FormSubmission

```json
{
  "type": "FormSubmission",
  "data": {
    "formId": "string",
    "locationId": "string",
    "contactId": "string",
    "name": "string",
    "email": "string",
    "phone": "string",
    "formData": {
      "field_key": "value"
    },
    "id": "string",
    "dateAdded": "ISO 8601"
  }
}
```

### SurveySubmission — similar structure with `surveyId`

---

## Payment / Invoice Events

Events: `InvoiceCreate`, `InvoiceUpdate`, `InvoiceDelete`, `InvoiceSent`, `InvoicePartiallyPaid`, `InvoicePaid`, `InvoiceVoided`, `OrderCreate`, `OrderStatusUpdate`, `SubscriptionCreate`, `SubscriptionCancel`, `PaymentReceived`

```json
{
  "type": "InvoicePaid",
  "data": {
    "id": "string",
    "locationId": "string",
    "contactId": "string",
    "amountPaid": 9900,
    "currency": "usd",
    "status": "paid",
    "invoiceNumber": "INV-001"
  }
}
```

---

## Note Events

### NoteCreate / NoteUpdate / NoteDelete

```json
{
  "type": "NoteCreate",
  "data": {
    "id": "string",
    "locationId": "string",
    "contactId": "string",
    "body": "string",
    "userId": "string",
    "dateAdded": "ISO 8601"
  }
}
```

---

## User / Location Events

### UserCreate / UserUpdate / UserDelete

```json
{
  "type": "UserCreate",
  "data": {
    "id": "string",
    "locationId": "string",
    "name": "string",
    "email": "string",
    "phone": "string",
    "role": "admin | user",
    "type": "account | agency"
  }
}
```

### LocationCreate / LocationUpdate

```json
{
  "type": "LocationCreate",
  "data": {
    "id": "string",
    "companyId": "string",
    "name": "string",
    "email": "string",
    "phone": "string",
    "address": "string"
  }
}
```

---

## Full Event Name List (50+ events)

**Contacts:** `ContactCreate`, `ContactUpdate`, `ContactDelete`, `ContactDndUpdate`, `ContactTagUpdate`

**Opportunities:** `OpportunityCreate`, `OpportunityUpdate`, `OpportunityDelete`, `OpportunityStageUpdate`, `OpportunityStatusUpdate`, `OpportunityMonetaryValueUpdate`, `OpportunityAssignedToUpdate`

**Appointments:** `AppointmentCreate`, `AppointmentUpdate`, `AppointmentDelete`

**Conversations:** `InboundMessage`, `OutboundMessage`, `ConversationUnreadUpdate`, `ConversationProviderOutboundMessage`

**Tasks:** `TaskCreate`, `TaskUpdate`, `TaskDelete`, `TaskComplete`

**Notes:** `NoteCreate`, `NoteUpdate`, `NoteDelete`

**Forms/Surveys:** `FormSubmission`, `SurveySubmission`

**Payments/Invoices:** `InvoiceCreate`, `InvoiceUpdate`, `InvoiceDelete`, `InvoiceSent`, `InvoicePartiallyPaid`, `InvoicePaid`, `InvoiceVoided`, `OrderCreate`, `OrderStatusUpdate`, `SubscriptionCreate`, `SubscriptionCancel`, `PaymentReceived`

**Users:** `UserCreate`, `UserUpdate`, `UserDelete`

**Locations:** `LocationCreate`, `LocationUpdate`

**Campaigns:** `CampaignStatusUpdate`
