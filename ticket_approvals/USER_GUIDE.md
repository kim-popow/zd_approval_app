# Credit Memo Approval App — User Guide

## Purpose

This is a **Zendesk Support** app that appears in the **ticket sidebar**. It supports the **credit memo** process in two ways:

1. **On non–credit-memo tickets** — Create a new ticket on your account’s **Credit Memo** form and copy key data from the current ticket (see [Create a credit memo ticket](#create-a-credit-memo-ticket-from-another-ticket)).
2. **On credit memo tickets** — Guide **who must approve**, **automatic approval** when rules allow, and **approve or decline** steps using the app’s controls instead of ad‑hoc status changes.

Approval logic is driven by **rules** stored in Zendesk (a custom object). Agents with access can maintain those rules in the app’s **Manage Rules** tab.

---

## Where the app appears

- Open any ticket in the Zendesk agent workspace.
- Find the app in the **ticket sidebar** (exact placement depends on how your admin pinned or ordered apps). The app is titled **Approval App** in its manifest.

The interface follows your Zendesk **light or dark** color scheme when available.

---

## Create a credit memo ticket from another ticket

Use this when you are on a ticket whose **form name does not** match a credit memo form (the app detects forms whose name includes both **“credit”** and **“memo”**).

### What you see

- A short message that the app is intended for **Credit Memo** tickets, and (if known) the **current form** name.
- If your Zendesk instance has a ticket form whose name includes both **“credit”** and **“memo”**, a primary button: **Create Credit Memo Ticket**.

### What happens when you click it

1. A **new ticket** is created using that **Credit Memo** form.
2. The new ticket is populated where matching fields exist, including when possible:
   - **Parent ticket** (field whose title suggests parent + ticket)
   - **Account number** from the **organization** on the source ticket (organization custom field named like account + number)
   - **Product / Prod Order ID** values copied from the source ticket (handles comma, semicolon, or newline-separated lists; multiselect is supported)
3. The first **internal comment** on the new ticket notes it was created from the original ticket. If **more than one** product order ID was copied, an extra **internal warning** reminds you to leave only **one** ID before submitting for approval.
4. The **original ticket** receives an **internal comment** with a link to the new credit memo ticket.
5. Zendesk **navigates you** to the new credit memo ticket.

If the button is missing, your account may not have a form whose name matches **credit** + **memo**, or the app could not resolve it.

---

## Credit memo tickets: Evaluation and rules

When the current ticket’s **form name** includes both **“credit”** and **“memo”**, the app shows **two tabs**:

| Tab | Purpose |
|-----|---------|
| **Evaluation** | See approval state, workflow levels, which rules fired, and **Approve** / **Decline** when you are allowed. |
| **Manage Rules** | Add, edit, or delete **approval rules** (stored as custom object records). |

---

## Evaluation tab

### Status and custom statuses

The app recognizes **custom ticket statuses** by **agent-visible labels** (not exact titles—labels are matched with **contains** logic):

- **Submit** + **approval** — starting point for the automated routing.
- **Pending** + **approval** — ticket is in an approval queue.
- **Approved** — final success state (must **not** be the “pending approval” label).
- **Declined** — request was declined.
- **Cancel** — cancelled records; this path stays allowed so you can close out unneeded work.

If these statuses are missing or labeled differently, automatic assignment and buttons may not align with your workflow until labels are adjusted in Zendesk.

### Before you submit (ready to submit)

While the ticket is in a **pre-submission** custom status (not yet in submit/pending/approved/declined/cancelled), the app shows **step-by-step guidance**, including:

- Choose **Credit Memo** or **Check Request** (per your **Type of Credit** field).
- Complete required fields and add an **internal** comment explaining the request.
- Set status to **Submit for Approval** only.
- It notes that **within-limit** requests may **auto-approve**; others route for approval.

If **more than one** “Prod Order ID”–style field value is detected, a **warning** appears: only **one** ID should remain before submitting.

### Submitting for approval

1. Set the ticket’s **custom status** to **Submit for Approval** (per your Zendesk naming).
2. **Save** the ticket.

On save, the app:

- Evaluates **rules** (see [How rules are evaluated](#how-rules-are-evaluated)).
- If a matching rule is **auto-approve**, it sets the ticket toward **approved**, adds an internal note, and tags workflow progress.
- Otherwise, if approval is required, it assigns the ticket to the **Level 1** group from the rule, sets **pending approval**, adds an internal note, and applies a workflow tag.

A tag **`credit_approval_started`** is used with status to remember that the **formal approval flow** has started.

### After submission — do not move status manually

To keep approvals auditable:

- **Before** the workflow starts, if you try to change custom status to something other than **Submit for Approval**, the app may **revert** the change and **remind** you to use **Submit for Approval**.
- **After** the workflow has started, if you try to change custom status to **move the approval** (instead of using the app), the app may **revert** the change and ask you to use the **Approve** / **Decline** controls in the app.
- **Cancelled** status is still allowed so you can close out records appropriately.

### Approval workflow display

When rules require one or more levels:

- A **workflow** list shows **Level 1…n** and the **Zendesk group** responsible for each level.
- **Completed** levels, the **current** level, and **pending** levels are visually distinguished.

### Who can approve or decline

- Only agents who belong to the ticket’s **current group** (the group for the active approval level) see enabled **Approve** and **Decline** actions.
- Others see a message that only members of the current approval group may act.

### Approve

- **Mid-chain:** Approving assigns the ticket to the **next** group, keeps **pending approval**, and adds an internal comment naming the approver and next level.
- **Final level:** **Final Approval** sets the **approved** custom status and records that all required approvals are complete.

### Decline

1. Click **Decline**.
2. Enter a **required** reason in the dialog.
3. Confirm **Decline Request**.

The ticket moves to **declined**, the reason is added as an **internal** comment, and the ticket is **reassigned** to the **original submitter** when possible (otherwise falls back to the requester). After a decline, the app may allow the flow to be **re-triggered** from **Submit for Approval** again (internal reset behavior).

### Readouts on the Evaluation tab

- **Ticket ID**, **subject**, **current group**
- A **status badge** (e.g. ready to submit, requires approval, fully approved, declined, cancelled)
- **Evaluation criteria** listing which **rules** matched and whether each is **auto-approve** or requires a **level** of approval

---

## Manage Rules tab

Rules live in the Zendesk custom object **`credit_memo_approval_rules`** (the app can create the object and field definitions if they do not exist, subject to your account permissions).

### Rule concepts

Each rule has:

| Element | Meaning |
|---------|---------|
| **Rule name** | Label for admins and agents reading the evaluation list. |
| **Type of Credit** | Restricts the rule to tickets whose **credit type** field matches this value (options come from your **Type of Credit** ticket field). |
| **Check 1 & Check 2** | Two **separate** conditions. **Both** must pass for the rule to apply. Each check is: a **ticket field**, an **operator**, and usually a **value**. |
| **Auto-approve** | If checked, when this rule matches (and any other matched rules are also auto-approve), the ticket can be **approved automatically** on submit. |
| **Approval level & group** | If not auto-approve, specifies which **level** (1–5) and **Zendesk group** owns approval when the rule matches. Multiple rules can define different levels; levels are ordered **1, 2, 3…** for the workflow. |

### Operators

For each check, operators include:

- **Greater than**, **Less than** (numeric-style comparisons, with formatting such as commas tolerated)
- **Equal to**, **Not equal to**
- **Contains**, **Does not contain**
- **Is empty**, **Is not empty** (no value needed)

### Actions

- **Add New Rule** — Opens the editor; new rules default suggested fields when names like **credit amount** or **trip charge** exist.
- **Edit** / **Delete** — Maintain existing records.

---

## How rules are evaluated (summary)

1. Load all rules from the **`credit_memo_approval_rules`** custom object.
2. Determine the ticket’s **credit type** from the field whose label suggests **type** + **credit**.
3. For each rule, if **Type of Credit** does not match, skip it.
4. Each rule must have **both** checks fully configured. **Check 1** and **Check 2** must both be **true** for the rule to **fire**.
5. Fired rules contribute either:
   - **Auto-approve** (only if **every** fired rule is auto-approve), or
   - **Approval levels** (group per level; same level deduplicated).
6. **Numeric** field values are compared in a **formatting-tolerant** way (e.g. commas stripped for amounts).

---

## Prerequisites and permissions (for administrators)

For the app to work end-to-end, Zendesk should provide:

- Ticket form(s) for **credit memo** work (name includes **credit** and **memo** as the app expects).
- Custom ticket statuses whose **agent labels** match the patterns described in [Evaluation tab](#evaluation-tab).
- Ticket fields the automation looks for by **label heuristics**, including roughly:
  - **Type of Credit**
  - **Prod / product order ID**
  - Optional: **Parent ticket**, **Account number** (and organization field), for **Create Credit Memo Ticket**.
- Agent groups referenced in rules.
- API permissions for the signed-in agent to read/write tickets, groups, ticket fields, custom statuses, organizations, and the **credit_memo_approval_rules** custom object.

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| App says it is only for Credit Memo tickets | You are on the wrong form, or the form name does not include **credit** and **memo** as separate substrings in the name. |
| **Create Credit Memo Ticket** missing | No ticket form matched **credit** + **memo** in the name. |
| Rules do not load or save | Custom object not installed, or agent lacks permission to custom objects / records. |
| Submit for approval does nothing odd | Confirm **custom status** labels match what the app expects; confirm rules exist and **Type of Credit** matches. |
| Cannot approve | Your user must be in the ticket’s **current group** for the active level. |
| Status keeps reverting | You may be changing custom status **manually**; use **Submit for Approval** first, then only **Approve** / **Decline** in the app (except **Cancelled**). |

---

## Related technical documentation

For developers and deployment: see **DEPLOY.md** in this folder (build, validate, and Zendesk CLI deploy commands).
