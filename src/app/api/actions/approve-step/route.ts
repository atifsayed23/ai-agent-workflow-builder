import { NextRequest, NextResponse } from 'next/server';
import { approveStepRun } from '@/lib/workflow-runner';
import { UserSession, OrgRole } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const hasuraUserId = req.headers.get('x-hasura-user-id') || body.session_variables?.['x-hasura-user-id'] || body.input?.user_id;
    const hasuraOrgId = req.headers.get('x-hasura-org-id') || body.session_variables?.['x-hasura-org-id'] || body.input?.org_id;
    const hasuraRole = (req.headers.get('x-hasura-org-role') || body.session_variables?.['x-hasura-org-role'] || body.input?.user_role || 'editor') as OrgRole;
    const userEmail = req.headers.get('x-hasura-user-email') || body.input?.user_email || 'approver@acme.com';

    const stepRunId = body.input?.step_run_id || body.step_run_id;
    const decision = body.input?.decision || body.decision || 'approve';

    if (!stepRunId) {
      return NextResponse.json({ message: 'Missing required field: step_run_id' }, { status: 400 });
    }

    const session: UserSession = {
      user_id: hasuraUserId || 'user-default-approver',
      user_email: userEmail,
      org_id: hasuraOrgId || '11111111-1111-4111-a111-111111111111',
      role: hasuraRole,
    };

    const result = await approveStepRun(stepRunId, session, decision);

    return NextResponse.json({
      step_run_id: result.stepRun.id,
      status: result.workflowRun.status,
      message: result.message,
    });
  } catch (err: any) {
    const status = err.message.includes('Permission Denied') || err.message.includes('Violation') || err.message.includes('RLS') ? 403 : 400;
    return NextResponse.json({ message: err.message }, { status });
  }
}
