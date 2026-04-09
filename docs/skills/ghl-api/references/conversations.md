# GHL API — Conversations & Messages Reference

Base paths: `/conversations/`, `/conversations/messages`

## Conversation Object

```json
{
  "id": "string",
  "contactId": "string",
  "locationId": "string",
  "lastMessageBody": "string",
  "lastMessageDate": "ISO 8601",
  "lastMessageType": "TYPE_SMS | TYPE_EMAIL | ...",
  "type": "TYPE_PHONE | TYPE_EMAIL | TYPE_SMS | TYPE_LIVE_CHAT | TYPE_FB | TYPE_IG | TYPE_WHATSAPP | TYPE_GMB | TYPE_REVIEW | TYPE_ACTIVITY_CONTACTS | TYPE_ACTIVITY_APPOINTMENT | TYPE_ACTIVITY_PAYMENT | TYPE_ACTIVITY_OPPORTUNITY | TYPE_ACTIVITY_CAMPAIGN",
  "unreadCount": 0,
  "fullName": "string",
  "contactName": "string",
  "email": "string",
  "phone": "string",
  "assignedTo": "string (userId)",
  "starred": false,
  "inbox": false
}
```

## Message Object

```json
{
  "id": "string",
  "conversationId": "string",
  "locationId": "string",
  "contactId": "string",
  "body": "string",
  "direction": "inbound | outbound",
  "status": "pending | scheduled | sent | delivered | read | undelivered | connected | failed | opened",
  "contentType": "text/plain | text/html",
  "messageType": "TYPE_SMS | TYPE_EMAIL | TYPE_CALL | TYPE_VOICE_NOTE | TYPE_ACTIVITY | TYPE_FB | TYPE_IG | TYPE_WHATSAPP | TYPE_GMB | TYPE_LIVE_CHAT",
  "dateAdded": "ISO 8601",
  "attachments": ["string (url)"],
  "userId": "string",
  "source": "string",
  "replyTo": "string (messageId)"
}
```

## Conversation Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/conversations/search` | Search conversations |
| `GET` | `/conversations/{conversationId}` | Get conversation |
| `POST` | `/conversations/` | Create/get conversation |
| `PUT` | `/conversations/{conversationId}` | Update conversation |
| `DELETE` | `/conversations/{conversationId}` | Delete conversation |
| `GET` | `/conversations/{conversationId}/messages` | List messages |
| `GET` | `/conversations/{conversationId}/messages/email/{emailMessageId}` | Get email message |
| `DELETE` | `/conversations/{conversationId}/messages/{messageId}` | Delete message |

## Message Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/conversations/messages` | Send outbound message |
| `POST` | `/conversations/messages/inbound` | Add inbound message (simulate) |
| `POST` | `/conversations/messages/upload` | Upload message attachments |
| `PUT` | `/conversations/messages/{messageId}/status` | Update message status |
| `GET` | `/conversations/messages/{messageId}/locations` | Get scheduled message locations |
| `DELETE` | `/conversations/messages/{messageId}/schedule` | Cancel scheduled message |

## Search Conversations — Query Params

| Param | Type | Description |
|-------|------|-------------|
| `locationId` | string | **Required** |
| `contactId` | string | Filter by contact |
| `assignedTo` | string | Filter by user |
| `query` | string | Text search |
| `limit` | number | Max 100 |
| `lastMessageType` | string | Filter by message type |
| `lastMessageAction` | string | `incoming | outgoing` |
| `status` | string | `read | unread | all` |
| `startAfterDate` | number | Pagination (timestamp ms) |

## Send a Message — Request Body

```json
{
  "type": "SMS",
  "message": "Hello! This is your reminder.",
  "contactId": "contactId_here",
  "conversationId": "convId_here",    // optional if contactId provided
  "locationId": "locId_here",
  "attachments": ["https://url.com/file.pdf"],  // optional
  "html": "<p>HTML body</p>",          // for emails only
  "subject": "Email Subject",          // for emails only
  "from": "sender@email.com",          // for emails only
  "replyToMessageId": "msgId",         // optional thread reply
  "scheduledTimestamp": 1700000000000  // optional, Unix ms
}
```

### Message `type` values:
- `SMS` — text message
- `Email` — email
- `WhatsApp` — WhatsApp
- `FB` — Facebook Messenger
- `IG` — Instagram DM
- `GMB` — Google My Business
- `Live_Chat` — live chat widget

## Create Conversation — Request Body

```json
{
  "locationId": "string",
  "contactId": "string"
}
```
Returns existing conversation if one already exists for that contact.

## Update Conversation

```json
{
  "unreadCount": 0,
  "starred": true,
  "assignedTo": "userId"
}
```

## Email Message Object (extended)

```json
{
  "id": "string",
  "altId": "string",
  "threadId": "string",
  "locationId": "string",
  "contactId": "string",
  "conversationId": "string",
  "dateAdded": "ISO 8601",
  "subject": "string",
  "body": "string (HTML)",
  "direction": "inbound | outbound",
  "status": "sent | opened | clicked | ...",
  "provider": "Leadconnector | Mailgun | ...",
  "from": "string (email)",
  "to": ["string (email)"],
  "cc": ["string"],
  "bcc": ["string"],
  "replyTo": ["string"],
  "attachments": ["url"]
}
```
