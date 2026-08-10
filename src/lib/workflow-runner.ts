import { v4 as uuidv4 } from 'uuid';
import {
  getPgEngine,
  verifyAuthoritativeOrgMember,
  checkLayer2ApprovalRole,
  getWorkflowRunById,
  getWorkflowById,
  getOrganizationById
} from './postgres-store';
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

// Real-time live subscription broadcast listeners
const runSubscribers: Set<(run: WorkflowRun) => void> = new Set();

export function subscribeToRuns(callback: (run: WorkflowRun) => void): () => void {
  runSubscribers.add(callback);
  return () => {
    runSubscribers.delete(callback);
  };
}

export async function broadcastRunUpdate(runId: string) {
  const run = await getWorkflowRunById(runId);
  if (run) {
    runSubscribers.forEach((cb) => cb({ ...run }));
  }
}

export async function triggerWorkflowRun(
  workflowId: string,
  session: UserSession,
  triggerType: TriggerType = 'manual',
  inputPayload: Record<string, any> = {}
): Promise<{ run: WorkflowRun; message: string }> {
  const db = await getPgEngine();

  // 1. Fetch Workflow from PostgreSQL
  const workflow = await getWorkflowById(workflowId);
  if (!workflow) {
    throw new Error(`Workflow not found with ID: ${workflowId}`);
  }

  // 2. Authoritative Layer 1 Security Check against org_members table
  const memberCheck = await verifyAuthoritativeOrgMember(session.user_id, workflow.org_id);
  if (!memberCheck.isMember) {
    throw new Error(`Layer 1 RLS Violation: User '${session.user_email}' is not a verified member of Org '${workflow.org_id}' in org_members table.`);
  }

  // 3. Layer 1 Role Check for trigger permission
  if (memberCheck.role === 'viewer') {
    throw new Error(`Layer 1 Role Violation: Role 'viewer' is read-only and cannot trigger workflow runs.`);
  }

  // 4. Quota Check in PostgreSQL organizations table
  const org = await getOrganizationById(workflow.org_id);
  if (!org) throw new Error('Organization not found');

  if (org.calls_used >= org.calls_allowed) {
    throw new Error(`Quota Exceeded: Organization '${org.name}' has reached its call limit (${org.calls_used}/${org.calls_allowed} used).`);
  }

  // 5. Create Workflow Run Record in PostgreSQL
  const runId = uuidv4();
  const now = new Date().toISOString();

  await queryExec(
    db,
    `INSERT INTO public.workflow_runs (id, workflow_id, org_id, triggered_by, trigger_type, status, current_step_index, input_payload, output_payload, started_at)
     VALUES ($1, $2, $3, $4, $5, 'running', 0, $6::jsonb, '{}'::jsonb, $7);`,
    [runId, workflowId, workflow.org_id, session.user_id, triggerType, JSON.stringify(inputPayload), now]
  );

  await broadcastRunUpdate(runId);

  // 6. Execute Steps Loop Asynchronously
  executeStepsFromIndex(runId, 0);

  const createdRun = await getWorkflowRunById(runId);
  return {
    run: createdRun!,
    message: `Workflow run ${runId} started successfully in PostgreSQL.`,
  };
}

export async function approveStepRun(
  stepRunId: string,
  session: UserSession,
  decision: 'approve' | 'reject' = 'approve'
): Promise<{ stepRun: StepRun; workflowRun: WorkflowRun; message: string }> {
  const db = await getPgEngine();

  // Authoritative Layer 1 & Layer 2 Security Verification against org_members
  const permCheck = await checkLayer2ApprovalRole(session, stepRunId);
  if (!permCheck.allowed || !permCheck.stepRun || !permCheck.workflowRun) {
    throw new Error(permCheck.reason || 'Approval access denied');
  }

  const { stepRun, workflowRun } = permCheck;
  const now = new Date().toISOString();

  if (decision === 'reject') {
    await queryExec(
      db,
      `UPDATE public.step_runs SET status = 'failed', error = $1, finished_at = $2 WHERE id = $3;`,
      [`Rejected by user ${session.user_email} (${session.role})`, now, stepRunId]
    );

    await queryExec(
      db,
      `UPDATE public.workflow_runs SET status = 'failed', error_message = $1, finished_at = $2 WHERE id = $3;`,
      [`Step '${stepRun.step_name}' rejected during approval gate by ${session.user_email}.`, now, workflowRun.id]
    );

    await broadcastRunUpdate(workflowRun.id);
    const updatedRun = await getWorkflowRunById(workflowRun.id);

    return {
      stepRun,
      workflowRun: updatedRun!,
      message: `Step run rejected. Workflow run failed in PostgreSQL.`,
    };
  }

  // Approved!
  const updatedOutput = {
    ...stepRun.output,
    approval_status: 'APPROVED',
    approved_by_email: session.user_email,
    approved_by_role: session.role,
  };

  await queryExec(
    db,
    `UPDATE public.step_runs SET status = 'completed', approved_by = $1, approved_at = $2, finished_at = $2, output = $3::jsonb WHERE id = $4;`,
    [session.user_id, now, JSON.stringify(updatedOutput), stepRunId]
  );

  await queryExec(
    db,
    `UPDATE public.workflow_runs SET status = 'running' WHERE id = $1;`,
    [workflowRun.id]
  );

  await broadcastRunUpdate(workflowRun.id);

  // Resume step execution loop
  const stepsRes = await queryExec(db, `SELECT * FROM public.workflow_steps WHERE workflow_id = $1 ORDER BY step_order ASC;`, [workflowRun.workflow_id]);
  const steps: WorkflowStep[] = stepsRes.rows;

  const pausedIndex = steps.findIndex((s) => s.id === stepRun.step_id);
  const nextIndex = pausedIndex !== -1 ? pausedIndex + 1 : workflowRun.current_step_index + 1;

  executeStepsFromIndex(workflowRun.id, nextIndex);

  const resumedRun = await getWorkflowRunById(workflowRun.id);
  return {
    stepRun,
    workflowRun: resumedRun!,
    message: `Step approved successfully by ${session.user_email}. Workflow resumed in PostgreSQL.`,
  };
}

async function executeStepsFromIndex(runId: string, startIndex: number) {
  const db = await getPgEngine();
  const run = await getWorkflowRunById(runId);
  if (!run) return;

  const stepsRes = await queryExec(db, `SELECT * FROM public.workflow_steps WHERE workflow_id = $1 ORDER BY step_order ASC;`, [run.workflow_id]);
  const steps: WorkflowStep[] = stepsRes.rows;

  let stepOutputsAccumulator: Record<string, any> = { ...run.output_payload };

  for (let i = startIndex; i < steps.length; i++) {
    const step = steps[i];

    // Update current step index
    await queryExec(db, `UPDATE public.workflow_runs SET current_step_index = $1 WHERE id = $2;`, [i, runId]);

    const stepRunId = uuidv4();
    const now = new Date().toISOString();

    const inputData = {
      step_config: step.config,
      workflow_input: run.input_payload,
      previous_outputs: stepOutputsAccumulator,
    };

    await queryExec(
      db,
      `INSERT INTO public.step_runs (id, workflow_run_id, step_id, step_name, step_type, status, input, attempt_count, started_at)
       VALUES ($1, $2, $3, $4, $5, 'running', $6::jsonb, 1, $7);`,
      [stepRunId, runId, step.id, step.name, step.type, JSON.stringify(inputData), now]
    );

    await broadcastRunUpdate(runId);

    try {
      const stepResult = await executeSingleStepWithRetry(db, step, stepRunId, runId, stepOutputsAccumulator);

      if (stepResult.isPaused) {
        // Paused at Approval Gate!
        await queryExec(db, `UPDATE public.step_runs SET status = 'paused' WHERE id = $1;`, [stepRunId]);
        await queryExec(db, `UPDATE public.workflow_runs SET status = 'paused' WHERE id = $1;`, [runId]);
        await broadcastRunUpdate(runId);
        return;
      }

      const finishTime = new Date().toISOString();
      await queryExec(
        db,
        `UPDATE public.step_runs SET status = 'completed', output = $1::jsonb, finished_at = $2 WHERE id = $3;`,
        [JSON.stringify(stepResult.output), finishTime, stepRunId]
      );

      stepOutputsAccumulator[`step_${step.step_order}`] = stepResult.output;
      stepOutputsAccumulator[step.type] = stepResult.output;

      await broadcastRunUpdate(runId);
    } catch (err: any) {
      const failTime = new Date().toISOString();
      await queryExec(
        db,
        `UPDATE public.step_runs SET status = 'failed', error = $1, finished_at = $2 WHERE id = $3;`,
        [err.message, failTime, stepRunId]
      );

      await queryExec(
        db,
        `UPDATE public.workflow_runs SET status = 'failed', error_message = $1, finished_at = $2 WHERE id = $3;`,
        [`Step '${step.name}' failed: ${err.message}`, failTime, runId]
      );

      await broadcastRunUpdate(runId);
      return;
    }
  }

  // Workflow completed!
  const completedTime = new Date().toISOString();
  await queryExec(
    db,
    `UPDATE public.workflow_runs SET status = 'completed', output_payload = $1::jsonb, finished_at = $2 WHERE id = $3;`,
    [JSON.stringify(stepOutputsAccumulator), completedTime, runId]
  );

  // Increment Organization Quota Usage in PostgreSQL
  await queryExec(
    db,
    `UPDATE public.organizations SET calls_used = calls_used + 1, updated_at = $1 WHERE id = $2;`,
    [completedTime, run.org_id]
  );

  await broadcastRunUpdate(runId);
}

async function executeSingleStepWithRetry(
  db: any,
  step: WorkflowStep,
  stepRunId: string,
  runId: string,
  previousOutputs: Record<string, any>
): Promise<{ output: Record<string, any>; isPaused?: boolean }> {
  const maxAttempts = 2;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await queryExec(db, `UPDATE public.step_runs SET attempt_count = $1 WHERE id = $2;`, [attempt, stepRunId]);

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
          const runRes = await queryExec(db, `SELECT org_id FROM public.workflow_runs WHERE id = $1;`, [runId]);
          const orgId = runRes.rows[0]?.org_id;

          await queryExec(
            db,
            `INSERT INTO public.db_write_records (id, org_id, workflow_run_id, entity_type, data)
             VALUES ($1, $2, $3, $4, $5::jsonb);`,
            [
              recordId,
              orgId,
              runId,
              step.config.entity_type || 'workflow_result',
              JSON.stringify({ summary: 'Persisted workflow result in PostgreSQL', previous_outputs: previousOutputs }),
            ]
          );

          return { output: { record_id: recordId, entity_type: step.config.entity_type || 'workflow_result', status: 'SAVED_TO_POSTGRES' } };
        }

        case 'notify': {
          const notifId = uuidv4();
          const runRes = await queryExec(db, `SELECT org_id FROM public.workflow_runs WHERE id = $1;`, [runId]);
          const orgId = runRes.rows[0]?.org_id;

          // INSERT into notifications_log in PostgreSQL (Triggers Hasura Event Trigger!)
          await queryExec(
            db,
            `INSERT INTO public.notifications_log (id, org_id, workflow_run_id, recipient, message, channel)
             VALUES ($1, $2, $3, $4, $5, $6);`,
            [
              notifId,
              orgId,
              runId,
              step.config.recipient || '#ops-channel',
              `Alert: Workflow completed successfully. Result: ${JSON.stringify(previousOutputs['conditional_branch'] || {})}`,
              step.config.channel || 'slack',
            ]
          );

          // Dispatch event trigger webhook call
          try {
            await fetch('http://localhost:3000/api/webhooks/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event: {
                  data: {
                    new: {
                      id: notifId,
                      recipient: step.config.recipient || '#ops-channel',
                      message: 'Alert dispatched via Hasura Event Trigger',
                    },
                  },
                },
              }),
            });
          } catch (e) {
            console.warn('Notification webhook call:', e);
          }

          return { output: { notification_id: notifId, sent_to: step.config.recipient || '#ops-channel', status: 'EVENT_TRIGGER_DISPATCHED' } };
        }

        default:
          return { output: { message: `Step type ${step.type} executed successfully` } };
      }
    } catch (err: any) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((res) => setTimeout(res, 400));
      }
    }
  }

  throw lastError || new Error(`Step execution failed after ${maxAttempts} attempts`);
}

async function queryExec(db: any, text: string, params: any[] = []): Promise<any> {
  if (db.query) {
    return await db.query(text, params);
  } else if (db.exec) {
    return await db.exec(text, params);
  }
  throw new Error('Unsupported database driver');
}
