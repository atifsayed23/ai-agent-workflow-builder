import { NextRequest, NextResponse } from 'next/server';
import {
  getPgEngine,
  verifyAuthoritativeOrgMember,
  checkLayer2StepCreation,
  getWorkflowsByOrg,
  getWorkflowById,
  getWorkflowRunById
} from '@/lib/postgres-store';
import { triggerWorkflowRun, approveStepRun, subscribeToRuns } from '@/lib/workflow-runner';
import { UserSession, OrgRole, StepType } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await getPgEngine();

    // Extract headers passed by Hasura JWT / Client
    const hasuraUserId = req.headers.get('x-hasura-user-id') || body.session_variables?.['x-hasura-user-id'] || 'aaaa1111-1111-4111-a111-111111111111';
    const hasuraOrgId = req.headers.get('x-hasura-org-id') || body.session_variables?.['x-hasura-org-id'] || '11111111-1111-4111-a111-111111111111';
    const userEmail = req.headers.get('x-hasura-user-email') || body.input?.user_email || 'owner@acme.com';

    // Authoritative Layer 1 Security Lookup in PostgreSQL org_members table
    const memberCheck = await verifyAuthoritativeOrgMember(hasuraUserId, hasuraOrgId);

    const session: UserSession = {
      user_id: hasuraUserId,
      user_email: userEmail,
      org_id: hasuraOrgId,
      role: memberCheck.isMember ? memberCheck.role! : 'viewer',
    };

    const { query, variables } = body;

    // --- 1. Workflow Query over PostgreSQL ---
    if (query?.includes('GetOrgWorkflows') || query?.includes('workflows(') || query?.includes('query Workflows')) {
      const targetOrgId = variables?.org_id || session.org_id;

      // Authoritative Layer 1 Security Check in org_members table
      const targetMemberCheck = await verifyAuthoritativeOrgMember(session.user_id, targetOrgId);
      if (!targetMemberCheck.isMember) {
        return NextResponse.json({
          data: { workflows: [] },
          errors: [{ message: `Layer 1 RLS Permission Denied: User '${session.user_id}' is not a verified member of Org '${targetOrgId}' in org_members table.` }],
        });
      }

      const orgWorkflows = await getWorkflowsByOrg(targetOrgId);
      return NextResponse.json({ data: { workflows: orgWorkflows } });
    }

    // --- 2. Single Workflow Query ---
    if (query?.includes('GetWorkflowById') || query?.includes('workflow_by_pk')) {
      const wfId = variables?.id;
      const wf = await getWorkflowById(wfId);

      if (!wf) {
        return NextResponse.json({
          data: { workflow_by_pk: null },
          errors: [{ message: `Workflow ID '${wfId}' not found in PostgreSQL.` }],
        });
      }

      // Authoritative Layer 1 Check
      const targetMemberCheck = await verifyAuthoritativeOrgMember(session.user_id, wf.org_id);
      if (!targetMemberCheck.isMember) {
        return NextResponse.json({
          data: { workflow_by_pk: null },
          errors: [{ message: `Layer 1 RLS Access Denied: User '${session.user_id}' is not in Org '${wf.org_id}' org_members.` }],
        });
      }

      return NextResponse.json({ data: { workflow_by_pk: wf } });
    }

    // --- 3. Mutation: Create/Edit Workflow in PostgreSQL ---
    if (query?.includes('CreateWorkflow') || query?.includes('insert_workflows_one') || query?.includes('SaveWorkflow')) {
      const { name, description, org_id, steps } = variables;
      const targetOrg = org_id || session.org_id;

      const targetMemberCheck = await verifyAuthoritativeOrgMember(session.user_id, targetOrg);
      if (!targetMemberCheck.isMember || (targetMemberCheck.role !== 'owner' && targetMemberCheck.role !== 'editor')) {
        return NextResponse.json({
          errors: [{ message: `Layer 1 Role Failure: User role '${targetMemberCheck.role}' cannot create/edit workflows in Org '${targetOrg}'.` }],
        }, { status: 403 });
      }

      // Layer 2 Step Gating Check
      if (steps && Array.isArray(steps)) {
        for (const s of steps) {
          const stepGate = checkLayer2StepCreation(targetMemberCheck.role, s.type as StepType);
          if (!stepGate.allowed) {
            return NextResponse.json({
              errors: [{ message: stepGate.reason }],
            }, { status: 403 });
          }
        }
      }

      const wfId = variables.id || uuidv4();
      const now = new Date().toISOString();

      await queryExec(
        db,
        `INSERT INTO public.workflows (id, org_id, name, description, is_active, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, $5, $6, $6);`,
        [wfId, targetOrg, name || 'New AI Workflow', description || 'Custom agent chain', session.user_id, now]
      );

      if (steps && Array.isArray(steps)) {
        for (let idx = 0; idx < steps.length; idx++) {
          const s = steps[idx];
          await queryExec(
            db,
            `INSERT INTO public.workflow_steps (id, workflow_id, step_order, name, type, config)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb);`,
            [s.id || uuidv4(), wfId, idx + 1, s.name || `Step ${idx + 1}`, s.type, JSON.stringify(s.config || {})]
          );
        }
      }

      const createdWf = await getWorkflowById(wfId);
      return NextResponse.json({ data: { insert_workflows_one: createdWf } });
    }

    // --- 4. Hasura Action: Trigger Workflow Run ---
    if (query?.includes('triggerWorkflowRun')) {
      const { workflow_id, payload } = variables;
      const res = await triggerWorkflowRun(workflow_id, session, 'manual', payload);
      return NextResponse.json({ data: { triggerWorkflowRun: res } });
    }

    // --- 5. Hasura Action: Approve Step Run ---
    if (query?.includes('approveStep')) {
      const { step_run_id, decision } = variables;
      const res = await approveStepRun(step_run_id, session, decision);
      return NextResponse.json({ data: { approveStep: res } });
    }

    return NextResponse.json({ data: { message: 'PostgreSQL GraphQL Query Executed' } });
  } catch (err: any) {
    return NextResponse.json({ errors: [{ message: err.message }] }, { status: 400 });
  }
}

// Live Subscription SSE Endpoint over PostgreSQL
export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get('run_id');
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendUpdate = (run: any) => {
        if (!runId || run.id === runId) {
          const data = `data: ${JSON.stringify(run)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      };

      if (runId) {
        const currentRun = await getWorkflowRunById(runId);
        if (currentRun) sendUpdate(currentRun);
      }

      const unsubscribe = subscribeToRuns((run) => {
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

async function queryExec(db: any, text: string, params: any[] = []): Promise<any> {
  if (db.query) {
    return await db.query(text, params);
  } else if (db.exec) {
    return await db.exec(text, params);
  }
  throw new Error('Unsupported database driver');
}
