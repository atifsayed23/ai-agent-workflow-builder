const { getPgEngine, verifyAuthoritativeOrgMember, ORG_A_ID, USER_A_OWNER_ID } = require('../src/lib/postgres-store');

async function debugPg() {
  const db = await getPgEngine();

  const orgs = await db.query('SELECT * FROM public.organizations;');
  console.log('PostgreSQL Organizations:', orgs.rows);

  const members = await db.query('SELECT * FROM public.org_members;');
  console.log('PostgreSQL Org Members:', members.rows);

  const workflows = await db.query('SELECT * FROM public.workflows;');
  console.log('PostgreSQL Workflows:', workflows.rows);

  const check = await verifyAuthoritativeOrgMember(USER_A_OWNER_ID, ORG_A_ID);
  console.log('Authoritative Member Check Result:', check);
}

debugPg().catch(console.error);
