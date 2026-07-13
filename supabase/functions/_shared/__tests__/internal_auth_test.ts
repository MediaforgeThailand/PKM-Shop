import { HttpError } from '../http.ts';
import { assertInternalServiceRoleAuthorization } from '../internalAuth.ts';

declare const Deno: {
  env: {
    delete: (key: string) => void;
    get: (key: string) => string | undefined;
    set: (key: string, value: string) => void;
  };
  test: (name: string, fn: () => Promise<void> | void) => void;
};

async function withServiceConfig(fn: () => Promise<void> | void) {
  const previousUrl = Deno.env.get('SUPABASE_URL');
  const previousKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:54321');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-secret');

  try {
    await fn();
  } finally {
    if (previousUrl === undefined) {
      Deno.env.delete('SUPABASE_URL');
    } else {
      Deno.env.set('SUPABASE_URL', previousUrl);
    }

    if (previousKey === undefined) {
      Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');
    } else {
      Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', previousKey);
    }
  }
}

// The PKM internal functions (notify, fare-calc, slip-verify, round-lock, payroll-cutoff)
// all call assertServiceRoleAuthorization (re-exported from internalAuth) before any work.
// This unit-tests that guard directly; the per-function wiring is covered by deno check.
Deno.test('assertInternalServiceRoleAuthorization accepts service role and rejects anon tokens', async () => {
  await withServiceConfig(() => {
    assertInternalServiceRoleAuthorization('Bearer service-secret');

    try {
      assertInternalServiceRoleAuthorization('Bearer anon-key');
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        return;
      }

      throw error;
    }

    throw new Error('Expected internal service-role guard to reject anon token.');
  });
});
