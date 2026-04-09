---
name: ghl-api
description: >
  Expert knowledge of the GoHighLevel (GHL) API v2. Use this skill whenever the user asks
  about GoHighLevel integrations, API calls, webhooks, contacts, conversations, calendars,
  opportunities, payments, locations, users, workflows, OAuth, custom fields, or any
  GoHighLevel development topic. Trigger for phrases like "GHL API", "GoHighLevel endpoint",
  "create contact in GHL", "GHL webhook", "send message via HighLevel", "OAuth GHL",
  "locationId", "pipelineId", or any question about building on top of the HighLevel platform.
  Also trigger when the user shares a GHL API error, needs help with request/response schemas,
  or wants to build automations, integrations, or custom apps on GoHighLevel.
---

# GoHighLevel API v2 — Expert Skill

## Quick Reference

- **Base URL:** `https://services.leadconnectorhq.com`
- **Docs portal:** `https://marketplace.gohighlevel.com/docs/`
- **GitHub (OpenAPI source):** `https://github.com/GoHighLevel/highlevel-api-docs`
- **API v1 is EOL** — always use v2
- **Required headers on all requests:**
  ```http
  Authorization: Bearer {access_token}
  Version: 2021-07-28
  Content-Type: application/json
  ```

## Authentication

Two methods:

| Type | Use case |
|------|----------|
| **OAuth 2.0** | Marketplace apps, multi-location, production |
| **Private Integration Token** | Internal tools, single-location, dev/testing |

### OAuth 2.0 Flow

```
Step 1 — Authorization redirect:
GET https://marketplace.gohighlevel.com/oauth/chooselocation
  ?response_type=code
  &client_id={CLIENT_ID}
  &redirect_uri={REDIRECT_URI}
  &scope={SCOPES}

Step 2 — Exchange code for token:
POST https://services.leadconnectorhq.com/oauth/token
Body (form-urlencoded):
  grant_type=authorization_code
  client_id=...
  client_secret=...
  code=...
  redirect_uri=...

Response:
  { access_token, refresh_token, expires_in, token_type, scope, locationId, userId }

Step 3 — Refresh:
POST /oauth/token
  grant_type=refresh_token
  client_id=...
  client_secret=...
  refresh_token=...
```

### Common OAuth Scopes

`contacts.readonly` `contacts.write` `conversations.readonly` `conversations.write`
`conversations/message.readonly` `conversations/message.write`
`calendars.readonly` `calendars.write` `calendars/events.readonly` `calendars/events.write`
`opportunities.readonly` `opportunities.write`
`locations.readonly` `locations.write`
`users.readonly` `users.write`
`workflows.readonly` `payments.readonly` `invoices.readonly`
`forms.readonly` `surveys.readonly` `blogs.readonly` `blogs.write`
`medias.readonly` `medias.write` `social-media-posting.readonly` `social-media-posting.write`

## Rate Limits (OAuth v2)

- **Burst:** 100 requests / 10 seconds per app × location
- **Daily:** 200,000 requests / day per app × location
- Monitor via response headers: `X-RateLimit-Limit-Day`, `X-RateLimit-Remaining-Day`

---

## Core Modules — Endpoint Reference

For full schema details, read the corresponding reference file:

| Module | Reference File | Key Resource |
|--------|---------------|--------------|
| Contacts | `references/contacts.md` | `/contacts/` |
| Conversations & Messages | `references/conversations.md` | `/conversations/` |
| Calendars & Appointments | `references/calendars.md` | `/calendars/` |
| Opportunities & Pipelines | `references/opportunities.md` | `/opportunities/` |
| Locations (Sub-accounts) | `references/locations.md` | `/locations/` |
| Users | `references/users.md` | `/users/` |
| Payments | `references/payments.md` | `/payments/` |
| Webhooks | `references/webhooks.md` | Event catalog |
| Custom Fields & Objects | `references/custom-fields.md` | `/custom-fields/` |
| Other Modules | `references/other-modules.md` | Misc endpoints |

**When to read reference files:** Load the specific file(s) relevant to the user's question. For a question about creating contacts + sending a message, load both `contacts.md` and `conversations.md`.

---

## Common Patterns

### Create a Contact

```http
POST /contacts/
Authorization: Bearer {token}
Version: 2021-07-28

{
  "locationId": "abc123",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "tags": ["lead", "webinar"],
  "source": "API",
  "customFields": [
    { "id": "fieldId_here", "value": "custom value" }
  ]
}
```

### Send a Message

```http
POST /conversations/messages
Authorization: Bearer {token}
Version: 2021-07-28

{
  "type": "SMS",           // or Email, WhatsApp, etc.
  "contactId": "abc123",
  "locationId": "xyz789",
  "message": "Hello!"
}
```

### Add Contact to Workflow

```http
POST /contacts/{contactId}/workflow/{workflowId}
Authorization: Bearer {token}
Version: 2021-07-28

{ "eventStartTime": "2026-01-15T10:00:00Z" }
```

### Search Contacts

```http
GET /contacts/?locationId=abc123&query=john&limit=20
Authorization: Bearer {token}
Version: 2021-07-28
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad Request — missing or invalid fields |
| 401 | Unauthorized — invalid/expired token |
| 403 | Forbidden — insufficient scope |
| 404 | Not Found — resource doesn't exist |
| 422 | Unprocessable Entity — validation error |
| 429 | Rate limit exceeded |
| 500 | Internal Server Error |

---

## Key Naming Conventions

- `locationId` — always the sub-account (location) identifier
- `companyId` — agency-level identifier
- `contactId` — unique contact ID
- `conversationId` — conversation thread ID
- `pipelineId` / `pipelineStageId` — for opportunities
- `calendarId` — calendar resource ID
- `workflowId` — automation workflow ID
- `assignedTo` — always a `userId` string
- `dnd` — Do Not Disturb (boolean)
- `dateAdded` / `createdAt` / `updatedAt` — ISO 8601 strings
- Custom fields always passed as array: `[{ "id": "fieldId", "value": "..." }]`
