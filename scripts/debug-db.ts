import { getPgEngine, verifyAuthoritativeOrgMember, ORG_A_ID, USER_A_OWNER_ID } from '../src/lib/postgres-store';

async function test() {
  const db = await getPgEngine();
  const orgs = await db.query('SELECT * FROM public.organizations;');
  console.log('Orgs in DB:', orgs.rows);

  const wfs = await db.query('SELECT * FROM public.workflows;');
  console.log('Workflows in DB:', wfs.rows);

  const check = await verifyAuthoritativeOrgMember(USER_A_OWNER_ID, ORG_A_ID);
  console.log('Check result:', check);
}

test().catch(console.error);
