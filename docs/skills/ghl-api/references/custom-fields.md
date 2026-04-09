# GHL API — Custom Fields & Custom Objects Reference

## Custom Fields v2

Base path: `/custom-fields/`

Custom fields extend Contact, Opportunity, and Business objects with business-specific data.

### Custom Field Object

```json
{
  "id": "string",
  "name": "string",
  "fieldKey": "contact.field_key_here",   // prefixed with object type
  "placeholder": "string",
  "dataType": "TEXT",
  "position": 0,
  "picklistOptions": ["Option A", "Option B"],
  "picklistImageOptions": [],
  "isAllowedCustomOption": false,
  "isMultiFileAllowed": false,
  "maxFileLimit": 1,
  "locationId": "string",
  "model": "contact | opportunity | business"
}
```

### Data Types

| dataType | Description | value format |
|----------|-------------|--------------|
| `TEXT` | Single-line text | `"string"` |
| `LARGE_TEXT` | Multi-line text | `"string"` |
| `NUMERICAL` | Integer number | `"123"` or `123` |
| `FLOAT` | Decimal number | `"12.5"` or `12.5` |
| `PHONE` | Phone number | `"+1234567890"` |
| `MONETORY` | Currency value | `"99.99"` |
| `DATE` | Date | `"YYYY-MM-DD"` |
| `TIME` | Time | `"HH:MM"` |
| `CHECKBOX` | True/false | `true` or `false` |
| `SINGLE_OPTIONS` | Dropdown (one) | `"Option A"` |
| `MULTIPLE_OPTIONS` | Checkboxes (many) | `["Option A", "Option B"]` |
| `FILE_UPLOAD` | File URL | `"https://..."` |
| `SIGNATURE` | Signature data | `"base64 or url"` |
| `LIST` | List of text items | `["item1", "item2"]` |

### Endpoints (Custom Fields v2)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/custom-fields/` | List custom fields |
| `POST` | `/custom-fields/` | Create custom field |
| `GET` | `/custom-fields/{id}` | Get custom field |
| `PUT` | `/custom-fields/{id}` | Update custom field |
| `DELETE` | `/custom-fields/{id}` | Delete custom field |
| `PUT` | `/custom-fields/reorder` | Reorder fields |

### Create Custom Field Body

```json
{
  "locationId": "string",
  "name": "Lead Score",
  "dataType": "NUMERICAL",
  "model": "contact",
  "placeholder": "Enter lead score",
  "position": 0
}
```

For options-based fields:
```json
{
  "locationId": "string",
  "name": "Industry",
  "dataType": "SINGLE_OPTIONS",
  "model": "contact",
  "picklistOptions": ["SaaS", "E-commerce", "Healthcare", "Real Estate"],
  "isAllowedCustomOption": true
}
```

### Reading Custom Field Keys

The `fieldKey` property (e.g., `contact.lead_score`) is used in:
- Workflow conditions
- Funnel/website merge tags: `{{contact.lead_score}}`
- Smart lists filters

**Important:** When sending values via API in a contact's `customFields` array, use the field's `id` (not `fieldKey`):
```json
"customFields": [
  { "id": "abc123fieldId", "value": "High" }
]
```

---

## Custom Objects

Base path: `/objects/`

Custom Objects allow creating entirely custom data structures beyond Contacts, Opportunities, and Businesses.

### Supported Standard Objects

- `contact`
- `opportunity`
- `business`
- Any custom object (created by user)

### Object Schema Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/objects/` | List all objects for location |
| `POST` | `/objects/` | Create custom object schema |
| `GET` | `/objects/{objectKey}` | Get object schema |
| `PUT` | `/objects/{objectKey}` | Update object schema |

### Object Records Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/objects/{objectKey}/records` | List records |
| `POST` | `/objects/{objectKey}/records` | Create record |
| `GET` | `/objects/{objectKey}/records/{recordId}` | Get record |
| `PUT` | `/objects/{objectKey}/records/{recordId}` | Update record |
| `DELETE` | `/objects/{objectKey}/records/{recordId}` | Delete record |

### Object Schema Body

```json
{
  "locationId": "string",
  "labels": {
    "singular": "Project",
    "plural": "Projects"
  },
  "description": "Tracks client projects",
  "fields": [
    {
      "key": "project_name",
      "label": "Project Name",
      "dataType": "TEXT",
      "isRequired": true
    },
    {
      "key": "budget",
      "label": "Budget",
      "dataType": "MONETORY"
    },
    {
      "key": "status",
      "label": "Status",
      "dataType": "SINGLE_OPTIONS",
      "picklistOptions": ["Planning", "In Progress", "Done"]
    }
  ]
}
```

---

## Custom Values (Location Variables)

Custom Values are reusable text variables accessible in templates, workflows, and messages via merge tags like `{{custom_values.company_address}}`.

### Endpoints (under Locations)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/locations/{locationId}/customValues` | List all |
| `POST` | `/locations/{locationId}/customValues` | Create |
| `GET` | `/locations/{locationId}/customValues/{id}` | Get one |
| `PUT` | `/locations/{locationId}/customValues/{id}` | Update |
| `DELETE` | `/locations/{locationId}/customValues/{id}` | Delete |

### Custom Value Object

```json
{
  "id": "string",
  "name": "Company Address",
  "fieldKey": "custom_values.company_address",
  "value": "123 Main St, Austin TX 78701",
  "locationId": "string"
}
```
