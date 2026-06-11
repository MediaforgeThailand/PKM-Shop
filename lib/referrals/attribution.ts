const REFERRAL_STORAGE_KEY = 'mira_ref';
const REFERRAL_DAYS = 30;

type StoredReferral = {
  expires_at: string;
  ref_code: string;
};

function storage() {
  return (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
}

function documentCookie() {
  return (globalThis as typeof globalThis & { document?: { cookie: string } }).document;
}

export function normalizeRefCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32);
}

export function storeReferralCode(rawCode: string) {
  const refCode = normalizeRefCode(rawCode);

  if (!/^[A-Z0-9-]{3,32}$/.test(refCode)) {
    return null;
  }

  const expiresAt = new Date(Date.now() + REFERRAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const payload: StoredReferral = {
    expires_at: expiresAt,
    ref_code: refCode,
  };

  storage()?.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(payload));

  const doc = documentCookie();

  if (doc) {
    doc.cookie = `${REFERRAL_STORAGE_KEY}=${encodeURIComponent(refCode)}; Max-Age=${REFERRAL_DAYS * 24 * 60 * 60}; Path=/; SameSite=Lax`;
  }

  return payload;
}

export function readStoredReferralCode() {
  const raw = storage()?.getItem(REFERRAL_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const payload = JSON.parse(raw) as Partial<StoredReferral>;

    if (!payload.ref_code || !payload.expires_at || new Date(payload.expires_at).getTime() < Date.now()) {
      storage()?.removeItem(REFERRAL_STORAGE_KEY);
      return null;
    }

    return normalizeRefCode(payload.ref_code);
  } catch {
    storage()?.removeItem(REFERRAL_STORAGE_KEY);
    return null;
  }
}
