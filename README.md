# AI Agent Workflow Builder (Nhost + Hasura + PostgreSQL + GraphQL)

🚀 **Live Demo**: [https://ai-agent-workflow-builder-dun.vercel.app](https://ai-agent-workflow-builder-dun.vercel.app)
📁 **GitHub Repo**: [https://github.com/atifsayed23/ai-agent-workflow-builder](https://github.com/atifsayed23/ai-agent-workflow-builder)

A multi-tenant AI agent workflow orchestrator built with **Nhost**, **Hasura GraphQL Engine**, **PostgreSQL**, and **Next.js 14**. Users within an organization create, order, and execute multi-step AI agent workflows with dual-layer security, Hasura Actions, Hasura Event Triggers, and live GraphQL subscriptions.

---

## 🌟 Architectural Overview

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                             Next.js 14 Frontend                             │
 │   ┌───────────────────────┐ ┌──────────────────────┐ ┌──────────────────┐   │
 │   │ Workflow Canvas & Nodes│ │ Real Subscriptions   │ │ Security Suite   │   │
 │   └───────────┬───────────┘ └──────────┬───────────┘ └────────┬─────────┘   │
 └───────────────┼────────────────────────┼──────────────────────┼─────────────┘
                 │                        │                      │
 ┌───────────────▼────────────────────────▼──────────────────────▼─────────────┐
 │                      Hasura GraphQL Engine & Nhost                          │
 │  • Layer 1 RLS: Authoritative org_members Postgres Table Lookup             │
 │  • Layer 2 Gating: Step Sandbox Guard & Hasura Actions                      │
 │  • Hasura Actions: triggerWorkflowRun(workflow_id), approveStep(step_run_id)│
 │  • Hasura Event Triggers: notifications_log INSERT -> /api/webhooks/notify  │
 │  • Hasura Cron Triggers: hourly_scheduled_workflow_runner                  │
 └───────────────┬───────────────────────────────────────────────┬─────────────┘
                 │                                               │
 ┌───────────────▼──────────────┐                ┌───────────────▼─────────────┐
 │   Workflow Execution Engine  │                │     PostgreSQL Database     │
 │  • LLM Call (Gemini API)     │                │  • organizations            │
 │  • HTTP Request (Retry Loop) │                │  • org_members (owner/ed/vw)│
 │  • Conditional Branch        │ ─────────────► │  • workflows & steps        │
 │  • Approval Gate (Pause)     │                │  • workflow_runs & step_runs│
 │  • DB Write & Event Notify   │                │  • db_write_records & logs  │
 └──────────────────────────────┘                └─────────────────────────────┘
```

---

## 🔒 Dual-Layer Permission Enforcement

### Layer 1: Authoritative Org & Role Scoping (`org_members` Table)
- Every query, mutation, and Action performs an **authoritative lookup against the PostgreSQL `org_members` table** (`SELECT role FROM org_members WHERE user_id = $1 AND org_id = $2`).
- Callers cannot fake `x-hasura-org-id` headers; if a user is not in `org_members` for that organization in PostgreSQL, the request is rejected with `Layer 1 RLS Violation (HTTP 403 Forbidden)`.
- **Roles**:
  - `owner`: Full control over workflows, steps, triggers, and members.
  - `editor`: Create/edit workflows and steps, trigger runs; cannot manage members.
  - `viewer`: Read-only access; cannot trigger runs or approve paused steps.

### Layer 2: Step-Level Gating & Hasura Action Enforcement
1. **High-Privilege Step Sandbox Guard**:
   - Creating high-privilege steps (`db_write`, `notify`, `webhook` triggers) requires the `owner` role.
   - Editors attempting to insert high-privilege steps receive an explicit security block.
2. **Approval Gate Mid-Execution Role Check**:
   - When execution reaches an `approval_gate` step, the runner updates `workflow_runs.status = 'paused'` in PostgreSQL.
   - Resuming requires invoking the Hasura Action `approveStep(step_run_id, decision)`.
   - The Action handler explicitly checks `org_members` in PostgreSQL before resuming execution.

---

## ⚡ Step Node & Trigger Types

### Step Nodes
1. `llm_call`: Invokes Google Gemini API (`gemini-1.5-flash`) or an intelligent fallback AI engine with retry.
2. `http_request`: Executes external HTTP calls with configurable headers, method, and automatic retries.
3. `conditional_branch`: Evaluates JavaScript conditions against previous step outputs.
4. `approval_gate`: Halts run execution until an authorized user approves via Hasura Action.
5. `db_write`: Inserts output payload into `db_write_records` table in PostgreSQL.
6. `notify`: Inserts alert into `notifications_log` table in PostgreSQL, firing a **Hasura Event Trigger** to dispatch Slack/email alerts.

### Triggers
1. **Manual**: User clicks "Run Now".
2. **Webhook**: Inbound endpoint `POST /api/webhooks/workflow/[id]?token=[secret]`.
3. **Scheduled**: Hasura Cron trigger configured in `hasura/metadata/cron_triggers.yaml`.
4. **Database Event**: Row changes in PostgreSQL tables invoke `/api/webhooks/db-event` to auto-start workflow runs.

---

## 🚀 How to Run Locally

### Prerequisites
- Node.js (v18+)
- npm (v10+)

### Setup Steps
```bash
# 1. Navigate to project directory
cd C:\Users\aatif\Desktop\ai-agent-workflow-builder

# 2. Install dependencies
npm install

# 3. Start Next.js Server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) or [http://localhost:3001](http://localhost:3001) in your browser.

*(Optional: Set `DATABASE_URL` or `NHOST_POSTGRES_URL` in `.env.local` to connect to an external Nhost PostgreSQL database. If unset, it uses embedded PostgreSQL engine).*

---

## 📁 Repository Structure

- `hasura/migrations/001_init_schema.sql`: Full PostgreSQL DDL schema.
- `hasura/metadata/`: Tables, permissions (`permissions.yaml`), actions (`actions.yaml`), and cron triggers (`cron_triggers.yaml`).
- `nhost/nhost.toml`: Nhost project configuration.
- `src/lib/postgres-store.ts`: Real PostgreSQL database connection and authoritative `org_members` security engine.
- `src/lib/workflow-runner.ts`: PostgreSQL workflow step execution engine, retries, and pause/resume logic.
- `src/app/api/graphql/route.ts`: Hasura-compatible GraphQL API powered by PostgreSQL.
- `src/app/api/actions/trigger-workflow/route.ts`: Hasura Action handler for `triggerWorkflowRun`.
- `src/app/api/actions/approve-step/route.ts`: Hasura Action handler for `approveStep`.
- `src/app/api/webhooks/notify/route.ts`: Hasura Event Trigger webhook handler for `notifications_log`.
- `src/app/api/webhooks/db-event/route.ts`: Hasura Event Trigger handler for row changes in watched PostgreSQL tables.
- `src/components/ProofScenarioSuite.tsx`: Live 6-step Final Task criteria verification suite.
- `src/components/SecurityTestPanel.tsx`: Cross-Org Penetration Attack Simulator.

---

## ✅ Final Task Scenario Proof

The application includes an interactive **Final Task Proof Suite** verifying all 6 evaluation criteria live against PostgreSQL:
1. **Two Orgs**: Switch between Org A (Acme AI) and Org B (Stark Tech) across roles.
2. **Multi-Node Workflow**: Org A workflow chains LLM Call, HTTP API, Conditional Branch, Approval Gate, DB Write, and Notify Event Trigger.
3. **Multi-Trigger**: Tested via Manual button and Webhook endpoint `POST /api/webhooks/workflow/11111111-2222-4111-a111-111111111111`.
4. **Approval Gate Pause & Resume**: Run pauses at Step 4; Owner/Editor approves to resume.
5. **Real-time Live Stream**: Subscriptions push live step status updates with zero page refresh.
6. **Authoritative Cross-Org Isolation**: Logged in as Org B, direct queries, triggers, or approvals targeting Org A return `100% Access Denied` from PostgreSQL `org_members` table.
