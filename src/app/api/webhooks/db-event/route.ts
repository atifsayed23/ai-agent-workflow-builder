import { NextRequest, NextResponse } from 'next/server';
import { triggerWorkflowRun } from '@/lib/workflow-runner';
import { UserSession } from '@/lib/types';
import { getPgEngine } from '@/lib/postgres-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await getPgEngine();

    // Extract table and event type from Hasura Event Trigger payload
    const tableName = body.table?.name || body.event_table || 'customer_tickets';
    const eventType = body.event?.op || 'INSERT';

    // Find workflows matching watched table db_event trigger
    const res = await db.query
      ? await db.query(`SELECT workflow_id FROM public.workflow_triggers WHERE type = 'db_event';`)
      : await db.exec(`SELECT workflow_id FROM public.workflow_triggers WHERE type = 'db_event';`);

    if (res.rows.length === 0) {
      return NextResponse.json({ message: 'No workflows configured for db_event triggers' });
    }

    const workflowId = res.rows[0].workflow_id;
    const wfRes = await db.query
      ? await db.query(`SELECT org_id, created_by FROM public.workflows WHERE id = $1;`, [workflowId])
      : await db.exec(`SELECT org_id, created_by FROM public.workflows WHERE id = $1;`, [workflowId]);

    if (wfRes.rows.length === 0) {
      return NextResponse.json({ error: 'Target workflow not found' }, { status: 404 });
    }

    const wf = wfRes.rows[0];

    const session: UserSession = {
      user_id: wf.created_by,
      user_email: 'db-event-system@acme.com',
      org_id: wf.org_id,
      role: 'owner',
    };

    const runResult = await triggerWorkflowRun(workflowId, session, 'db_event', {
      table: tableName,
      event_type: eventType,
      row: body.event?.data?.new || {},
    });

    return NextResponse.json({
      success: true,
      trigger: 'db_event',
      run_id: runResult.run.id,
      status: runResult.run.status,
      message: runResult.message,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
