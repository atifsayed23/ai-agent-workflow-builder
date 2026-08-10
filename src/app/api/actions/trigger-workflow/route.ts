import { NextRequest, NextResponse } from 'next/server';
import { triggerWorkflowRun } from '@/lib/workflow-runner';
import { UserSession, OrgRole } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Extract Hasura session variables passed from Nhost auth JWT token
    const hasuraUserId = req.headers.get('x-hasura-user-id') || body.session_variables?.['x-hasura-user-id'] || body.input?.user_id;
    const hasuraOrgId = req.headers.get('x-hasura-org-id') || body.session_variables?.['x-hasura-org-id'] || body.input?.org_id;
    const hasuraRole = (req.headers.get('x-hasura-org-role') || body.session_variables?.['x-hasura-org-role'] || body.input?.user_role || 'editor') as OrgRole;
    const userEmail = req.headers.get('x-hasura-user-email') || body.input?.user_email || 'caller@acme.com';

    const workflowId = body.input?.workflow_id || body.workflow_id;
    const payload = body.input?.payload || body.payload || {};

    if (!workflowId) {
      return NextResponse.json({ message: 'Missing required field: workflow_id' }, { status: 400 });
    }

    const session: UserSession = {
      user_id: hasuraUserId || 'user-default-caller',
      user_email: userEmail,
      org_id: hasuraOrgId || '11111111-1111-4111-a111-111111111111',
      role: hasuraRole,
    };

    const result = await triggerWorkflowRun(workflowId, session, 'manual', payload);

    return NextResponse.json({
      run_id: result.run.id,
      status: result.run.status,
      message: result.message,
    });
  } catch (err: any) {
    const status = err.message.includes('Permission Denied') || err.message.includes('Violation') ? 403 : 400;
    return NextResponse.json({ message: err.message }, { status });
  }
}
