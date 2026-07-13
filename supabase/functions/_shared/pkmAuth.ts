// PKM-Shop — resolve the calling staff member and enforce role (Ready.md §4 RLS/roles).
// Staff call the action functions with their Supabase JWT; we resolve their profile and
// check the required role before performing the action with the service role.
import { resolveAuthUser, selectOne } from './db.ts';
import { HttpError } from './http.ts';

export type PkmRole = 'admin' | 'stock' | 'packer' | 'rider' | 'staff';

export type StaffProfile = {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  roles: PkmRole[];
  active: boolean;
};

export async function resolveStaffProfile(
  authorization: string | null,
  tenantId: string,
): Promise<StaffProfile> {
  const user = await resolveAuthUser(authorization);
  const profile = await selectOne<StaffProfile>('profiles', {
    select: 'id,tenant_id,user_id,name,roles,active',
    tenant_id: `eq.${tenantId}`,
    user_id: `eq.${user.id}`,
  });
  if (!profile || !profile.active) {
    throw new HttpError('FORBIDDEN', 'No active staff profile for this tenant.', 403);
  }
  return profile;
}

export function assertRole(profile: StaffProfile, roles: PkmRole[]): void {
  const ok = Array.isArray(profile.roles) && profile.roles.some((r) => roles.includes(r) || r === 'admin');
  if (!ok) {
    throw new HttpError('FORBIDDEN', `Requires role: ${roles.join('/')}.`, 403);
  }
}

// Actor string for the transition RPCs (e.g. "rider:<uid>").
export function actorTag(kind: PkmRole | 'admin', profile: StaffProfile): string {
  return `${kind}:${profile.user_id}`;
}
