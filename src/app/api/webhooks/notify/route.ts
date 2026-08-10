import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Extract row data from Hasura Event Trigger payload
    const newRecord = body.event?.data?.new || body;
    const recipient = newRecord.recipient || '#sec-ops-channel';
    const message = newRecord.message || 'Notification triggered by Hasura Event Trigger on notifications_log table.';

    console.log(`[HASURA EVENT TRIGGER] Dispatching Slack/Email Alert to ${recipient}: ${message}`);

    return NextResponse.json({
      success: true,
      delivered_to: recipient,
      message: 'Notification alert dispatched via Hasura Event Trigger',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
