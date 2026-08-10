import { NextRequest, NextResponse } from 'next/server';
import { dbStore } from '@/lib/db-store';
import { triggerWorkflowRun } from '@/lib/workflow-runner';
import { UserSession } from '@/lib/types';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const workflowId = params.id;
    const body = await req.json().catch(() => ({}));
    const secretToken = req.headers.get('x-webhook-secret') || req.nextUrl.searchParams.get('token');

    const workflow = dbStore.workflows.get(workflowId);
    if (!workflow) {
      return NextResponse.json({ error: `Workflow not found: ${workflowId}` }, { status: 404 });
    }

    const triggers = Array.from(dbStore.workflowTriggers.values()).filter(
      (t) => t.workflow_id === workflowId && t.type === 'webhook'
    );

    if (triggers.length === 0) {
      return NextResponse.json({ error: 'No webhook trigger configured for this workflow' }, { status: 400 });
    }

    const expectedToken = triggers[0].config.secret_token;
    if (expectedToken && secretToken !== expectedToken) {
      return NextResponse.json({ error: 'Invalid or missing webhook secret token' }, { status: 401 });
    }

    // System execution session using workflow owner's identity
    const session: UserSession = {
      user_id: workflow.created_by,
      user_email: 'webhook-system@acme.com',
      org_id: workflow.org_id,
      role: 'owner',
    };

    const result = await triggerWorkflowRun(workflowId, session, 'webhook', body);

    return NextResponse.json({
      success: true,
      trigger: 'webhook',
      run_id: result.run.id,
      status: result.run.status,
      message: result.message,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
