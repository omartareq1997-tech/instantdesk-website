# Demo Testing Guide

## Before the demo — clean test data

1. Open **Supabase → SQL Editor**
2. Open `sql/cleanup_test_data.sql`
3. Run the **preview SELECT** (section 0) first — confirm only test rows appear
4. Run the **DELETE block** (section 1) — the transaction rolls back on any error
5. Run the **verify SELECT** (section 2) — confirm 0 remaining test leads

The script removes any lead where `email` ends in `@test.com` or `name` starts with `Test / Adam / Ahmad / Sally / Jordan`. Real leads are never touched.

---

## Demo message

Use this exact message in **Test AI** (`/dashboard#ai_test`):

```
I'm looking to rent a 2-room apartment in Krakow, budget around 3500 PLN.
My name is Jordan Smith, phone 515555545, email jordan@test.com.
Can we arrange a viewing tomorrow at 12:00?
```

Send it as a single message.

---

## Expected results

### Lead (Pipeline section)

| Field | Expected value |
|---|---|
| Name | `Jordan Smith` |
| Phone | `515555545` |
| Email | `jordan@test.com` |
| City | `Krakow` |
| Deal type | `rent` |
| Rooms | `2` |
| Budget | `3500` |

- Lead row appears **without a page refresh**
- Lead card shows the correct name (not `null`, `"null"`, or `"Website Visitor"`)

### Appointment (Appointments section)

| Field | Expected value |
|---|---|
| Name | `Jordan Smith` |
| Type | `viewing` (or similar) |
| Date | tomorrow's date |
| Time | `12:00` |

- Appointment row appears **without a page refresh**

### Toast notifications

| Toast | Content |
|---|---|
| Lead toast | Title: `Jordan Smith` · Badge: score label (hot/warm/cold) |
| Appointment toast | Title: `Appointment booked` · Sub: `Jordan Smith · viewing · <date> at 12:00` |

Both toasts appear within 2–3 seconds of sending the message.

### Sound alert

- Lead chime plays when the lead is created
- Appointment chime plays when the appointment is created
- Requires **Enable Sound** to be clicked at least once in the session

### Qualification panel (right side of Test AI)

The panel updates after the message is sent and shows:

| Field | State |
|---|---|
| Name | confirmed — `Jordan Smith` |
| Phone | confirmed — `515555545` |
| City | confirmed — `Krakow` |
| Deal type | confirmed — `rent` |
| Rooms | confirmed — `2` |
| Budget | confirmed — `3500` |
| Viewing time | confirmed — tomorrow 12:00 |
| Stage | `booked` |

All slots confirmed — no missing fields shown.

---

## Regression checks before the demo

Run through `docs/REGRESSION_CHECKLIST.md` section 1 and 2 after any code change.

Minimum pre-demo build check:

```bash
npm run build   # must pass with zero errors
```
