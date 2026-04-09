# GHL API — Other Modules Reference

## Workflows

Base path: `/workflows/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/workflows/` | List workflows |

Query params: `locationId` (required)

Workflow Object:
```json
{
  "id": "string",
  "name": "string",
  "status": "draft | live | archived",
  "locationId": "string",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

To add a contact to a workflow:
```http
POST /contacts/{contactId}/workflow/{workflowId}
{ "eventStartTime": "ISO 8601" }
```

---

## Forms

Base path: `/forms/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/forms/` | List forms |
| `GET` | `/forms/submissions` | List form submissions |

Query params for submissions:
- `locationId` (required)
- `formId`
- `contactId`
- `startAt`, `endAt` (ISO 8601 date filters)
- `limit`, `skip`

Submission Object:
```json
{
  "id": "string",
  "formId": "string",
  "locationId": "string",
  "contactId": "string",
  "name": "string",
  "email": "string",
  "phone": "string",
  "dateAdded": "ISO 8601",
  "formData": {
    "field_key": "value"
  }
}
```

---

## Surveys

Base path: `/surveys/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/surveys/` | List surveys |
| `GET` | `/surveys/submissions` | List survey submissions |

---

## Funnels

Base path: `/funnels/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/funnels/` | List funnels |
| `GET` | `/funnels/pages` | List funnel pages |

---

## Blogs

Base path: `/blogs/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/blogs/posts` | List blog posts |
| `POST` | `/blogs/posts` | Create post |
| `PUT` | `/blogs/posts/{postId}` | Update post |
| `DELETE` | `/blogs/posts/{postId}` | Delete post |
| `GET` | `/blogs/authors` | List authors |
| `POST` | `/blogs/authors` | Create author |
| `GET` | `/blogs/categories` | List categories |
| `POST` | `/blogs/categories` | Create category |

---

## Social Media Planner

Base path: `/social-media-posting/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/social-media-posting/accounts` | List connected accounts |
| `GET` | `/social-media-posting/posts` | List posts |
| `POST` | `/social-media-posting/posts` | Create/schedule post |
| `PUT` | `/social-media-posting/posts/{postId}` | Update post |
| `DELETE` | `/social-media-posting/posts/{postId}` | Delete post |
| `GET` | `/social-media-posting/categories` | List categories |
| `POST` | `/social-media-posting/categories` | Create category |

---

## Media Library

Base path: `/medias/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/medias/` | List media files |
| `POST` | `/medias/upload-file` | Upload file |
| `DELETE` | `/medias/{fileId}` | Delete file |

---

## Products

Base path: `/products/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/products/` | List products |
| `POST` | `/products/` | Create product |
| `GET` | `/products/{productId}` | Get product |
| `PUT` | `/products/{productId}` | Update product |
| `DELETE` | `/products/{productId}` | Delete product |
| `GET` | `/products/{productId}/prices` | List prices |
| `POST` | `/products/{productId}/prices` | Create price |
| `GET` | `/products/{productId}/prices/{priceId}` | Get price |
| `PUT` | `/products/{productId}/prices/{priceId}` | Update price |
| `DELETE` | `/products/{productId}/prices/{priceId}` | Delete price |

Product Object:
```json
{
  "id": "string",
  "locationId": "string",
  "name": "string",
  "description": "string",
  "productType": "DIGITAL | PHYSICAL | SERVICE",
  "imageUrls": ["string"],
  "isTaxesEnabled": false,
  "availableInStore": true,
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601",
  "statementDescriptor": "string"
}
```

Price Object:
```json
{
  "id": "string",
  "productId": "string",
  "locationId": "string",
  "name": "string",
  "type": "one_time | recurring",
  "amount": 9900,                   // in cents
  "currency": "usd",
  "recurring": {
    "interval": "month | year | week | day",
    "intervalCount": 1,
    "trialPeriodDays": 0
  },
  "variantOptionIds": [],
  "compare_at_price": 0,
  "trackInventory": false,
  "availableQuantity": null,
  "allowOutOfStockPurchases": false
}
```

---

## Links / URL Shortener

Base path: `/links/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/links/` | List links |
| `POST` | `/links/` | Create link |
| `PUT` | `/links/{linkId}` | Update link |
| `DELETE` | `/links/{linkId}` | Delete link |

---

## SaaS API (Agency Plans)

Base path: `/saas-api/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/saas-api/locations/{locationId}/plans` | Get location plan |
| `POST` | `/saas-api/bulk-disable-saas-locations` | Bulk disable SaaS |
| `POST` | `/saas-api/update-saas-subscription` | Update subscription |
| `PUT` | `/saas-api/locations/{locationId}/enable-saas` | Enable SaaS for location |
| `PUT` | `/saas-api/locations/{locationId}/disable-saas` | Disable SaaS |
| `PUT` | `/saas-api/locations/{locationId}/pause-subscription` | Pause subscription |
| `POST` | `/saas-api/update-rebilling` | Update rebilling settings |

---

## LC Email (Email Service)

Base path: `/emails/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/emails/` | Send email |
| `GET` | `/emails/{emailId}` | Get email status |

---

## Associations / Relationships

Base path: `/associations/`

Used to link records across objects (e.g., Contact → Company).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/associations/` | List associations |
| `POST` | `/associations/` | Create association |
| `DELETE` | `/associations/{associationId}` | Delete association |

---

## Companies (Business Object)

Base path: `/companies/` (Agency-level) and `/businesses/` (Location-level)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/businesses/` | List businesses |
| `POST` | `/businesses/` | Create business |
| `GET` | `/businesses/{businessId}` | Get business |
| `PUT` | `/businesses/{businessId}` | Update business |
| `DELETE` | `/businesses/{businessId}` | Delete business |

Business Object:
```json
{
  "id": "string",
  "locationId": "string",
  "name": "string",
  "phone": "string",
  "email": "string",
  "address": "string",
  "city": "string",
  "state": "string",
  "postalCode": "string",
  "country": "string",
  "website": "string",
  "description": "string",
  "niche": "string"
}
```
