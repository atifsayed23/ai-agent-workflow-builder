async function testPgGql() {
  console.log('Sending GraphQL query to /api/graphql powered by PostgreSQL database...');
  const res = await fetch('http://localhost:3001/api/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-org-id': '11111111-1111-4111-a111-111111111111',
      'x-hasura-user-id': 'aaaa1111-1111-4111-a111-111111111111',
      'x-hasura-user-email': 'owner@acme.com',
    },
    body: JSON.stringify({
      query: `
        query GetOrgWorkflows($org_id: uuid!) {
          workflows(where: { org_id: { _eq: $org_id } }) {
            id
            name
            description
            steps
            triggers
          }
        }
      `,
      variables: { org_id: '11111111-1111-4111-a111-111111111111' },
    }),
  });

  const data = await res.json();
  console.log('PostgreSQL GraphQL Response:\n', JSON.stringify(data, null, 2));
}

testPgGql();
