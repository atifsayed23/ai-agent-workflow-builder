import { NextRequest, NextResponse } from 'next/server';
import { getPgEngine, getWorkflowById } from '@/lib/postgres-store';
import { triggerWorkflowRun } from '@/lib/workflow-runner';
import { UserSession } from '@/lib/types';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const workflowId = params.id;
    const db = await getPgEngine();
    const body = await req.json().catch(() => ({}));
    const secretToken = req.headers.get('x-webhook-secret') || req.nextUrl.searchParams.get('token');

    // 1. Fetch Workflow from PostgreSQL
    const workflow = await getWorkflowById(workflowId);
    if (!workflow) {
      return NextResponse.json({ error: `Workflow not found: ${workflowId}` }, { status: 404 });
    }

    // 2. Fetch Webhook Triggers for this workflow from PostgreSQL
    const trigRes = await db.query(
      `SELECT config FROM public.workflow_triggers WHERE workflow_id = $1 AND type = 'webhook';`,
      [workflowId]
    );

    if (trigRes.rows.length === 0) {
      return NextResponse.json({ error: 'No webhook trigger configured for this workflow' }, { status: 400 });
    }

    const config = typeof trigRes.rows[0].config === 'string' ? JSON.parse(trigRes.rows[0].config) : trigRes.rows[0].config;
    const expectedToken = config?.secret_token;

    // Strict Webhook Authentication Check
    if (expectedToken && secretToken !== expectedToken) {
      return NextResponse.json({ error: 'Invalid or missing webhook secret token' }, { status: 401 });
    }

    // System execution session using workflow creator's identity
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
