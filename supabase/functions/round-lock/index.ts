// PKM-Shop — round-lock cron (Ready.md §3.1). Runs every hour at minute :30 (Asia/Bangkok).
// Locks the upcoming rider round for each tenant and notifies packers (packing list) and
// riders (round available). Schedule via pg_cron / Scheduled Functions calling this with the
// service-role key.
import { assertServiceRoleAuthorization, rpc, selectMany } from '../_shared/db.ts';
import { handleOptions, json, toErrorResponse } from '../_shared/http.ts';
import { notifyEvent } from '../_shared/notify.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

type RoundRow = { id: string };
type TenantRow = { id: string; slug: string };

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) {
    return optionsResponse;
  }
  try {
    assertServiceRoleAuthorization(req.headers.get('authorization'));
    const tenants = await selectMany<TenantRow>('tenants', { select: 'id,slug' });
    let locked = 0;

    for (const tenant of tenants) {
      const rounds = await rpc<RoundRow[]>('pkm_lock_due_rounds', { p_tenant_id: tenant.id });
      for (const round of rounds ?? []) {
        locked += 1;
        await notifyEvent({ eventType: 'round_locked', roundId: round.id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch((error) => {
          console.warn('round_lock_notify_failed', error instanceof Error ? error.message : error);
        });
      }
    }

    return json({ locked, ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
});
