import { newDb, DataType } from 'pg-mem';
import { Pool as PgPool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  Organization,
  OrgMember,
  Workflow,
  WorkflowStep,
  WorkflowTrigger,
  WorkflowRun,
  StepRun,
  DbWriteRecord,
  NotificationLog,
  UserSession,
  StepType,
  OrgRole
} from './types';

let dbInstance: any = null;
let isInitialized = false;

// Pre-seeded multi-tenant constants for Org A and Org B
export const ORG_A_ID = '11111111-1111-4111-a111-111111111111';
export const ORG_B_ID = '22222222-2222-4222-b222-222222222222';

export const USER_A_OWNER_ID = 'aaaa1111-1111-4111-a111-111111111111';
export const USER_A_EDITOR_ID = 'aaaa2222-2222-4222-a222-222222222222';
export const USER_A_VIEWER_ID = 'aaaa3333-3333-4333-a333-333333333333';

export const USER_B_OWNER_ID = 'bbbb1111-1111-4111-b111-111111111111';
export const USER_B_EDITOR_ID = 'bbbb2222-2222-4222-b222-222222222222';

export const WORKFLOW_A_ID = '11111111-2222-4111-a111-111111111111';
export const WORKFLOW_B_ID = '22222222-3333-4222-b222-222222222222';

export async function getPgEngine() {
  if (dbInstance && isInitialized) return dbInstance;

  const dbUrl = process.env.DATABASE_URL || process.env.NHOST_POSTGRES_URL;

  if (dbUrl) {
    console.log('Connecting to Nhost / External PostgreSQL database via pg Pool...');
    dbInstance = new PgPool({ connectionString: dbUrl });
  } else {
    console.log('Initializing PostgreSQL Database Engine (pg-mem)...');
    const db = newDb();
    
    // Register gen_random_uuid() function in pg-mem
    db.public.registerFunction({
      name: 'gen_random_uuid',
      returns: DataType.uuid,
      implementation: () => uuidv4(),
    });

    const pgAdapter = db.adapters.createPg();
    dbInstance = new pgAdapter.Pool();
  }

  await initializePostgresSchema(dbInstance);
  isInitialized = true;
  return dbInstance;
}

async function initializePostgresSchema(db: any) {
  try {
    const ddlStatements = [
      `CREATE TABLE IF NOT EXISTS public.organizations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          calls_used INTEGER NOT NULL DEFAULT 0,
          calls_allowed INTEGER NOT NULL DEFAULT 100,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE TABLE IF NOT EXISTS public.org_members (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
          user_id UUID NOT NULL,
          user_email TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(org_id, user_id)
      );`,
      `CREATE TABLE IF NOT EXISTS public.workflows (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_by UUID NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE TABLE IF NOT EXISTS public.workflow_steps (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
          step_order INTEGER NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate')),
          config JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(workflow_id, step_order)
      );`,
      `CREATE TABLE IF NOT EXISTS public.workflow_triggers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK (type IN ('manual', 'webhook', 'scheduled', 'db_event')),
          config JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE TABLE IF NOT EXISTS public.workflow_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
          org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
          triggered_by UUID,
          trigger_type TEXT NOT NULL DEFAULT 'manual',
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
          current_step_index INTEGER NOT NULL DEFAULT 0,
          input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          output_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          error_message TEXT,
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          finished_at TIMESTAMPTZ
      );`,
      `CREATE TABLE IF NOT EXISTS public.step_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workflow_run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
          step_id UUID NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
          step_name TEXT NOT NULL,
          step_type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'skipped')),
          input JSONB NOT NULL DEFAULT '{}'::jsonb,
          output JSONB NOT NULL DEFAULT '{}'::jsonb,
          error TEXT,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          approved_by UUID,
          approved_at TIMESTAMPTZ,
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          finished_at TIMESTAMPTZ
      );`,
      `CREATE TABLE IF NOT EXISTS public.db_write_records (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
          workflow_run_id UUID REFERENCES public.workflow_runs(id) ON DELETE SET NULL,
          entity_type TEXT NOT NULL DEFAULT 'workflow_result',
          data JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE TABLE IF NOT EXISTS public.notifications_log (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
          workflow_run_id UUID REFERENCES public.workflow_runs(id) ON DELETE SET NULL,
          recipient TEXT NOT NULL,
          message TEXT NOT NULL,
          channel TEXT NOT NULL DEFAULT 'slack',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`
    ];

    for (const stmt of ddlStatements) {
      await db.query(stmt);
    }

    // 2. Seed Initial Multi-Tenant Organizations if empty
    const orgsCheck = await db.query('SELECT COUNT(*) as count FROM public.organizations;');
    const count = parseInt(orgsCheck.rows[0]?.count || '0', 10);

    if (count === 0) {
      console.log('Seeding initial PostgreSQL tables for Org A and Org B...');
      
      // Insert Organizations
      await db.query(
        `INSERT INTO public.organizations (id, name, calls_used, calls_allowed) VALUES 
         ($1, 'Acme AI Systems (Org A)', 4, 50),
         ($2, 'Stark Technologies (Org B)', 12, 100);`,
        [ORG_A_ID, ORG_B_ID]
      );

      // Insert Org Members
      await db.query(
        `INSERT INTO public.org_members (id, org_id, user_id, user_email, role) VALUES 
         ($1, $2, $3, 'owner@acme.com', 'owner'),
         ($4, $2, $5, 'editor@acme.com', 'editor'),
         ($6, $2, $7, 'viewer@acme.com', 'viewer'),
         ($8, $9, $10, 'owner@stark.com', 'owner'),
         ($11, $9, $12, 'editor@stark.com', 'editor');`,
        [
          uuidv4(), ORG_A_ID, USER_A_OWNER_ID,
          uuidv4(), USER_A_EDITOR_ID,
          uuidv4(), USER_A_VIEWER_ID,
          uuidv4(), ORG_B_ID, USER_B_OWNER_ID,
          uuidv4(), USER_B_EDITOR_ID
        ]
      );

      // Seed Org A Workflow
      await db.query(
        `INSERT INTO public.workflows (id, org_id, name, description, is_active, created_by) VALUES
         ($1, $2, 'Customer Support Auto-Responder & Security Audit', 'Chains LLM analysis, external HTTP verification, conditional logic, and an approval gate before committing to database.', true, $3);`,
        [WORKFLOW_A_ID, ORG_A_ID, USER_A_OWNER_ID]
      );

      // Seed Steps
      const steps = [
        [uuidv4(), WORKFLOW_A_ID, 1, 'LLM Sentiment & Intent Classifier', 'llm_call', JSON.stringify({ prompt: 'Analyze customer request: "Urgent issue with account access. Please reset credentials immediately." Classify intent, sentiment, and urgency.', model: 'gemini-1.5-flash' })],
        [uuidv4(), WORKFLOW_A_ID, 2, 'Check User Risk Score API', 'http_request', JSON.stringify({ url: 'https://jsonplaceholder.typicode.com/posts/1', method: 'GET', headers: { 'Accept': 'application/json' } })],
        [uuidv4(), WORKFLOW_A_ID, 3, 'Evaluate Security Risk Condition', 'conditional_branch', JSON.stringify({ condition_expression: 'prev_output.status === 200 || prev_output.text.includes("POSITIVE")' })],
        [uuidv4(), WORKFLOW_A_ID, 4, 'Executive Approval Gate', 'approval_gate', JSON.stringify({ required_role: 'editor' })],
        [uuidv4(), WORKFLOW_A_ID, 5, 'Persist Security Audit Log', 'db_write', JSON.stringify({ entity_type: 'security_audit' })],
        [uuidv4(), WORKFLOW_A_ID, 6, 'Send Slack Notification Alert', 'notify', JSON.stringify({ recipient: '#sec-ops-channel', channel: 'slack' })],
      ];

      for (const s of steps) {
        await db.query(
          `INSERT INTO public.workflow_steps (id, workflow_id, step_order, name, type, config) VALUES ($1, $2, $3, $4, $5, $6::jsonb);`,
          s
        );
      }

      // Seed Triggers
      await db.query(
        `INSERT INTO public.workflow_triggers (id, workflow_id, type, config) VALUES
         ($1, $2, 'manual', '{}'::jsonb),
         ($3, $2, 'webhook', '{"secret_token": "wh_acme_sec_token_9981"}'::jsonb),
         ($4, $2, 'db_event', '{"watched_table": "customer_tickets", "event_type": "INSERT"}'::jsonb);`,
        [uuidv4(), WORKFLOW_A_ID, uuidv4(), uuidv4()]
      );

      // Seed Org B Workflow
      await db.query(
        `INSERT INTO public.workflows (id, org_id, name, description, is_active, created_by) VALUES
         ($1, $2, 'Stark Arc Reactor Diagnostics', 'Internal Stark Tech automated telemetry analysis pipeline.', true, $3);`,
        [WORKFLOW_B_ID, ORG_B_ID, USER_B_OWNER_ID]
      );

      await db.query(
        `INSERT INTO public.workflow_steps (id, workflow_id, step_order, name, type, config) VALUES
         ($1, $2, 1, 'LLM Reactor Telemetry Evaluation', 'llm_call', '{"prompt": "Check power grid frequency"}'::jsonb);`,
        [uuidv4(), WORKFLOW_B_ID]
      );

      console.log('PostgreSQL database seeded successfully!');
    }
  } catch (err) {
    console.error('PostgreSQL Initialization Error:', err);
  }
}

// --- Authoritative Layer 1 Security Verification via org_members Table ---
export async function verifyAuthoritativeOrgMember(userId: string, orgId: string): Promise<{ isMember: boolean; role?: OrgRole }> {
  const db = await getPgEngine();
  const res = await db.query(
    `SELECT role FROM public.org_members WHERE user_id = $1 AND org_id = $2;`,
    [userId, orgId]
  );

  if (res.rows.length === 0) {
    return { isMember: false };
  }

  return { isMember: true, role: res.rows[0].role as OrgRole };
}

// --- Layer 2 Step-Level Gating ---
export function checkLayer2StepCreation(role: OrgRole, stepType: StepType): { allowed: boolean; reason?: string } {
  const HIGH_PRIVILEGE_STEPS: StepType[] = ['db_write', 'notify'];
  if (HIGH_PRIVILEGE_STEPS.includes(stepType) && role !== 'owner') {
    return {
      allowed: false,
      reason: `Layer 2 Security Failure: Step type '${stepType}' reaches outside the sandbox and requires 'owner' privileges. Current role: '${role}'.`,
    };
  }
  return { allowed: true };
}

export async function checkLayer2ApprovalRole(session: UserSession, stepRunId: string): Promise<{ allowed: boolean; reason?: string; stepRun?: StepRun; workflowRun?: WorkflowRun }> {
  const db = await getPgEngine();

  const srRes = await db.query(`SELECT * FROM public.step_runs WHERE id = $1;`, [stepRunId]);
  if (srRes.rows.length === 0) {
    return { allowed: false, reason: `Step run not found: ${stepRunId}` };
  }
  const stepRun: StepRun = srRes.rows[0];

  const wrRes = await db.query(`SELECT * FROM public.workflow_runs WHERE id = $1;`, [stepRun.workflow_run_id]);
  if (wrRes.rows.length === 0) {
    return { allowed: false, reason: `Workflow run not found: ${stepRun.workflow_run_id}` };
  }
  const workflowRun: WorkflowRun = wrRes.rows[0];

  // Authoritative Layer 1 Check against org_members
  const memberCheck = await verifyAuthoritativeOrgMember(session.user_id, workflowRun.org_id);
  if (!memberCheck.isMember) {
    return {
      allowed: false,
      reason: `Layer 1 RLS Violation: User '${session.user_email}' is not a verified member of Org '${workflowRun.org_id}' in org_members table. Access Denied.`,
    };
  }

  // Layer 2 Role Check
  if (memberCheck.role === 'viewer') {
    return {
      allowed: false,
      reason: `Layer 2 Security Violation: Role 'viewer' is read-only and cannot approve paused workflow gates. Required role: owner or editor.`,
    };
  }

  return { allowed: true, stepRun, workflowRun };
}

// --- Data Access Layer Methods over PostgreSQL ---
export async function getWorkflowsByOrg(orgId: string): Promise<Workflow[]> {
  const db = await getPgEngine();
  const wfRes = await db.query(`SELECT * FROM public.workflows WHERE org_id = $1 ORDER BY created_at DESC;`, [orgId]);
  
  const workflows: Workflow[] = [];
  for (const wf of wfRes.rows) {
    const stepsRes = await db.query(`SELECT * FROM public.workflow_steps WHERE workflow_id = $1 ORDER BY step_order ASC;`, [wf.id]);
    const trigRes = await db.query(`SELECT * FROM public.workflow_triggers WHERE workflow_id = $1;`, [wf.id]);
    const runsRes = await db.query(`SELECT * FROM public.workflow_runs WHERE workflow_id = $1 ORDER BY started_at DESC LIMIT 5;`, [wf.id]);

    const stepsParsed = stepsRes.rows.map((s: any) => ({
      ...s,
      config: typeof s.config === 'string' ? JSON.parse(s.config) : s.config,
    }));

    const triggersParsed = trigRes.rows.map((t: any) => ({
      ...t,
      config: typeof t.config === 'string' ? JSON.parse(t.config) : t.config,
    }));

    workflows.push({
      ...wf,
      steps: stepsParsed,
      triggers: triggersParsed,
      runs: runsRes.rows,
      most_recent_run: runsRes.rows.length > 0 ? runsRes.rows[0] : null,
    });
  }

  return workflows;
}

export async function getWorkflowById(wfId: string): Promise<Workflow | null> {
  const db = await getPgEngine();
  const res = await db.query(`SELECT * FROM public.workflows WHERE id = $1;`, [wfId]);
  if (res.rows.length === 0) return null;

  const wf = res.rows[0];
  const stepsRes = await db.query(`SELECT * FROM public.workflow_steps WHERE workflow_id = $1 ORDER BY step_order ASC;`, [wfId]);
  const trigRes = await db.query(`SELECT * FROM public.workflow_triggers WHERE workflow_id = $1;`, [wfId]);

  const stepsParsed = stepsRes.rows.map((s: any) => ({
    ...s,
    config: typeof s.config === 'string' ? JSON.parse(s.config) : s.config,
  }));

  const triggersParsed = trigRes.rows.map((t: any) => ({
    ...t,
    config: typeof t.config === 'string' ? JSON.parse(t.config) : t.config,
  }));

  return {
    ...wf,
    steps: stepsParsed,
    triggers: triggersParsed,
  };
}

export async function getWorkflowRunById(runId: string): Promise<WorkflowRun | null> {
  const db = await getPgEngine();
  const res = await db.query(`SELECT * FROM public.workflow_runs WHERE id = $1;`, [runId]);
  if (res.rows.length === 0) return null;

  const run = res.rows[0];
  const srRes = await db.query(`SELECT * FROM public.step_runs WHERE workflow_run_id = $1 ORDER BY started_at ASC;`, [runId]);

  const stepRunsParsed = srRes.rows.map((sr: any) => ({
    ...sr,
    input: typeof sr.input === 'string' ? JSON.parse(sr.input) : sr.input,
    output: typeof sr.output === 'string' ? JSON.parse(sr.output) : sr.output,
  }));

  return {
    ...run,
    input_payload: typeof run.input_payload === 'string' ? JSON.parse(run.input_payload) : run.input_payload,
    output_payload: typeof run.output_payload === 'string' ? JSON.parse(run.output_payload) : run.output_payload,
    step_runs: stepRunsParsed,
  };
}

export async function getOrganizationById(orgId: string): Promise<Organization | null> {
  const db = await getPgEngine();
  const res = await db.query(`SELECT * FROM public.organizations WHERE id = $1;`, [orgId]);
  return res.rows.length > 0 ? res.rows[0] : null;
}
