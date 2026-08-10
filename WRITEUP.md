# AI Agent Workflow Builder — Technical Write-Up

## Schema Design & Reasoning

The PostgreSQL schema is organized around a strict **multi-tenant hierarchy**:

```
organizations
    └── org_members        (user → org relationship + role)
    └── workflows          (owned by org)
          └── workflow_steps    (ordered step nodes)
          └── workflow_triggers (manual, webhook, scheduled, db_event)
          └── workflow_runs     (execution instances)
                └── step_runs   (individual step execution records)
    └── db_write_records   (audit log from db_write steps)
    └── notifications_log  (alert records from notify steps, fires Event Trigger)
```

Every table carries an `org_id` foreign key. Cross-organization access is structurally impossible because all queries filter through `org_id`, validated by the `org_members` junction table at both the Hasura permission and Action handler layers.

The `org_members` table is the authoritative source of truth: it stores `(org_id, user_id, role)` with a `UNIQUE(org_id, user_id)` constraint. Roles are strictly `owner`, `editor`, or `viewer`.

---

## Two Permission Layers — How They Are Enforced Differently

### Layer 1 — Hasura Table Permissions (Declarative, SQL-Level)

Configured in `hasura/metadata/permissions.yaml`. Every table SELECT/INSERT/UPDATE/DELETE permission contains a row-level filter that **joins org_members**:

```yaml
filter:
  organization:
    members:
      user_id: { _eq: "X-Hasura-User-Id" }
```

This is enforced **inside PostgreSQL by Hasura** before any row is returned. Even if a malicious client guesses an Org A workflow UUID while authenticated as an Org B user, Hasura's generated SQL `WHERE` clause includes the `org_members` join — returning zero rows. It cannot be bypassed at the query level.

High-privilege step types (`db_write`, `notify`) are additionally restricted at the INSERT permission level — `editor` role has an extra `type: { _nin: ["db_write", "notify"] }` constraint baked into the Hasura permission, so even a direct GraphQL mutation from an editor will be rejected by the database engine.

### Layer 2 — Action Handler Checks (Imperative, Server-Side)

Action handlers (`/api/actions/trigger-workflow`, `/api/actions/approve-step`) perform an explicit SQL query against `org_members`:

```sql
SELECT role FROM public.org_members
WHERE user_id = $1 AND org_id = $2;
```

This second check is critical because Actions execute custom server-side logic that bypasses declarative table permissions. It provides an audit-friendly, explicit rejection with a human-readable error message. The combined security model requires an attacker to bypass **both** PostgreSQL row-level filtering and the server-side org_members lookup — in two independent code paths.

---

## Approval Gate — Pause / Resume Implementation

**Pause:**
1. The step executor returns `{ isPaused: true }` without throwing.
2. The runner writes `step_runs.status = 'paused'` and `workflow_runs.status = 'paused'` to PostgreSQL.
3. Execution of the step loop returns early — no further steps run.
4. A Hasura subscription (`StepRunUpdates`) immediately broadcasts the `paused` state to the frontend.

**Resume (via `approveStep` Hasura Action):**
1. The caller invokes the `approveStep` Action with `step_run_id` and `decision: "approve" | "reject"`.
2. The Action handler queries `step_runs` → `workflow_runs` → calls `verifyAuthoritativeOrgMember(user_id, org_id)` (Layer 2 check) → rejects if `viewer` role or wrong org.
3. On approval, `step_runs.status` is set to `completed` with `approved_by` and `approved_at` timestamps.
4. `workflow_runs.status` resets to `running` and the step loop resumes from the next step index.
5. The Hasura subscription broadcasts: `paused → running → completed` in real time.

This design is durable — if the server restarts while paused, the `paused` status persists in PostgreSQL and a new Action invocation can resume it correctly.

---

## LLM Integration & Fallback

The application calls the **Google Gemini API** (`gemini-1.5-flash`) when `GEMINI_API_KEY` is set. If the key is absent or the call fails, it falls back to a **mock AI engine** with an artificial 800ms delay — clearly documented in `README.md` — so the workflow demonstrates the full pipeline without a real API key.
