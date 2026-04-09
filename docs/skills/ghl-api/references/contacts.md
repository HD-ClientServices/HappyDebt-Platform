# GHL API — Contacts Reference

Base path: `/contacts/`

## Contact Object Schema

```json
{
  "id": "string",
  "locationId": "string",
  "firstName": "string",
  "lastName": "string",
  "name": "string",                  // full name (auto-composed)
  "email": "string",
  "phone": "string",                 // E.164 format recommended: +1234567890
  "address1": "string",
  "city": "string",
  "state": "string",
  "postalCode": "string",
  "country": "string",               // ISO 2-letter code e.g. "US"
  "companyName": "string",
  "website": "string",
  "source": "string",
  "dateAdded": "string (ISO 8601)",
  "dateOfBirth": "string",           // YYYY-MM-DD
  "dnd": false,                      // Do Not Disturb
  "dndSettings": {
    "Call": { "status": "active | inactive", "message": "string", "code": "string" },
    "Email": { "status": "active | inactive", "message": "string", "code": "string" },
    "SMS": { "status": "active | inactive", "message": "string", "code": "string" },
    "WhatsApp": { "status": "active | inactive", "message": "string", "code": "string" },
    "GMB": { "status": "active | inactive", "message": "string", "code": "string" },
    "FB": { "status": "active | inactive", "message": "string", "code": "string" }
  },
  "tags": ["string"],
  "assignedTo": "string (userId)",
  "attachments": ["string (url)"],
  "customFields": [
    {
      "id": "string (fieldId)",
      "value": "string | number | array | object"
    }
  ],
  "type": "lead | customer | ...",
  "businessId": "string",
  "additionalEmails": ["string"],
  "additionalPhones": ["string"]
}
```

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/contacts/{contactId}` | Get single contact |
| `GET` | `/contacts/` | Search/list contacts |
| `POST` | `/contacts/` | Create contact |
| `PUT` | `/contacts/{contactId}` | Update contact |
| `DELETE` | `/contacts/{contactId}` | Delete contact |
| `POST` | `/contacts/upsert` | Upsert (create or update by email/phone) |
| `GET` | `/contacts/{contactId}/notes` | List notes |
| `POST` | `/contacts/{contactId}/notes` | Create note |
| `GET` | `/contacts/{contactId}/notes/{noteId}` | Get note |
| `PUT` | `/contacts/{contactId}/notes/{noteId}` | Update note |
| `DELETE` | `/contacts/{contactId}/notes/{noteId}` | Delete note |
| `GET` | `/contacts/{contactId}/tasks` | List tasks |
| `POST` | `/contacts/{contactId}/tasks` | Create task |
| `PUT` | `/contacts/{contactId}/tasks/{taskId}` | Update task |
| `PUT` | `/contacts/{contactId}/tasks/{taskId}/completed` | Mark complete |
| `DELETE` | `/contacts/{contactId}/tasks/{taskId}` | Delete task |
| `POST` | `/contacts/{contactId}/tags` | Add tags |
| `DELETE` | `/contacts/{contactId}/tags` | Remove tags |
| `GET` | `/contacts/{contactId}/appointments` | List appointments |
| `GET` | `/contacts/{contactId}/campaigns` | List campaigns |
| `POST` | `/contacts/{contactId}/campaigns/{campaignId}` | Add to campaign |
| `DELETE` | `/contacts/{contactId}/campaigns/{campaignId}` | Remove from campaign |
| `DELETE` | `/contacts/{contactId}/campaigns/removeAll` | Remove from all campaigns |
| `POST` | `/contacts/{contactId}/workflow/{workflowId}` | Add to workflow |
| `DELETE` | `/contacts/{contactId}/workflow/{workflowId}` | Remove from workflow |
| `GET` | `/contacts/{contactId}/followers` | Get followers |
| `POST` | `/contacts/{contactId}/followers` | Add follower |
| `DELETE` | `/contacts/{contactId}/followers` | Remove follower |
| `POST` | `/contacts/bulk/business` | Bulk assign business |
| `GET` | `/contacts/{contactId}/business` | Get business for contact |

## GET /contacts/ Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `locationId` | string | **Required** |
| `query` | string | Free text search |
| `email` | string | Filter by email |
| `phone` | string | Filter by phone |
| `startAfter` | number | Pagination cursor (timestamp ms) |
| `startAfterId` | string | Pagination cursor (id) |
| `limit` | number | Max results, default 20, max 100 |
| `assignedTo` | string | Filter by assigned user ID |
| `tags` | string | Comma-separated tag filter |

## Create/Update Contact Body

```json
{
  "locationId": "required_for_create",
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
  "website": "string",
  "source": "string",
  "dateOfBirth": "YYYY-MM-DD",
  "dnd": false,
  "dndSettings": { ... },
  "tags": ["tag1", "tag2"],
  "assignedTo": "userId",
  "customFields": [
    { "id": "fieldId", "value": "value" }
  ],
  "type": "lead"
}
```

## Tags Operations

```http
POST /contacts/{contactId}/tags
{ "tags": ["new-tag", "another-tag"] }

DELETE /contacts/{contactId}/tags
{ "tags": ["remove-this"] }
```

## Notes Object

```json
{
  "id": "string",
  "body": "string",
  "userId": "string",
  "dateAdded": "ISO 8601",
  "contactId": "string"
}
```

## Tasks Object

```json
{
  "id": "string",
  "title": "string",
  "body": "string",
  "dueDate": "ISO 8601",
  "completed": false,
  "assignedTo": "userId",
  "contactId": "string"
}
```

## Upsert Contact

The upsert endpoint creates a new contact or updates an existing one matched by email or phone:

```http
POST /contacts/upsert
{
  "locationId": "abc123",
  "email": "john@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "tags": ["upserted"]
}
```
Response includes `"new": true | false` to indicate if created or updated.
