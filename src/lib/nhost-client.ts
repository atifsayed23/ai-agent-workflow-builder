import { NhostClient } from '@nhost/nhost-js';

const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'local';
const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'us-east-1';

export const nhost = new NhostClient({
  subdomain,
  region,
});

export function getAuthenticatedUserSession() {
  const user = nhost.auth.getUser();
  const session = nhost.auth.getSession();

  if (!session || !user) {
    // Default system session if unauthenticated in local dev
    return {
      user_id: 'aaaa1111-1111-4111-a111-111111111111',
      user_email: 'owner@acme.com',
      user_name: 'Acme Owner',
      org_id: '11111111-1111-4111-a111-111111111111',
      role: 'owner' as const,
    };
  }

  const defaultRole = (user.roles?.[0] || 'editor') as any;
  const orgId = user.metadata?.org_id || '11111111-1111-4111-a111-111111111111';

  return {
    user_id: user.id,
    user_email: user.email || '',
    user_name: user.displayName || user.email || 'Nhost User',
    org_id: orgId,
    role: defaultRole,
  };
}
