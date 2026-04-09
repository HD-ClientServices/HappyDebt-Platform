# GHL API — Opportunities & Pipelines Reference

Base path: `/opportunities/`

## Opportunity Object

```json
{
  "id": "string",
  "name": "string",
  "pipelineId": "string",
  "pipelineStageId": "string",
  "assignedTo": "string (userId)",
  "status": "open | won | lost | abandoned | all",
  "monetaryValue": 0,
  "source": "string",
  "contactId": "string",
  "locationId": "string",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601",
  "lastStatusChangeAt": "ISO 8601",
  "lastStageChangeAt": "ISO 8601",
  "lastActionDate": "ISO 8601",
  "indexVersion": "string",
  "businessId": "string",
  "contact": {
    "id": "string",
    "name": "string",
    "companyName": "string",
    "email": "string",
    "phone": "string",
    "tags": ["string"]
  },
  "notes": ["string"],
  "tasks": ["string"],
  "calendarEvents": ["string"],
  "customFields": [
    { "id": "string (fieldId)", "value": "string | array" }
  ]
}
```

## Pipeline Object

```json
{
  "id": "string",
  "name": "string",
  "locationId": "string",
  "stages": [
    {
      "id": "string",
      "name": "string",
      "position": 0,
      "showInFunnel": true,
      "showInPieChart": true
    }
  ],
  "showInFunnel": true,
  "showInPieChart": true
}
```

## Opportunity Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/opportunities/search` | Search opportunities |
| `GET` | `/opportunities/{opportunityId}` | Get opportunity |
| `POST` | `/opportunities/` | Create opportunity |
| `PUT` | `/opportunities/{opportunityId}` | Update opportunity |
| `DELETE` | `/opportunities/{opportunityId}` | Delete opportunity |
| `PUT` | `/opportunities/{opportunityId}/status` | Update status only |
| `POST` | `/opportunities/{opportunityId}/followers` | Add follower |
| `DELETE` | `/opportunities/{opportunityId}/followers` | Remove follower |
| `GET` | `/opportunities/pipelines` | List all pipelines |

## Search Opportunities — Query Params

| Param | Type | Description |
|-------|------|-------------|
| `location_id` | string | **Required** (note: underscore) |
| `pipeline_id` | string | Filter by pipeline |
| `pipeline_stage_id` | string | Filter by stage |
| `assigned_to` | string | Filter by user |
| `contact_id` | string | Filter by contact |
| `status` | string | `open | won | lost | abandoned | all` |
| `query` | string | Text search |
| `startAfter` | string | Pagination cursor |
| `limit` | number | Default 20, max 100 |
| `order` | string | `added_asc | added_desc | name_asc | name_desc` |
| `get_calendar_events` | boolean | Include calendar events |
| `get_notes` | boolean | Include notes |
| `get_tasks` | boolean | Include tasks |

## Create/Update Opportunity Body

```json
{
  "pipelineId": "string",           // required for create
  "locationId": "string",           // required for create
  "contactId": "string",
  "name": "New Website Project",
  "pipelineStageId": "string",
  "status": "open",
  "assignedTo": "userId",
  "monetaryValue": 5000,
  "source": "API",
  "customFields": [
    { "id": "fieldId", "value": "value" }
  ]
}
```

## Update Status Body

```json
{
  "status": "won"   // open | won | lost | abandoned
}
```

## Pipeline Endpoints

```http
GET /opportunities/pipelines?locationId={locationId}
```

Returns array of pipelines, each with `stages[]` array containing stage IDs and names.
Used to get valid `pipelineId` and `pipelineStageId` values.
