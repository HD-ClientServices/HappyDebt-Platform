# GHL API — Users Reference

Base path: `/users/`

## User Object

```json
{
  "id": "string",
  "name": "string",
  "firstName": "string",
  "lastName": "string",
  "email": "string",
  "phone": "string",
  "extension": "string",
  "avatar": "string (url)",
  "locationIds": ["string"],
  "permissions": {
    "campaignsEnabled": true,
    "campaignsReadOnly": false,
    "contactsEnabled": true,
    "workflowsEnabled": true,
    "workflowsReadOnly": false,
    "triggersEnabled": true,
    "funnelsEnabled": true,
    "websitesEnabled": true,
    "opportunitiesEnabled": true,
    "dashboardStatsEnabled": true,
    "bulkRequestsEnabled": true,
    "appointmentsEnabled": true,
    "reviewsEnabled": true,
    "onlineListingsEnabled": true,
    "phoneCallEnabled": true,
    "conversationsEnabled": true,
    "assignedDataOnly": false,
    "adwordsReportingEnabled": false,
    "membershipEnabled": false,
    "facebookAdsReportingEnabled": false,
    "attributionsReportingEnabled": false,
    "settingsEnabled": false,
    "tagsEnabled": false,
    "leadValueEnabled": false,
    "marketingEnabled": false,
    "agentReportingEnabled": false,
    "botService": false,
    "socialPlanner": false,
    "bloggingEnabled": false,
    "invoiceEnabled": false,
    "affiliateManagerEnabled": false,
    "contentAiEnabled": false,
    "refundsEnabled": false,
    "recordPaymentEnabled": false,
    "cancelSubscriptionEnabled": false,
    "paymentsEnabled": false,
    "communitiesEnabled": false,
    "exportPaymentsEnabled": false
  },
  "roles": {
    "type": "account | agency",
    "role": "admin | user",
    "locationIds": ["string"]
  }
}
```

## User Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/users/{userId}` | Get user by ID |
| `PUT` | `/users/{userId}` | Update user |
| `DELETE` | `/users/{userId}` | Delete user |
| `GET` | `/users/` | Search users |
| `POST` | `/users/` | Create user |

## Search Users — Query Params

| Param | Description |
|-------|-------------|
| `companyId` | Agency-level search |
| `locationId` | Location-level search |
| `query` | Text search |
| `skip` | Pagination offset |
| `limit` | Default 25 |
| `type` | `account | agency` |

## Create/Update User Body

```json
{
  "companyId": "string",            // required for agency-level
  "locationIds": ["locationId"],    // locations to give access to
  "firstName": "string",
  "lastName": "string",
  "name": "string",
  "email": "string",
  "phone": "string",
  "extension": "string",
  "password": "string",             // required for create
  "type": "account | agency",
  "role": "admin | user",
  "permissions": {
    "campaignsEnabled": true,
    "contactsEnabled": true,
    "opportunitiesEnabled": true,
    "appointmentsEnabled": true,
    "conversationsEnabled": true,
    "settingsEnabled": false,
    "workflowsEnabled": true,
    "workflowsReadOnly": false,
    "funnelsEnabled": true,
    "websitesEnabled": true,
    "triggersEnabled": true,
    "reviewsEnabled": true,
    "onlineListingsEnabled": true,
    "phoneCallEnabled": true,
    "bulkRequestsEnabled": false,
    "dashboardStatsEnabled": true,
    "membershipEnabled": false,
    "bloggingEnabled": false,
    "invoiceEnabled": true,
    "paymentsEnabled": true,
    "communitiesEnabled": false,
    "socialPlanner": false,
    "assignedDataOnly": false
  }
}
```

## Notes on User Roles

- `type: "agency"` + `role: "admin"` → full agency admin access
- `type: "account"` + `role: "admin"` → admin on assigned locations only
- `type: "account"` + `role: "user"` → limited user on assigned locations
- `assignedDataOnly: true` → user only sees their own assigned contacts/opportunities
