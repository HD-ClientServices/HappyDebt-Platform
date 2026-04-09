# GHL API — Locations (Sub-accounts) Reference

Base path: `/locations/`

## Location Object

```json
{
  "id": "string",
  "name": "string",
  "phone": "string",
  "email": "string",
  "address": "string",
  "city": "string",
  "state": "string",
  "country": "string",             // ISO 2-letter: "US", "CA", etc.
  "postalCode": "string",
  "website": "string",
  "timezone": "string",            // IANA: "America/New_York"
  "logoUrl": "string",
  "businessId": "string",          // agency/company ID
  "reseller": {
    "agencyName": "string",
    "agencyEmail": "string"
  },
  "social": {
    "facebookUrl": "string",
    "googlePlus": "string",
    "linkedIn": "string",
    "foursquare": "string",
    "twitter": "string",
    "yelp": "string",
    "instagram": "string",
    "youtube": "string",
    "pinterest": "string",
    "blogRss": "string",
    "googlePlacesId": "string"
  },
  "settings": {
    "allowDuplicateContact": false,
    "allowDuplicateOpportunity": false,
    "allowFacebookNameMerge": false,
    "disableContactTimezone": false
  },
  "dateAdded": "ISO 8601",
  "domain": "string",
  "customerType": "agency | account"
}
```

## Location Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/locations/{locationId}` | Get location |
| `PUT` | `/locations/{locationId}` | Update location |
| `DELETE` | `/locations/{locationId}` | Delete sub-account |
| `POST` | `/locations/` | Create sub-account (Agency) |
| `GET` | `/locations/search` | Search locations (Agency) |

## Sub-resource Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/locations/{locationId}/customFields` | List custom fields |
| `POST` | `/locations/{locationId}/customFields` | Create custom field |
| `GET` | `/locations/{locationId}/customFields/{id}` | Get custom field |
| `PUT` | `/locations/{locationId}/customFields/{id}` | Update custom field |
| `DELETE` | `/locations/{locationId}/customFields/{id}` | Delete custom field |
| `GET` | `/locations/{locationId}/customValues` | List custom values |
| `POST` | `/locations/{locationId}/customValues` | Create custom value |
| `GET` | `/locations/{locationId}/customValues/{id}` | Get custom value |
| `PUT` | `/locations/{locationId}/customValues/{id}` | Update custom value |
| `DELETE` | `/locations/{locationId}/customValues/{id}` | Delete custom value |
| `GET` | `/locations/{locationId}/tags` | List tags |
| `POST` | `/locations/{locationId}/tags` | Create tag |
| `GET` | `/locations/{locationId}/tags/{tagId}` | Get tag |
| `PUT` | `/locations/{locationId}/tags/{tagId}` | Update tag |
| `DELETE` | `/locations/{locationId}/tags/{tagId}` | Delete tag |
| `GET` | `/locations/{locationId}/templates` | List templates |
| `DELETE` | `/locations/{locationId}/templates/{id}` | Delete template |
| `GET` | `/locations/{locationId}/pipelines` | List pipelines (shortcut) |
| `GET` | `/locations/{locationId}/users` | List users |
| `GET` | `/locations/{locationId}/tasks` | List tasks |
| `GET` | `/locations/{locationId}/snippets` | List snippets |
| `GET` | `/locations/{locationId}/timezones` | List timezones |

## Search Locations — Query Params (Agency only)

| Param | Description |
|-------|-------------|
| `companyId` | **Required** — your agency ID |
| `query` | Text search on name |
| `limit` | Default 10 |
| `skip` | Pagination offset |
| `order` | `asc | desc` |
| `sortBy` | `createdAt | name` |

## Create Location Body (Agency)

```json
{
  "name": "Client Business Name",
  "phone": "+1234567890",
  "email": "client@business.com",
  "address": "123 Main St",
  "city": "Austin",
  "state": "TX",
  "country": "US",
  "postalCode": "78701",
  "website": "https://business.com",
  "timezone": "America/Chicago",
  "companyId": "your_agency_companyId",
  "prospectInfo": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "owner@business.com"
  },
  "settings": {
    "allowDuplicateContact": false,
    "allowDuplicateOpportunity": false
  },
  "social": {
    "facebookUrl": "",
    "instagram": ""
  },
  "snapshot": {
    "id": "snapshotId",       // optional: apply a snapshot on creation
    "type": "own_agency | market_place"
  }
}
```

## Custom Field Object

```json
{
  "id": "string",
  "name": "string",
  "fieldKey": "contact.custom_field_key",
  "placeholder": "string",
  "dataType": "TEXT | LARGE_TEXT | NUMERICAL | PHONE | MONETORY | CHECKBOX | SINGLE_OPTIONS | MULTIPLE_OPTIONS | FLOAT | TIME | DATE | FILE_UPLOAD | SIGNATURE | LIST",
  "position": 0,
  "picklistOptions": ["Option 1", "Option 2"],
  "picklistImageOptions": [],
  "isAllowedCustomOption": false,
  "isMultiFileAllowed": false,
  "maxFileLimit": 1,
  "locationId": "string",
  "model": "contact | opportunity"
}
```

## Custom Value Object

Custom values are reusable variables (like `{{custom_values.company_name}}`):

```json
{
  "id": "string",
  "name": "string",
  "fieldKey": "custom_values.field_key",
  "value": "string",
  "locationId": "string"
}
```
