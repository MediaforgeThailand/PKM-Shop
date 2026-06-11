import { assertServiceRoleAuthorization } from '../db.ts';
import { HttpError } from '../http.ts';

declare const Deno: {
  env: {
    delete: (key: string) => void;
    get: (key: string) => string | undefined;
    set: (key: string, value: string) => void;
  };
  test: (name: string, fn: () => void) => void;
};

function withServiceConfig(fn: () => void) {
  const previousUrl = Deno.env.get('SUPABASE_URL');
  const previousKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:54321');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-secret');

  try {
    fn();
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

Deno.test('assertServiceRoleAuthorization accepts the service role bearer token', () => {
  withServiceConfig(() => {
    assertServiceRoleAuthorization('Bearer service-secret');
  });
});

Deno.test('assertServiceRoleAuthorization rejects non-service tokens', () => {
  withServiceConfig(() => {
    try {
      assertServiceRoleAuthorization('Bearer anon-token');
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        return;
      }

      throw error;
    }

    throw new Error('Expected service-role guard to reject anon token.');
  });
});
