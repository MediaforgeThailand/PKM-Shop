// PKM-Shop — payroll-cutoff cron (Ready.md §3.7). Runs Sunday 24:00 (Mon 00:00) Asia/Bangkok.
// Closes the week's payroll period per tenant, stages payouts, and notifies the owner (total
// to transfer) plus each staff member (their own amount). The system never transfers money.
import { assertServiceRoleAuthorization, rpc, selectMany } from '../_shared/db.ts';
import { handleOptions, json, toErrorResponse } from '../_shared/http.ts';
import { notifyEvent } from '../_shared/notify.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

type TenantRow = { id: string; slug: string };
type PeriodRow = { id: string; period_start: string; period_end: string };
type PayoutRow = { profile_id: string; total: number };

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) {
    return optionsResponse;
  }
  try {
    assertServiceRoleAuthorization(req.headers.get('authorization'));
    const tenants = await selectMany<TenantRow>('tenants', { select: 'id,slug' });
    let closed = 0;

    for (const tenant of tenants) {
      const period = await rpc<PeriodRow>('pkm_close_payroll_period', { p_tenant_id: tenant.id });
      if (!period?.id) {
        continue;
      }
      closed += 1;
      const payouts = await selectMany<PayoutRow>('payroll_payouts', {
        period_id: `eq.${period.id}`,
        select: 'profile_id,total',
      });
      const total = payouts.reduce((sum, p) => sum + (p.total ?? 0), 0);

      await notifyEvent({
        eventType: 'payroll_cutoff',
        extra: { count: payouts.length, total },
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
      }).catch((error) => console.warn('payroll_notify_failed', error instanceof Error ? error.message : error));

      // Ready.md §6: each rider/packer also gets their own total ("ยอดของฉันรอบนี้").
      for (const payout of payouts) {
        await notifyEvent({
          eventType: 'payroll_self',
          extra: { amount: payout.total, profileId: payout.profile_id },
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
        }).catch((error) => console.warn('payroll_self_notify_failed', error instanceof Error ? error.message : error));
      }
    }

    return json({ closed, ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
});
