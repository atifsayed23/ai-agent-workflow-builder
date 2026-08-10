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

// Pre-seeded multi-tenant data for Org A and Org B
const ORG_A_ID = '11111111-1111-4111-a111-111111111111';
const ORG_B_ID = '22222222-2222-4222-b222-222222222222';

const USER_A_OWNER_ID = 'aaaa1111-1111-4111-a111-111111111111';
const USER_A_EDITOR_ID = 'aaaa2222-2222-4222-a222-222222222222';
const USER_A_VIEWER_ID = 'aaaa3333-3333-4333-a333-333333333333';

const USER_B_OWNER_ID = 'bbbb1111-1111-4111-b111-111111111111';
const USER_B_EDITOR_ID = 'bbbb2222-2222-4222-b222-222222222222';

class DbStore {
  public organizations: Map<string, Organization> = new Map();
  public orgMembers: Map<string, OrgMember> = new Map();
  public workflows: Map<string, Workflow> = new Map();
  public workflowSteps: Map<string, WorkflowStep> = new Map();
  public workflowTriggers: Map<string, WorkflowTrigger> = new Map();
  public workflowRuns: Map<string, WorkflowRun> = new Map();
  public stepRuns: Map<string, StepRun> = new Map();
  public dbWriteRecords: Map<string, DbWriteRecord> = new Map();
  public notificationsLog: Map<string, NotificationLog> = new Map();

  // Subscription listeners for live streaming
  private runSubscribers: Set<(run: WorkflowRun) => void> = new Set();

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    // 1. Organizations
    const orgA: Organization = {
      id: ORG_A_ID,
      name: 'Acme AI Systems (Org A)',
      calls_used: 4,
      calls_allowed: 50,
      created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
      updated_at: new Date().toISOString(),
    };

    const orgB: Organization = {
      id: ORG_B_ID,
      name: 'Stark Technologies (Org B)',
      calls_used: 12,
      calls_allowed: 100,
      created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.organizations.set(orgA.id, orgA);
    this.organizations.set(orgB.id, orgB);

    // 2. Members
    const members: OrgMember[] = [
      { id: uuidv4(), org_id: ORG_A_ID, user_id: USER_A_OWNER_ID, user_email: 'owner@acme.com', role: 'owner', created_at: new Date().toISOString() },
      { id: uuidv4(), org_id: ORG_A_ID, user_id: USER_A_EDITOR_ID, user_email: 'editor@acme.com', role: 'editor', created_at: new Date().toISOString() },
      { id: uuidv4(), org_id: ORG_A_ID, user_id: USER_A_VIEWER_ID, user_email: 'viewer@acme.com', role: 'viewer', created_at: new Date().toISOString() },
      { id: uuidv4(), org_id: ORG_B_ID, user_id: USER_B_OWNER_ID, user_email: 'owner@stark.com', role: 'owner', created_at: new Date().toISOString() },
      { id: uuidv4(), org_id: ORG_B_ID, user_id: USER_B_EDITOR_ID, user_email: 'editor@stark.com', role: 'editor', created_at: new Date().toISOString() },
    ];

    members.forEach((m) => this.orgMembers.set(m.id, m));

    // 3. Seed Org A Workflow (Final Task Requirement: 3+ Step types including llm_call, http_request, conditional_branch, approval_gate)
    const wfA_Id = 'wf-acme-agent-001';
    const wfA: Workflow = {
      id: wfA_Id,
      org_id: ORG_A_ID,
      name: 'Customer Support Auto-Responder & Security Audit',
      description: 'Chains LLM analysis, external HTTP verification, conditional logic, and an approval gate before committing to database.',
      is_active: true,
      created_by: USER_A_OWNER_ID,
      created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.workflows.set(wfA.id, wfA);

    const stepsA: WorkflowStep[] = [
      {
        id: 'step-a1',
        workflow_id: wfA_Id,
        step_order: 1,
        name: 'LLM Sentiment & Intent Classifier',
        type: 'llm_call',
        config: {
          prompt: 'Analyze customer request: "Urgent issue with account access. Please reset credentials immediately." Classify intent, sentiment, and urgency.',
          model: 'gemini-1.5-flash',
        },
        created_at: new Date().toISOString(),
      },
      {
        id: 'step-a2',
        workflow_id: wfA_Id,
        step_order: 2,
        name: 'Check User Risk Score API',
        type: 'http_request',
        config: {
          url: 'https://jsonplaceholder.typicode.com/posts/1',
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        },
        created_at: new Date().toISOString(),
      },
      {
        id: 'step-a3',
        workflow_id: wfA_Id,
        step_order: 3,
        name: 'Evaluate Security Risk Condition',
        type: 'conditional_branch',
        config: {
          condition_expression: 'prev_output.status === 200 || prev_output.text.includes("POSITIVE")',
        },
        created_at: new Date().toISOString(),
      },
      {
        id: 'step-a4',
        workflow_id: wfA_Id,
        step_order: 4,
        name: 'Executive Approval Gate',
        type: 'approval_gate',
        config: {
          required_role: 'editor',
        },
        created_at: new Date().toISOString(),
      },
      {
        id: 'step-a5',
        workflow_id: wfA_Id,
        step_order: 5,
        name: 'Persist Security Audit Log',
        type: 'db_write',
        config: {
          entity_type: 'security_audit',
        },
        created_at: new Date().toISOString(),
      },
      {
        id: 'step-a6',
        workflow_id: wfA_Id,
        step_order: 6,
        name: 'Send Slack Notification Alert',
        type: 'notify',
        config: {
          recipient: '#sec-ops-channel',
          channel: 'slack',
        },
        created_at: new Date().toISOString(),
      },
    ];

    stepsA.forEach((s) => this.workflowSteps.set(s.id, s));

    const triggersA: WorkflowTrigger[] = [
      {
        id: 'trig-a1',
        workflow_id: wfA_Id,
        type: 'manual',
        config: {},
        created_at: new Date().toISOString(),
      },
      {
        id: 'trig-a2',
        workflow_id: wfA_Id,
        type: 'webhook',
        config: { secret_token: 'wh_acme_sec_token_9981' },
        created_at: new Date().toISOString(),
      },
      {
        id: 'trig-a3',
        workflow_id: wfA_Id,
        type: 'db_event',
        config: { watched_table: 'customer_tickets', event_type: 'INSERT' },
        created_at: new Date().toISOString(),
      },
    ];

    triggersA.forEach((t) => this.workflowTriggers.set(t.id, t));

    // Seed Org B Workflow (To prove Org B user cannot access Org A workflows)
    const wfB_Id = 'wf-stark-pipeline-002';
    const wfB: Workflow = {
      id: wfB_Id,
      org_id: ORG_B_ID,
      name: 'Stark Arc Reactor Diagnostics',
      description: 'Internal Stark Tech automated telemetry analysis pipeline.',
      is_active: true,
      created_by: USER_B_OWNER_ID,
      created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.workflows.set(wfB.id, wfB);

    const stepB: WorkflowStep = {
      id: 'step-b1',
      workflow_id: wfB_Id,
      step_order: 1,
      name: 'LLM Reactor Telemetry Evaluation',
      type: 'llm_call',
      config: { prompt: 'Check power grid frequency' },
      created_at: new Date().toISOString(),
    };
    this.workflowSteps.set(stepB.id, stepB);
  }

  // --- Layer 1 Permission Verification ---
  public checkLayer1Select(session: UserSession, targetOrgId: string): boolean {
    return session.org_id === targetOrgId;
  }

  public checkLayer1Mutation(session: UserSession, targetOrgId: string, requiredRoles: OrgRole[]): boolean {
    if (session.org_id !== targetOrgId) return false;
    return requiredRoles.includes(session.role);
  }

  // --- Layer 2 Step-Level Gating ---
  public checkLayer2StepCreation(role: OrgRole, stepType: StepType): { allowed: boolean; reason?: string } {
    const HIGH_PRIVILEGE_STEPS: StepType[] = ['db_write', 'notify'];
    if (HIGH_PRIVILEGE_STEPS.includes(stepType) && role !== 'owner') {
      return {
        allowed: false,
        reason: `Layer 2 Security Failure: Step type '${stepType}' reaches outside the sandbox and requires 'owner' privileges. Current role: '${role}'.`,
      };
    }
    return { allowed: true };
  }

  public checkLayer2ApprovalRole(session: UserSession, stepRun: StepRun, workflowRun: WorkflowRun): { allowed: boolean; reason?: string } {
    // 1. Layer 1 Org Scope Check
    if (session.org_id !== workflowRun.org_id) {
      return {
        allowed: false,
        reason: `Layer 1 RLS Violation: User from Org '${session.org_id}' attempted to approve step in Org '${workflowRun.org_id}'. Access Denied.`,
      };
    }

    // 2. Layer 2 Mid-Execution Role Check
    if (session.role === 'viewer') {
      return {
        allowed: false,
        reason: `Layer 2 Security Violation: Role 'viewer' is read-only and cannot approve paused workflow gates. Required role: owner or editor.`,
      };
    }

    return { allowed: true };
  }

  // --- Live Subscription Streaming ---
  public subscribeToRuns(callback: (run: WorkflowRun) => void): () => void {
    this.runSubscribers.add(callback);
    return () => {
      this.runSubscribers.delete(callback);
    };
  }

  public notifySubscribers(run: WorkflowRun) {
    const fullRun = this.getWorkflowRunById(run.id);
    if (fullRun) {
      this.runSubscribers.forEach((cb) => cb({ ...fullRun }));
    }
  }

  // Helper getters
  public getWorkflowRunById(runId: string): WorkflowRun | undefined {
    const run = this.workflowRuns.get(runId);
    if (!run) return undefined;

    const stepRuns = Array.from(this.stepRuns.values())
      .filter((sr) => sr.workflow_run_id === runId)
      .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

    return { ...run, step_runs: stepRuns };
  }
}

export const dbStore = new DbStore();
