async function testPgRun() {
  console.log('Testing triggerWorkflowRun Hasura Action against PostgreSQL database...');
  const res = await fetch('http://localhost:3001/api/actions/trigger-workflow', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-org-id': '11111111-1111-4111-a111-111111111111',
      'x-hasura-user-id': 'aaaa1111-1111-4111-a111-111111111111',
      'x-hasura-user-email': 'owner@acme.com',
    },
    body: JSON.stringify({
      input: {
        workflow_id: '11111111-2222-4111-a111-111111111111',
        payload: { source: 'pg_integration_test' },
      },
    }),
  });

  const data = await res.json();
  console.log('Hasura Action Trigger Workflow Result:\n', JSON.stringify(data, null, 2));
}

testPgRun();
