export type OrgRole = 'owner' | 'editor' | 'viewer';

export interface Organization {
  id: string;
  name: string;
  calls_used: number;
  calls_allowed: number;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  user_email: string;
  role: OrgRole;
  created_at: string;
}

export type StepType = 
  | 'llm_call'
  | 'http_request'
  | 'db_write'
  | 'notify'
  | 'conditional_branch'
  | 'approval_gate';

export interface StepConfig {
  prompt?: string;
  model?: string;
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  entity_type?: string;
  recipient?: string;
  channel?: 'slack' | 'email';
  condition_expression?: string; // e.g. "output.status === 'OK'" or "output.length > 10"
  required_role?: OrgRole;
  [key: string]: any;
}

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  step_order: number;
  name: string;
  type: StepType;
  config: StepConfig;
  created_at: string;
}

export type TriggerType = 'manual' | 'webhook' | 'scheduled' | 'db_event';

export interface WorkflowTrigger {
  id: string;
  workflow_id: string;
  type: TriggerType;
  config: {
    secret_token?: string;
    cron_schedule?: string;
    watched_table?: string;
    event_type?: 'INSERT' | 'UPDATE' | 'DELETE';
    [key: string]: any;
  };
  created_at: string;
}

export interface Workflow {
  id: string;
  org_id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  steps?: WorkflowStep[];
  triggers?: WorkflowTrigger[];
}

export type RunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';
export type StepRunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'skipped';

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  org_id: string;
  triggered_by?: string;
  trigger_type: TriggerType;
  status: RunStatus;
  current_step_index: number;
  input_payload: Record<string, any>;
  output_payload: Record<string, any>;
  error_message?: string;
  started_at: string;
  finished_at?: string;
  step_runs?: StepRun[];
}

export interface StepRun {
  id: string;
  workflow_run_id: string;
  step_id: string;
  step_name: string;
  step_type: StepType;
  status: StepRunStatus;
  input: Record<string, any>;
  output: Record<string, any>;
  error?: string;
  attempt_count: number;
  approved_by?: string;
  approved_at?: string;
  started_at: string;
  finished_at?: string;
}

export interface DbWriteRecord {
  id: string;
  org_id: string;
  workflow_run_id?: string;
  entity_type: string;
  data: Record<string, any>;
  created_at: string;
}

export interface NotificationLog {
  id: string;
  org_id: string;
  workflow_run_id?: string;
  recipient: string;
  message: string;
  channel: string;
  created_at: string;
}

export interface UserSession {
  user_id: string;
  user_email: string;
  org_id: string;
  role: OrgRole;
}
