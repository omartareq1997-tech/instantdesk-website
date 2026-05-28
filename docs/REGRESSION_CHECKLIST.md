# Regression Checklist

Protected flows for the lead + appointment pipeline. Run through this list after any change to `app/api/chat/route.ts`, `app/dashboard/ClientDashboard.tsx`, `app/dashboard/AIAgentSection.tsx`, or `app/dashboard/LeadPanel.tsx`.

---

## 1. Lead creation (live)

- [ ] Sending a chat message with at least one slot (city, deal type, name, phone, etc.) creates or updates a lead row in the `leads` table
- [ ] Lead appears in the Pipeline section **without a page refresh**
- [ ] Toast notification appears with the lead name
- [ ] Ring/chime plays if sound alerts are enabled
- [ ] Sending a second message on the same conversation **updates** the existing lead — does not insert a duplicate
- [ ] Lead name displayed in the toast and pipeline card is the real name (not `null`, `"null"`, or `"Website Visitor"`)

---

## 2. Appointment creation (live)

- [ ] A chat message containing a date/time (e.g. "tomorrow at 12:00", "30 May at 15:00") creates an appointment row in the `appointments` table
- [ ] Appointment appears in the Appointments section **without a page refresh**
- [ ] Appointment count badge in the nav updates immediately
- [ ] Toast notification appears ("Appointment booked")
- [ ] Ring/chime plays if sound alerts are enabled
- [ ] Sending the same date/time again on the same conversation does **not** insert a duplicate appointment (minute-precision guard)

---

## 3. Name extraction

### Must extract correctly

| Input | Expected `name` |
|---|---|
| `"my name is Sally phone number 123"` | `Sally` |
| `"my name is Sally Smith phone number 123"` | `Sally Smith` |
| `"I am Jordan 515555545"` | `Jordan` |
| `"I'm jordan"` | `Jordan` |
| `"this is Adam email adam@test.com"` | `Adam` |
| `"call me Omar"` | `Omar` |
| `"Jordan here"` | `Jordan` |

### Must never save

| Wrong value | Reason |
|---|---|
| `"Sally Phone"` | "Phone" is a label word, not part of the name |
| `"Jordan 30"` | Digits are not a name |
| `"Jordan May"` | Month names are not a last name |
| `"Website Visitor"` | Placeholder — must be replaced once a real name is known |
| `null` when a name was given | Extraction missed a valid trigger phrase |

---

## 4. Phone extraction

- [ ] `"515 555 545 30 May at 15:00"` → phone is `515 555 545` (not `515 555 545 30`)
- [ ] `"phone is 515555545 tomorrow at 12:00"` → phone is `515555545`, viewing time is `tomorrow at 12:00`
- [ ] Time patterns like `15:00` or `12:00` are never appended to the phone number
- [ ] Day-of-month digits from date strings (e.g. `30` in `30 May`) are never appended to the phone number

---

## 5. AI conversation behavior

- [ ] If `name` is already confirmed, the bot does **not** ask for the name again in the same conversation
- [ ] If `phone` is already confirmed, the bot does **not** ask for the phone again
- [ ] If `email` is already confirmed, the bot does **not** ask for the email again
- [ ] If `city` / `deal_type` / `property_type` / `rooms` / `budget` are confirmed, the bot acknowledges and moves to the next missing slot
- [ ] If an appointment exists (`viewing_time` confirmed), the bot confirms the request and does not ask for a viewing time again

---

## Before every commit

```
1.  npm run build          — must pass with zero errors
2.  Run one full chat flow in Test AI:
      "I'm looking for an apartment in Krakow, rent, 2 rooms,
       budget 3500, my name is Jordan Smith, phone 515555545,
       tomorrow at 12:00"
    Expected:
      - lead created with name=Jordan Smith, phone=515555545
      - appointment created for tomorrow 12:00
      - both appear live (no refresh)
      - toast + ring fire for lead and appointment
3.  Confirm no duplicate lead or appointment rows in Supabase
4.  Confirm name column is not null / "Website Visitor"
```
