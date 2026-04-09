# GHL API — Payments Reference

Base path: `/payments/`

## Order Object

```json
{
  "id": "string",
  "_id": "string",
  "altId": "string",
  "altType": "location",
  "locationId": "string",
  "contactId": "string",
  "contact": {
    "id": "string",
    "name": "string",
    "email": "string",
    "phone": "string"
  },
  "currency": "usd",               // ISO 4217 lowercase
  "amount": 9900,                  // in cents
  "status": "pending | completed | refunded | partially_refunded | cancelled",
  "fulfillmentStatus": "pending | fulfilled | not_fulfilled",
  "paymentMode": "live | test",
  "sourceType": "funnel | website | invoice | calendar | membership | ...",
  "sourceId": "string",
  "sourceMeta": {},
  "sourceName": "string",
  "couponCode": "string",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601",
  "items": [
    {
      "price": {
        "id": "string",
        "name": "string",
        "amount": 9900,
        "type": "one_time | recurring",
        "recurringDetails": {
          "interval": "month | year | week | day",
          "intervalCount": 1
        }
      },
      "product": {
        "id": "string",
        "name": "string",
        "productType": "DIGITAL | PHYSICAL | SERVICE"
      },
      "qty": 1,
      "amount": 9900
    }
  ]
}
```

## Transaction Object

```json
{
  "id": "string",
  "_id": "string",
  "altId": "string",
  "altType": "location",
  "contactId": "string",
  "contactSnapshot": {
    "id": "string",
    "name": "string",
    "email": "string",
    "phone": "string"
  },
  "currency": "usd",
  "amount": 9900,                  // in cents
  "status": "succeeded | pending | failed | refunded",
  "liveMode": true,
  "entityId": "string",            // orderId or subscriptionId
  "entityType": "order | subscription",
  "entitySourceType": "invoice | funnel | ...",
  "entitySourceId": "string",
  "entitySourceName": "string",
  "paymentProvider": "stripe | paypal | ...",
  "chargeId": "string",            // provider charge ID
  "locationId": "string",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601",
  "subscriptionId": "string"
}
```

## Subscription Object

```json
{
  "id": "string",
  "_id": "string",
  "altId": "string",
  "altType": "location",
  "contactId": "string",
  "locationId": "string",
  "currency": "usd",
  "amount": 2900,
  "status": "active | canceled | incomplete | incomplete_expired | past_due | trialing | unpaid",
  "currentPeriodStart": "ISO 8601",
  "currentPeriodEnd": "ISO 8601",
  "canceledAt": "ISO 8601",
  "entityId": "string",
  "entityType": "price",
  "paymentProvider": "stripe",
  "subscriptionId": "string",      // provider subscription ID
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601",
  "trialPeriodDays": 0
}
```

## Payment Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/payments/orders` | List orders |
| `GET` | `/payments/orders/{orderId}` | Get order |
| `POST` | `/payments/orders` | Create order |
| `GET` | `/payments/orders/{orderId}/fulfillments` | List fulfillments |
| `POST` | `/payments/orders/{orderId}/fulfillments` | Create fulfillment |
| `GET` | `/payments/transactions` | List transactions |
| `GET` | `/payments/transactions/{transactionId}` | Get transaction |
| `GET` | `/payments/subscriptions` | List subscriptions |
| `GET` | `/payments/subscriptions/{subscriptionId}` | Get subscription |
| `GET` | `/payments/integrations/provider/whitelabel` | Get payment config |
| `POST` | `/payments/integrations/provider/whitelabel` | Connect provider |

## List Orders — Query Params

| Param | Description |
|-------|-------------|
| `locationId` | **Required** |
| `contactId` | Filter by contact |
| `status` | Filter by status |
| `paymentMode` | `live | test` |
| `limit` | Default 20 |
| `offset` | Pagination |
| `startAt` | Date filter start (ISO 8601) |
| `endAt` | Date filter end (ISO 8601) |

## List Transactions — Query Params

| Param | Description |
|-------|-------------|
| `locationId` | **Required** |
| `contactId` | Filter by contact |
| `status` | Filter by status |
| `paymentMode` | `live | test` |
| `entityId` | Filter by order or subscription ID |
| `entitySourceType` | Filter by source |
| `subscriptionId` | Filter by subscription |
| `limit` | Default 20 |
| `offset` | Pagination |
| `startAt` | Date filter start |
| `endAt` | Date filter end |

## Invoice Endpoints

Base path: `/invoices/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/invoices/` | List invoices |
| `POST` | `/invoices/` | Create invoice |
| `GET` | `/invoices/{invoiceId}` | Get invoice |
| `PUT` | `/invoices/{invoiceId}` | Update invoice |
| `DELETE` | `/invoices/{invoiceId}` | Delete invoice |
| `POST` | `/invoices/{invoiceId}/send` | Send invoice |
| `POST` | `/invoices/{invoiceId}/record-payment` | Record payment |
| `POST` | `/invoices/{invoiceId}/void` | Void invoice |
| `GET` | `/invoices/template` | List templates |
| `POST` | `/invoices/template` | Create template |
| `GET` | `/invoices/schedule` | List scheduled invoices |
| `POST` | `/invoices/schedule` | Create schedule |
| `POST` | `/invoices/schedule/{scheduleId}/auto-payment` | Manage auto payment |
| `POST` | `/invoices/schedule/{scheduleId}/cancel` | Cancel schedule |
