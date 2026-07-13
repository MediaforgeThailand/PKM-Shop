// PKM-Shop — staff identity & team management. Fixes the "fresh login = dead app" blocker:
// a logged-in user with no profile is not is_pkm_member, so every RLS read is empty and every
// write 403s. Actions:
//  ensure_self : return the caller's profile; if they have none AND the tenant has no admin yet,
//                bootstrap them as the owner/admin (safe: the app has no public sign-up, so the
//                first person who can log in is the owner who created the auth user).
//  list_staff  : admin — list the team.
//  create_login: admin — create an auth user (email+password) + bound profile with roles.
//  set_roles / set_active : admin — manage the team.
import { assertTenant, insertRow, selectMany, selectOne, updateRows, resolveAuthUser } from '../_shared/db.ts';
import { handleOptions, HttpError, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { assertRole, resolveStaffProfile } from '../_shared/pkmAuth.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (k: string) => string | undefined };
};

const ROLE = z.enum(['admin', 'stock', 'packer', 'rider', 'staff']);

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ensure_self'), tenant_slug: z.string().min(1), name: z.string().max(80).optional() }),
  z.object({ action: z.literal('list_staff'), tenant_slug: z.string().min(1) }),
  z.object({ action: z.literal('create_login'), tenant_slug: z.string().min(1), name: z.string().trim().min(1).max(80), email: z.string().email(), password: z.string().min(6).max(72), phone: z.string().max(30).optional(), roles: z.array(ROLE).min(1) }),
  z.object({ action: z.literal('set_roles'), tenant_slug: z.string().min(1), profile_id: z.string().uuid(), roles: z.array(ROLE).min(1) }),
  z.object({ action: z.literal('set_active'), tenant_slug: z.string().min(1), profile_id: z.string().uuid(), active: z.boolean() }),
]);

type Profile = { id: string; tenant_id: string; user_id: string | null; name: string; phone: string | null; roles: string[]; line_user_id: string | null; link_code: string | null; active: boolean };
const PROFILE_SELECT = 'id,tenant_id,user_id,name,phone,roles,line_user_id,link_code,active';

async function createAuthUser(email: string, password: string): Promise<string> {
  const url = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new HttpError('UPSTREAM', 'Missing service configuration.', 500);
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (payload && (payload.msg || payload.message || payload.error_description)) || 'สร้างบัญชีเข้าสู่ระบบไม่สำเร็จ';
    throw new HttpError('VALIDATION', String(msg), res.status === 422 ? 409 : 400);
  }
  const id = (payload as { id?: string }).id;
  if (!id) throw new HttpError('UPSTREAM', 'Auth user id missing.', 502);
  return id;
}

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;
  try {
    const body = await validateJson(req, schema);
    const tenant = await assertTenant(body.tenant_slug);
    const auth = req.headers.get('authorization');

    if (body.action === 'ensure_self') {
      // READ-ONLY. This is a SHARED multi-tenant DB and tenant_slug is caller-supplied, so we
      // must NEVER mint an admin here (that allowed cross-tenant self-promotion — audit blocker).
      // The first admin per tenant is seeded out-of-band with the service role; everyone else is
      // added by an existing admin via create_login. A user with no profile is "pending".
      const user = await resolveAuthUser(auth);
      const existing = await selectOne<Profile>('profiles', { user_id: `eq.${user.id}`, tenant_id: `eq.${tenant.id}`, select: PROFILE_SELECT });
      return json({ ok: true, profile: existing ?? null, pending: !existing });
    }

    // Remaining actions require an admin.
    const profile = await resolveStaffProfile(auth, tenant.id);
    assertRole(profile, ['admin']);

    switch (body.action) {
      case 'list_staff': {
        const staff = await selectMany<Profile>('profiles', { tenant_id: `eq.${tenant.id}`, select: PROFILE_SELECT, order: 'created_at.asc' });
        return json({ ok: true, staff });
      }
      case 'create_login': {
        const userId = await createAuthUser(body.email, body.password);
        const created = await insertRow<Profile>('profiles', {
          tenant_id: tenant.id, user_id: userId, name: body.name.trim(), phone: body.phone ?? null, roles: body.roles, active: true,
        }, { select: PROFILE_SELECT });
        return json({ ok: true, profile: created });
      }
      case 'set_roles': {
        const rows = await updateRows<Profile>('profiles', { roles: body.roles }, { id: `eq.${body.profile_id}`, tenant_id: `eq.${tenant.id}`, select: PROFILE_SELECT });
        if (!rows[0]) throw new HttpError('VALIDATION', 'ไม่พบพนักงาน', 404);
        return json({ ok: true, profile: rows[0] });
      }
      case 'set_active': {
        const rows = await updateRows<Profile>('profiles', { active: body.active }, { id: `eq.${body.profile_id}`, tenant_id: `eq.${tenant.id}`, select: PROFILE_SELECT });
        if (!rows[0]) throw new HttpError('VALIDATION', 'ไม่พบพนักงาน', 404);
        return json({ ok: true, profile: rows[0] });
      }
      default:
        throw new HttpError('VALIDATION', 'Unknown action.', 400);
    }
  } catch (error) {
    return toErrorResponse(error);
  }
});
