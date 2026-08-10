import { v4 as uuidv4 } from 'uuid';
import { dbStore } from './db-store';
import { executeLlmCall } from './llm-service';
import {
  WorkflowRun,
  StepRun,
  WorkflowStep,
  UserSession,
  TriggerType,
  DbWriteRecord,
  NotificationLog
} from './types';

export async function triggerWorkflowRun(
  workflowId: string,
  session: UserSession,
  triggerType: TriggerType = 'manual',
  inputPayload: Record<string, any> = {}
): Promise<{ run: WorkflowRun; message: string }> {
  // 1. Fetch Workflow & Layer 1 Permission Check
  const workflow = dbStore.workflows.get(workflowId);
  if (!workflow) {
    throw new Error(`Workflow not found with ID: ${workflowId}`);
  }

  if (!dbStore.checkLayer1Select(session, workflow.org_id)) {
    throw new Error(`Layer 1 Permission Denied: User in Org '${session.org_id}' cannot access workflow belonging to Org '${workflow.org_id}'.`);
  }

  // 2. Layer 1 Role Check for triggering run (owner or editor allowed, viewer rejected)
  if (!dbStore.checkLayer1Mutation(session, workflow.org_id, ['owner', 'editor'])) {
    throw new Error(`Layer 1 Role Violation: Role '${session.role}' cannot trigger workflow runs. Only 'owner' or 'editor' allowed.`);
  }

  // 3. Quota Enforcement Check
  const org = dbStore.organizations.get(workflow.org_id);
  if (!org) throw new Error('Organization not found');

  if (org.calls_used >= org.calls_allowed) {
    throw new Error(`Quota Exceeded: Organization '${org.name}' has reached its call limit (${org.calls_used}/${org.calls_allowed} used this period).`);
  }

  // 4. Create Workflow Run
  const runId = uuidv4();
  const now = new Date().toISOString();
  const run: WorkflowRun = {
    id: runId,
    workflow_id: workflowId,
    org_id: workflow.org_id,
    triggered_by: session.user_id,
    trigger_type: triggerType,
    status: 'running',
    current_step_index: 0,
    input_payload: inputPayload,
    output_payload: {},
    started_at: now,
  };

  dbStore.workflowRuns.set(run.id, run);
  dbStore.notifySubscribers(run);

  // 5. Execute Steps Asynchronously
  executeStepsFromIndex(runId, 0);

  return {
    run: dbStore.getWorkflowRunById(runId)!,
    message: `Workflow run ${runId} started successfully.`,
  };
}

export async function approveStepRun(
  stepRunId: string,
  session: UserSession,
  decision: 'approve' | 'reject' = 'approve'
): Promise<{ stepRun: StepRun; workflowRun: WorkflowRun; message: string }> {
  const stepRun = dbStore.stepRuns.get(stepRunId);
  if (!stepRun) throw new Error(`Step run not found: ${stepRunId}`);

  const workflowRun = dbStore.workflowRuns.get(stepRun.workflow_run_id);
  if (!workflowRun) throw new Error(`Workflow run not found: ${stepRun.workflow_run_id}`);

  // Layer 1 and Layer 2 Security Verification
  const permCheck = dbStore.checkLayer2ApprovalRole(session, stepRun, workflowRun);
  if (!permCheck.allowed) {
    throw new Error(permCheck.reason);
  }

  if (stepRun.status !== 'paused' || workflowRun.status !== 'paused') {
    throw new Error(`Step run ${stepRunId} is not currently paused (Status: ${stepRun.status}).`);
  }

  const now = new Date().toISOString();

  if (decision === 'reject') {
    stepRun.status = 'failed';
    stepRun.error = `Rejected by user ${session.user_email} (${session.role})`;
    stepRun.finished_at = now;
    workflowRun.status = 'failed';
    workflowRun.error_message = `Step '${stepRun.step_name}' rejected during approval gate by ${session.user_email}.`;
    workflowRun.finished_at = now;

    dbStore.notifySubscribers(workflowRun);
    return {
      stepRun,
      workflowRun,
      message: `Step run rejected. Workflow run failed.`,
    };
  }

  // Approved!
  stepRun.status = 'completed';
  stepRun.approved_by = session.user_id;
  stepRun.approved_at = now;
  stepRun.finished_at = now;
  stepRun.output = {
    ...stepRun.output,
    approval_status: 'APPROVED',
    approved_by_email: session.user_email,
    approved_by_role: session.role,
  };

  workflowRun.status = 'running';
  dbStore.notifySubscribers(workflowRun);

  // Resume step loop from next step index
  const steps = Array.from(dbStore.workflowSteps.values())
    .filter((s) => s.workflow_id === workflowRun.workflow_id)
    .sort((a, b) => a.step_order - b.step_order);

  const pausedIndex = steps.findIndex((s) => s.id === stepRun.step_id);
  const nextIndex = pausedIndex !== -1 ? pausedIndex + 1 : workflowRun.current_step_index + 1;

  executeStepsFromIndex(workflowRun.id, nextIndex);

  return {
    stepRun,
    workflowRun: dbStore.getWorkflowRunById(workflowRun.id)!,
    message: `Step approved successfully by ${session.user_email}. Workflow resumed.`,
  };
}

async function executeStepsFromIndex(runId: string, startIndex: number) {
  const run = dbStore.workflowRuns.get(runId);
  if (!run) return;

  const steps = Array.from(dbStore.workflowSteps.values())
    .filter((s) => s.workflow_id === run.workflow_id)
    .sort((a, b) => a.step_order - b.step_order);

  let stepOutputsAccumulator: Record<string, any> = { ...run.output_payload };

  for (let i = startIndex; i < steps.length; i++) {
    const step = steps[i];
    run.current_step_index = i;

    // Check if run was cancelled or modified
    if (run.status === 'failed') break;

    const stepRunId = uuidv4();
    const now = new Date().toISOString();

    const stepRun: StepRun = {
      id: stepRunId,
      workflow_run_id: runId,
      step_id: step.id,
      step_name: step.name,
      step_type: step.type,
      status: 'running',
      input: {
        step_config: step.config,
        workflow_input: run.input_payload,
        previous_outputs: stepOutputsAccumulator,
      },
      output: {},
      attempt_count: 1,
      started_at: now,
    };

    dbStore.stepRuns.set(stepRunId, stepRun);
    dbStore.notifySubscribers(run);

    try {
      const stepResult = await executeSingleStepWithRetry(step, stepRun, stepOutputsAccumulator);

      if (stepResult.isPaused) {
        // Approval Gate Paused!
        stepRun.status = 'paused';
        run.status = 'paused';
        dbStore.notifySubscribers(run);
        return; // Stop step loop until approveStep is invoked
      }

      stepRun.status = 'completed';
      stepRun.output = stepResult.output;
      stepRun.finished_at = new Date().toISOString();
      stepOutputsAccumulator[`step_${step.step_order}`] = stepResult.output;
      stepOutputsAccumulator[step.type] = stepResult.output;

      dbStore.notifySubscribers(run);
    } catch (err: any) {
      stepRun.status = 'failed';
      stepRun.error = err.message;
      stepRun.finished_at = new Date().toISOString();

      run.status = 'failed';
      run.error_message = `Step '${step.name}' failed: ${err.message}`;
      run.finished_at = new Date().toISOString();

      dbStore.notifySubscribers(run);
      return;
    }
  }

  // All non-paused steps completed successfully!
  run.status = 'completed';
  run.output_payload = stepOutputsAccumulator;
  run.finished_at = new Date().toISOString();

  // Increment Org Quota Usage on Completion
  const org = dbStore.organizations.get(run.org_id);
  if (org) {
    org.calls_used += 1;
    org.updated_at = new Date().toISOString();
  }

  dbStore.notifySubscribers(run);
}

async function executeSingleStepWithRetry(
  step: WorkflowStep,
  stepRun: StepRun,
  previousOutputs: Record<string, any>
): Promise<{ output: Record<string, any>; isPaused?: boolean }> {
  const maxAttempts = 2; // Real retry logic (attempt 1, attempt 2)
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    stepRun.attempt_count = attempt;

    try {
      switch (step.type) {
        case 'llm_call': {
          const prompt = step.config.prompt || 'Summarize current task payload';
          const llmResult = await executeLlmCall(prompt, step.config.model);
          return { output: llmResult };
        }

        case 'http_request': {
          const url = step.config.url || 'https://jsonplaceholder.typicode.com/posts/1';
          const method = step.config.method || 'GET';

          const res = await fetch(url, {
            method,
            headers: step.config.headers || { 'Accept': 'application/json' },
            body: method !== 'GET' && step.config.body ? step.config.body : undefined,
          });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }

          const resData = await res.json().catch(() => ({ statusText: res.statusText }));
          return { output: { status: res.status, data: resData, url } };
        }

        case 'conditional_branch': {
          const expr = step.config.condition_expression || 'true';
          const prevLlmText = previousOutputs['llm_call']?.text || '';
          const prevHttpStatus = previousOutputs['http_request']?.status || 200;

          const conditionPassed = Boolean(
            expr.includes('200') ? prevHttpStatus === 200 : prevLlmText.length > 5
          );

          return {
            output: {
              condition_evaluated: expr,
              passed: conditionPassed,
              branch_taken: conditionPassed ? 'TRUE_PATH' : 'FALSE_PATH',
            },
          };
        }

        case 'approval_gate': {
          return {
            output: {
              required_role: step.config.required_role || 'editor',
              message: 'Execution halted at approval gate. Awaiting authorized user review.',
            },
            isPaused: true,
          };
        }

        case 'db_write': {
          const recordId = uuidv4();
          const rec: DbWriteRecord = {
            id: recordId,
            org_id: stepRun.workflow_run_id,
            entity_type: step.config.entity_type || 'workflow_result',
            data: {
              summary: 'Persisted workflow result',
              previous_outputs: previousOutputs,
              saved_at: new Date().toISOString(),
            },
            created_at: new Date().toISOString(),
          };
          dbStore.dbWriteRecords.set(rec.id, rec);
          return { output: { record_id: rec.id, entity_type: rec.entity_type, status: 'SAVED' } };
        }

        case 'notify': {
          const notifId = uuidv4();
          const notif: NotificationLog = {
            id: notifId,
            org_id: stepRun.workflow_run_id,
            recipient: step.config.recipient || '#ops-channel',
            message: `Alert: Workflow completed successfully. Result: ${JSON.stringify(previousOutputs['conditional_branch'] || {})}`,
            channel: step.config.channel || 'slack',
            created_at: new Date().toISOString(),
          };
          dbStore.notificationsLog.set(notif.id, notif);
          return { output: { notification_id: notif.id, sent_to: notif.recipient, status: 'DELIVERED' } };
        }

        default:
          return { output: { message: `Step type ${step.type} executed successfully` } };
      }
    } catch (err: any) {
      lastError = err;
      if (attempt < maxAttempts) {
        // Wait before retry
        await new Promise((res) => setTimeout(res, 400));
      }
    }
  }

  throw lastError || new Error(`Step execution failed after ${maxAttempts} attempts`);
}
