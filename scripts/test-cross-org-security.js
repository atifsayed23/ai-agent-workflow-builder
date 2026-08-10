async function testCrossOrgSecurity() {
  console.log('Testing Cross-Org Penetration Attack against PostgreSQL database...');
  const res = await fetch('http://localhost:3001/api/actions/trigger-workflow', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-org-id': '22222222-2222-4222-b222-222222222222', // Org B!
      'x-hasura-user-id': 'bbbb2222-2222-4222-b222-222222222222', // Org B Editor!
      'x-hasura-user-email': 'editor@stark.com',
    },
    body: JSON.stringify({
      input: {
        workflow_id: '11111111-2222-4111-a111-111111111111', // Org A Workflow!
      },
    }),
  });

  const data = await res.json();
  console.log('Cross-Org Attack Response (HTTP status:', res.status, '):\n', JSON.stringify(data, null, 2));
}

testCrossOrgSecurity();
