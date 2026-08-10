import { NextRequest, NextResponse } from 'next/server';
import { dbStore } from '@/lib/db-store';
import { triggerWorkflowRun, approveStepRun } from '@/lib/workflow-runner';
import { UserSession, OrgRole, StepType, WorkflowStep } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Hasura Session Headers
    const hasuraOrgId = req.headers.get('x-hasura-org-id') || '11111111-1111-4111-a111-111111111111';
    const hasuraUserId = req.headers.get('x-hasura-user-id') || 'user-default-id';
    const hasuraRole = (req.headers.get('x-hasura-org-role') || 'owner') as OrgRole;
    const userEmail = req.headers.get('x-hasura-user-email') || 'active@org.com';

    const session: UserSession = {
      user_id: hasuraUserId,
      user_email: userEmail,
      org_id: hasuraOrgId,
      role: hasuraRole,
    };

    const { query, variables } = body;

    // --- 1. Workflow Query ---
    if (query?.includes('GetOrgWorkflows') || query?.includes('workflows(') || query?.includes('query Workflows')) {
      const targetOrgId = variables?.org_id || session.org_id;

      // Layer 1 Security Check
      if (!dbStore.checkLayer1Select(session, targetOrgId)) {
        return NextResponse.json({
          data: { workflows: [] },
          errors: [{ message: `Layer 1 RLS Permission Denied: User in Org '${session.org_id}' cannot read workflows of Org '${targetOrgId}'.` }],
        });
      }

      const orgWorkflows = Array.from(dbStore.workflows.values())
        .filter((w) => w.org_id === targetOrgId)
        .map((w) => {
          const steps = Array.from(dbStore.workflowSteps.values())
            .filter((s) => s.workflow_id === w.id)
            .sort((a, b) => a.step_order - b.step_order);

          const triggers = Array.from(dbStore.workflowTriggers.values())
            .filter((t) => t.workflow_id === w.id);

          const runs = Array.from(dbStore.workflowRuns.values())
            .filter((r) => r.workflow_id === w.id)
            .map((r) => dbStore.getWorkflowRunById(r.id)!);

          return {
            ...w,
            steps,
            triggers,
            runs,
            most_recent_run: runs.length > 0 ? runs[runs.length - 1] : null,
          };
        });

      return NextResponse.json({ data: { workflows: orgWorkflows } });
    }

    // --- 2. Single Workflow Query ---
    if (query?.includes('GetWorkflowById') || query?.includes('workflow_by_pk')) {
      const wfId = variables?.id;
      const wf = dbStore.workflows.get(wfId);

      if (!wf || !dbStore.checkLayer1Select(session, wf.org_id)) {
        return NextResponse.json({
          data: { workflow_by_pk: null },
          errors: [{ message: `Layer 1 RLS Access Denied: Workflow ID '${wfId}' not found or belongs to another organization.` }],
        });
      }

      const steps = Array.from(dbStore.workflowSteps.values())
        .filter((s) => s.workflow_id === wf.id)
        .sort((a, b) => a.step_order - b.step_order);

      const triggers = Array.from(dbStore.workflowTriggers.values()).filter((t) => t.workflow_id === wf.id);

      return NextResponse.json({
        data: {
          workflow_by_pk: {
            ...wf,
            steps,
            triggers,
          },
        },
      });
    }

    // --- 3. Mutation: Create/Edit Workflow ---
    if (query?.includes('CreateWorkflow') || query?.includes('insert_workflows_one') || query?.includes('SaveWorkflow')) {
      const { name, description, org_id, steps } = variables;
      const targetOrg = org_id || session.org_id;

      if (!dbStore.checkLayer1Mutation(session, targetOrg, ['owner', 'editor'])) {
        return NextResponse.json({
          errors: [{ message: `Layer 1 Role Failure: Role '${session.role}' cannot create/edit workflows in Org '${targetOrg}'.` }],
        }, { status: 403 });
      }

      // Layer 2 Step Gating Check
      if (steps && Array.isArray(steps)) {
        for (const s of steps) {
          const stepGate = dbStore.checkLayer2StepCreation(session.role, s.type as StepType);
          if (!stepGate.allowed) {
            return NextResponse.json({
              errors: [{ message: stepGate.reason }],
            }, { status: 403 });
          }
        }
      }

      const newWf: Workflow = {
        id: variables.id || uuidv4(),
        org_id: targetOrg,
        name: name || 'New AI Workflow',
        description: description || 'Custom agent chain',
        is_active: true,
        created_by: session.user_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      dbStore.workflows.set(newWf.id, newWf);

      if (steps && Array.isArray(steps)) {
        steps.forEach((s, idx) => {
          const stepObj: WorkflowStep = {
            id: s.id || uuidv4(),
            workflow_id: newWf.id,
            step_order: idx + 1,
            name: s.name || `Step ${idx + 1}`,
            type: s.type,
            config: s.config || {},
            created_at: new Date().toISOString(),
          };
          dbStore.workflowSteps.set(stepObj.id, stepObj);
        });
      }

      return NextResponse.json({ data: { insert_workflows_one: newWf } });
    }

    // --- 4. Mutation: Trigger Workflow Run ---
    if (query?.includes('triggerWorkflowRun')) {
      const { workflow_id, payload } = variables;
      const res = await triggerWorkflowRun(workflow_id, session, 'manual', payload);
      return NextResponse.json({ data: { triggerWorkflowRun: res } });
    }

    // --- 5. Mutation: Approve Step Run ---
    if (query?.includes('approveStep')) {
      const { step_run_id, decision } = variables;
      const res = await approveStepRun(step_run_id, session, decision);
      return NextResponse.json({ data: { approveStep: res } });
    }

    // Fallback response for unhandled queries
    return NextResponse.json({ data: { message: 'GraphQL Query Executed' } });
  } catch (err: any) {
    return NextResponse.json({ errors: [{ message: err.message }] }, { status: 400 });
  }
}

// Live Subscription SSE Endpoint for step_runs
export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get('run_id');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const sendUpdate = (run: any) => {
        if (!runId || run.id === runId) {
          const data = `data: ${JSON.stringify(run)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      };

      // Push initial state
      if (runId) {
        const currentRun = dbStore.getWorkflowRunById(runId);
        if (currentRun) sendUpdate(currentRun);
      }

      const unsubscribe = dbStore.subscribeToRuns((run) => {
        sendUpdate(run);
      });

      req.signal.addEventListener('abort', () => {
        unsubscribe();
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
