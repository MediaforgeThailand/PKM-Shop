// Shared primitive rows/envelopes for the PKM edge functions.
// Domain shapes for the sales chat live in pkmTypes.ts.

export type ApiEnvelope<TData> =
  | {
      data: TData;
      ok: true;
    }
  | {
      error: {
        code: string;
        message: string;
      };
      ok: false;
    };

export type TenantRow = {
  display_name: string;
  features: Record<string, unknown>;
  id: string;
  logo_url: string | null;
  promptpay_id: string | null;
  slug: string;
};

export type CustomerRow = {
  auth_user_id: string | null;
  created_at: string;
  id: string;
  line_user_id: string | null;
  nickname: string | null;
  phone: string | null;
  tenant_id: string;
  zone_override: 'in_zone' | 'out_zone' | null;
};
