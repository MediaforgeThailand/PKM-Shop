import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const REGRESSION_TEST_EMAIL = 'regression-test@miracare.dev';

export async function createRegressionTestJwt(env = process.env) {
  const supabaseUrl = env.SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.SUPABASE_ANON_KEY ?? env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    throw new Error(
      'Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY before creating the regression JWT.',
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const auth = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const password = randomBytes(36).toString('base64url');
  const user = await upsertRegressionUser(admin, password);
  const { data, error } = await auth.auth.signInWithPassword({
    email: REGRESSION_TEST_EMAIL,
    password,
  });

  if (error || !data.session?.access_token) {
    throw new Error(error?.message ?? `Unable to sign in regression test user ${user.id}.`);
  }

  return data.session.access_token;
}

async function upsertRegressionUser(admin, password) {
  const existing = await findAuthUserByEmail(admin, REGRESSION_TEST_EMAIL);

  if (existing) {
    return updateRegressionUser(admin, existing.id, password);
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: REGRESSION_TEST_EMAIL,
    email_confirm: true,
    password,
    user_metadata: {
      purpose: 'miracare-v2-regression',
    },
  });

  if (!error && data.user) {
    return data.user;
  }

  if (error && /already|registered|exists/i.test(error.message)) {
    const raceWinner = await findAuthUserByEmail(admin, REGRESSION_TEST_EMAIL);

    if (raceWinner) {
      return updateRegressionUser(admin, raceWinner.id, password);
    }
  }

  throw new Error(error?.message ?? 'Unable to create regression test user.');
}

async function updateRegressionUser(admin, userId, password) {
  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    email_confirm: true,
    password,
    user_metadata: {
      purpose: 'miracare-v2-regression',
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? 'Unable to update regression test user.');
  }

  return data.user;
}

async function findAuthUserByEmail(admin, email) {
  const perPage = 1000;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(error.message);
    }

    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());

    if (match) {
      return match;
    }

    if (data.users.length < perPage || !data.nextPage) {
      return null;
    }
  }

  throw new Error('Unable to find regression test user after scanning auth user pages.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = await createRegressionTestJwt();
  process.stdout.write(`${token}\n`);
}
