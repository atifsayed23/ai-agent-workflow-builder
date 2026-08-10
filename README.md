# AI Agent Workflow Builder (Nhost + Hasura + PostgreSQL + GraphQL + Next.js)

A multi-tenant AI agent workflow orchestrator built with **Nhost**, **Hasura GraphQL Engine**, **PostgreSQL**, and **Next.js 14**. Users within an organization create, order, and execute multi-step AI agent workflows with dual-layer security, live GraphQL subscriptions, and Hasura Actions.

---

## 🌟 Architectural Overview

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                             Next.js 14 Frontend                             │
 │   ┌───────────────────────┐ ┌──────────────────────┐ ┌──────────────────┐   │
 │   │ Workflow Canvas & Nodes│ │ Live SSE Subscriptions│ │ Security Suite   │   │
 │   └───────────┬───────────┘ └──────────┬───────────┘ └────────┬─────────┘   │
 └───────────────┼────────────────────────┼──────────────────────┼─────────────┘
                 │                        │                      │
 ┌───────────────▼────────────────────────▼──────────────────────▼─────────────┐
 │                      Hasura GraphQL Engine & Nhost                          │
 │  • Layer 1: Row-Level Security (org_members junction)                       │
 │  • Layer 2: Step-Level & Hasura Action Permission Gating                    │
 │  • Hasura Actions: triggerWorkflowRun(workflow_id), approveStep(step_run_id)│
 └───────────────┬───────────────────────────────────────────────┬─────────────┘
                 │                                               │
 ┌───────────────▼──────────────┐                ┌───────────────▼─────────────┐
 │   Workflow Execution Engine  │                │     PostgreSQL Database     │
 │  • LLM Call (Gemini API)     │                │  • organizations            │
 │  • HTTP Request (Retry Loop) │                │  • org_members (owner/ed/vw)│
 │  • Conditional Branch        │ ─────────────► │  • workflows & steps        │
 │  • Approval Gate (Pause)     │                │  • workflow_runs & step_runs│
 │  • DB Write & Alert Notify   │                │  • db_write_records & logs  │
 └──────────────────────────────┘                └─────────────────────────────┘
```

---

## 🔒 Dual-Layer Permission Enforcement

### Layer 1: Org & Role Scoping (Hasura Row-Level Security)
- Every query, mutation, and subscription scopes data to the caller's active organization (`X-Hasura-Org-Id`).
- An **Editor** or **Owner** in **Org A** can never view, query, or mutate resources belonging to **Org B**, even when supplying direct target UUIDs.
- **Roles**:
  - `owner`: Full control over workflows, steps, triggers, and members.
  - `editor`: Create/edit workflows and steps, trigger runs; cannot manage members.
  - `viewer`: Read-only access; cannot trigger runs or approve paused steps.

### Layer 2: Step-Level Gating & Hasura Action Enforcement
1. **High-Privilege Step Sandbox Guard**:
   - Creating high-privilege steps (`db_write`, `notify`, `webhook` triggers) requires the `owner` role.
   - Editors attempting to insert high-privilege steps receive an explicit security block.
2. **Approval Gate Mid-Execution Role Check**:
   - When execution reaches an `approval_gate` step, the runner sets `workflow_runs.status = 'paused'`.
   - Resuming requires invoking the Hasura Action `approveStep(step_run_id, decision)`.
   - The Action handler explicitly verifies that the caller holds an `owner` or `editor` role within the workflow's organization before resuming execution. Viewer calls or cross-org calls are rejected with `403 Forbidden`.

---

## ⚡ Step Node & Trigger Types

### Step Nodes
1. `llm_call`: Invokes Google Gemini API (`gemini-1.5-flash`) or an intelligent fallback AI engine with retry.
2. `http_request`: Executes external HTTP calls with configurable headers, method, and automatic retries.
3. `conditional_branch`: Evaluates JavaScript conditions against previous step outputs (e.g. `prev_output.status === 200`).
4. `approval_gate`: Halts run execution until an authorized user approves via Hasura Action.
5. `db_write`: Writes output payload into `db_write_records` (Owner restricted).
6. `notify`: Dispatches Slack/email alert into `notifications_log` (Owner restricted).

### Triggers
1. **Manual**: User clicks "Run Now".
2. **Webhook**: Inbound endpoint `POST /api/webhooks/workflow/[id]?token=[secret]`.
3. **Scheduled**: Cron-based scheduled execution.
4. **Database Event**: Row changes trigger automated workflow run.

---

## 🚀 How to Run Locally

### Prerequisites
- Node.js (v18+)
- npm (v10+)

### Setup Steps
```bash
# 1. Clone or navigate to the project directory
cd C:\Users\aatif\.gemini\antigravity-ide\scratch\ai-agent-workflow-builder

# 2. Install dependencies
npm install

# 3. Start Next.js Development Server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

*(Optional: Set `GEMINI_API_KEY` in `.env.local` to use live Google Gemini API calls for `llm_call` steps. If unset, it gracefully uses the fallback AI engine).*

---

## 📁 Repository Structure

- `hasura/migrations/001_init_schema.sql`: Full DDL schema for PostgreSQL.
- `hasura/metadata/`: Tables, permissions (`permissions.yaml`), and Actions (`actions.yaml`).
- `nhost/nhost.toml`: Nhost project configuration.
- `src/app/api/graphql/route.ts`: Hasura-compatible GraphQL API and SSE live subscription engine.
- `src/app/api/actions/trigger-workflow/route.ts`: Hasura Action handler for `triggerWorkflowRun`.
- `src/app/api/actions/approve-step/route.ts`: Hasura Action handler for `approveStep`.
- `src/app/api/webhooks/workflow/[id]/route.ts`: Inbound Webhook trigger endpoint.
- `src/lib/workflow-runner.ts`: Core workflow orchestration loop, retry handler, and quota tracker.
- `src/lib/db-store.ts`: Layer 1 RLS and Layer 2 permission verification engine.
- `src/components/ProofScenarioSuite.tsx`: Live 6-step Final Task criteria verification suite.
- `src/components/SecurityTestPanel.tsx`: Cross-Org Penetration Attack Simulator.

---

## ✅ Final Task Scenario Proof

The application includes an interactive **Final Task Proof Suite** verifying all 6 evaluation criteria live:
1. **Two Orgs**: Switch between Org A (Acme AI) and Org B (Stark Tech) across roles.
2. **Multi-Node Workflow**: Org A workflow chains LLM Call, HTTP API, Conditional Branch, and Approval Gate.
3. **Multi-Trigger**: Run via manual button or inbound Webhook endpoint `POST /api/webhooks/workflow/wf-acme-agent-001`.
4. **Approval Gate Pause & Resume**: Run pauses at Step 4; Owner/Editor approves to resume.
5. **Real-time Live Stream**: Subscriptions push live step status updates with zero page refresh.
6. **Cross-Org Isolation**: Logged in as Org B, direct queries, triggers, or approvals targeting Org A return `100% Access Denied`.
