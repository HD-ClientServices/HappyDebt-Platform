# GHL API — Calendars & Appointments Reference

Base path: `/calendars/`

## Calendar Object

```json
{
  "id": "string",
  "locationId": "string",
  "name": "string",
  "description": "string",
  "slug": "string",
  "widgetSlug": "string",
  "widgetType": "default | classic",
  "calendarType": "event | class_booking | collective | service_booking | personal",
  "eventType": "RoundRobin_OptimizeForAvailability | RoundRobin_OptimizeForEqualDistribution | Event | Collective | Personal | Class_Booking | Service_Booking",
  "teamMembers": [
    {
      "userId": "string",
      "priority": 0.5,
      "meetingLocationType": "default | custom | zoom | googlemeet | msteams | phone",
      "meetingLocation": "string"
    }
  ],
  "availability": {
    "sunday": { "isAvailable": false, "hours": [] },
    "monday": { "isAvailable": true, "hours": [{ "openHour": 9, "openMinute": 0, "closeHour": 17, "closeMinute": 0 }] }
    // ... other days
  },
  "formId": "string",
  "stickyContact": false,
  "isActive": true,
  "appointmentPerSlot": 1,
  "appointmentPerDay": null,
  "slotDuration": 30,               // minutes
  "slotDurationUnit": "mins",
  "slotBuffer": 0,
  "preBuffer": 0,
  "allowBookingAfter": 0,
  "allowBookingAfterUnit": "hours",
  "allowBookingFor": 60,
  "allowBookingForUnit": "days",
  "autoConfirm": true,
  "shouldSendAlertEmailsToAssignedMember": true,
  "notes": "string",
  "pixelId": "string",
  "color": "#000000",
  "consentLabel": "string",
  "googleInvitationEmails": false,
  "notifications": []
}
```

## Appointment Object

```json
{
  "id": "string",
  "calendarId": "string",
  "locationId": "string",
  "contactId": "string",
  "groupId": "string",
  "appoinmentStatus": "new | confirmed | cancelled | showed | noshow | invalid",
  "assignedUserId": "string",
  "title": "string",
  "startTime": "ISO 8601",          // e.g. "2026-03-15T10:00:00-05:00"
  "endTime": "ISO 8601",
  "address": "string",
  "notes": "string",
  "isRecurring": false,
  "masterEventId": "string",        // for recurring events
  "rrule": "string",                // RFC 5545 recurrence rule
  "color": "string",
  "ignoreDateRange": false,
  "toNotify": false
}
```

## Free Slot Object

```json
{
  "slots": ["2026-03-15T10:00:00-05:00", "2026-03-15T10:30:00-05:00"]
}
```

## Calendar Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/calendars/` | List calendars |
| `POST` | `/calendars/` | Create calendar |
| `GET` | `/calendars/{calendarId}` | Get calendar |
| `PUT` | `/calendars/{calendarId}` | Update calendar |
| `DELETE` | `/calendars/{calendarId}` | Delete calendar |
| `GET` | `/calendars/{calendarId}/free-slots` | Get available slots |
| `GET` | `/calendars/groups` | List calendar groups |
| `POST` | `/calendars/groups` | Create calendar group |
| `PUT` | `/calendars/groups/{groupId}` | Update group |
| `DELETE` | `/calendars/groups/{groupId}` | Delete group |
| `POST` | `/calendars/groups/validate-slug` | Validate group slug |
| `PUT` | `/calendars/groups/{groupId}/status` | Enable/disable group |

## Appointment/Event Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/calendars/events` | List events (date range) |
| `GET` | `/calendars/events/appointments/{appointmentId}` | Get appointment |
| `POST` | `/calendars/events/appointments` | Create appointment |
| `PUT` | `/calendars/events/appointments/{appointmentId}` | Update appointment |
| `DELETE` | `/calendars/events/appointments/{appointmentId}` | Delete/cancel |
| `POST` | `/calendars/events/block-slots` | Create block slot |
| `PUT` | `/calendars/events/block-slots/{eventId}` | Update block slot |

## GET /calendars/ Query Params

| Param | Description |
|-------|-------------|
| `locationId` | **Required** |

## GET Free Slots Query Params

| Param | Type | Description |
|-------|------|-------------|
| `startDate` | number | Unix timestamp (ms) — **required** |
| `endDate` | number | Unix timestamp (ms) — **required** |
| `timezone` | string | IANA timezone, e.g. `"America/New_York"` |
| `userId` | string | Filter by team member |

## GET Events Query Params

| Param | Type | Description |
|-------|------|-------------|
| `locationId` | string | **Required** |
| `calendarId` | string | Filter by calendar |
| `groupId` | string | Filter by group |
| `startTime` | number | Unix timestamp (ms) |
| `endTime` | number | Unix timestamp (ms) |
| `userId` | string | Filter by user |

## Create Appointment Body

```json
{
  "calendarId": "string",
  "locationId": "string",
  "contactId": "string",
  "startTime": "2026-03-15T10:00:00-05:00",
  "endTime": "2026-03-15T10:30:00-05:00",
  "title": "Discovery Call",
  "appointmentStatus": "confirmed",
  "assignedUserId": "string",
  "address": "Zoom Meeting",
  "notes": "Pre-qualified lead",
  "ignoreDateRange": false,
  "toNotify": true
}
```

## Appointment Status Values

- `new` — just created, not yet confirmed
- `confirmed` — confirmed by assignee
- `cancelled` — cancelled
- `showed` — contact showed up
- `noshow` — contact didn't show
- `invalid` — marked invalid
