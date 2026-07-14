// PKM-Shop — SlipOK slip verification client (Ready.md §7.1).
// Direct API integration. Until SLIPOK_API_KEY / SLIPOK_BRANCH_ID are set, verifySlip
// returns { status: 'not_configured' } so slip-verify routes the slip to the manual queue
// (payment stays staff-confirmed). No client ever sees the key (server-only env).

declare const Deno: {
  env: { get: (key: string) => string | undefined };
};

export type SlipOkResult =
  | { status: 'not_configured' }
  | { status: 'passed'; transRef: string; amount: number | null; receivingBank: string | null; receiverAccount: string | null; raw: unknown }
  | { status: 'duplicate'; raw: unknown }
  | { status: 'amount_mismatch'; raw: unknown }
  | { status: 'wrong_account'; raw: unknown }
  | { status: 'bank_delay'; retryMinutes: number; raw: unknown }
  | { status: 'bank_busy'; raw: unknown }
  | { status: 'unreadable'; raw: unknown }
  | { status: 'quota_exceeded'; raw: unknown }
  | { status: 'error'; message: string; raw: unknown };

function env(key: string): string | undefined {
  return Deno.env.get(key)?.trim() || undefined;
}

type SlipOkResponse = {
  success?: boolean;
  code?: number;
  message?: string;
  data?: {
    amount?: number;
    receivingBank?: string;
    receiver?: { account?: { value?: string }; displayName?: string };
    transRef?: string;
  };
};

// Map a SlipOK error code (Ready.md §7.1) to a typed result.
function mapErrorCode(code: number | undefined, raw: unknown): SlipOkResult {
  switch (code) {
    case 1012:
      return { status: 'duplicate', raw };
    case 1013:
      return { status: 'amount_mismatch', raw };
    case 1014:
      return { status: 'wrong_account', raw };
    case 1010:
      return { status: 'bank_delay', retryMinutes: 5, raw };
    case 1009:
      return { status: 'bank_busy', raw };
    case 1007:
    case 1008:
    case 1011:
      return { status: 'unreadable', raw };
    case 1003:
    case 1004:
      return { status: 'quota_exceeded', raw };
    default:
      return { status: 'error', message: `SlipOK code ${code ?? 'unknown'}`, raw };
  }
}

// Verify a slip image against the expected order amount. `qrData` is the value decoded from
// the slip's QR (preferred, fastest/most accurate); if absent we fall back to the raw file.
export async function verifySlip(params: {
  expectedAmount: number;
  qrData?: string | null;
  fileBytes?: Uint8Array | null;
  fileName?: string;
  contentType?: string;
}): Promise<SlipOkResult> {
  const apiKey = env('SLIPOK_API_KEY');
  const branchId = env('SLIPOK_BRANCH_ID');
  if (!apiKey || !branchId) {
    return { status: 'not_configured' };
  }

  const url = `https://api.slipok.com/api/line/apikey/${encodeURIComponent(branchId)}`;
  let response: Response;

  try {
    if (params.qrData) {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'x-authorization': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: params.qrData, amount: params.expectedAmount, log: true }),
      });
    } else if (params.fileBytes) {
      const buffer = new ArrayBuffer(params.fileBytes.byteLength);
      new Uint8Array(buffer).set(params.fileBytes);
      const form = new FormData();
      form.append('files', new Blob([buffer], { type: params.contentType ?? 'image/jpeg' }), params.fileName ?? 'slip.jpg');
      form.append('amount', String(params.expectedAmount));
      form.append('log', 'true');
      response = await fetch(url, { method: 'POST', headers: { 'x-authorization': apiKey }, body: form });
    } else {
      return { status: 'unreadable', raw: null };
    }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'SlipOK request failed', raw: null };
  }

  const raw = (await response.json().catch(() => null)) as SlipOkResponse | null;

  if (!response.ok || !raw?.success) {
    return mapErrorCode(raw?.code, raw);
  }

  const data = raw.data ?? {};
  if (!data.transRef) {
    return { status: 'error', message: 'SlipOK success without transRef', raw };
  }
  // SlipOK already compared `amount` (else 1013) and the linked receiver account (else 1014).
  // slip-verify still re-validates amount + receiver + duplicate transRef on our side before
  // flipping the order (Ready.md §7.1 step 3) — `amount` stays null when SlipOK omitted it so
  // the caller's re-check can't be vacuously true.
  return {
    status: 'passed',
    transRef: data.transRef,
    amount: typeof data.amount === 'number' ? data.amount : null,
    receivingBank: data.receivingBank ?? null,
    receiverAccount: data.receiver?.account?.value ?? null,
    raw,
  };
}

// Ready.md §7.1 note: SlipOK masks the receiver account (e.g. "xxx-x-x0209-x"), so we compare
// partially — every digit run (len >= 3) visible in the masked value must appear in the store
// account's digits. No configured store account -> defer to SlipOK's linked-account check (1014).
export function receiverMatchesStore(receiverAccount: string | null, storeAccount: string | null | undefined): boolean {
  if (!storeAccount || !storeAccount.trim()) {
    return true;
  }
  if (!receiverAccount) {
    return false;
  }
  const storeDigits = storeAccount.replace(/\D/g, '');
  const runs = receiverAccount.match(/\d{3,}/g) ?? [];
  if (storeDigits.length === 0 || runs.length === 0) {
    return false;
  }
  return runs.every((run) => storeDigits.includes(run));
}

// Remaining-quota probe (Ready.md §7.1: small admin widget). Null when not configured.
export async function slipOkQuota(): Promise<{ ok: boolean; raw: unknown } | null> {
  const apiKey = env('SLIPOK_API_KEY');
  const branchId = env('SLIPOK_BRANCH_ID');
  if (!apiKey || !branchId) {
    return null;
  }
  try {
    const response = await fetch(`https://api.slipok.com/api/line/apikey/${encodeURIComponent(branchId)}/quota`, {
      headers: { 'x-authorization': apiKey },
    });
    const raw = await response.json().catch(() => null);
    return { ok: response.ok, raw };
  } catch (error) {
    return { ok: false, raw: error instanceof Error ? error.message : String(error) };
  }
}
