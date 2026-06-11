import { spawnSync } from 'node:child_process';

const strict = process.argv.includes('--strict');
const tenantSlug = env('MIRA_DEMO_TENANT_SLUG') ?? env('MIRA_DEFAULT_TENANT_SLUG') ?? 'demo-hospital';
const normalizedTenantSlug = tenantSlug.replaceAll('-', '_');

const checks = [
  {
    detail: 'Needed before running scripts/seed-demo.mjs against a live Supabase project.',
    name: 'seed-demo service role setup',
    required: [
      ['SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL'],
      ['SUPABASE_SERVICE_ROLE_KEY'],
    ],
  },
  {
    detail: 'Needed before running npm run chat:regression; scripts/create-test-jwt.mjs provisions the regression auth user inline.',
    name: 'seeded chat regression setup',
    required: [
      ['SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL'],
      ['SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
      ['SUPABASE_SERVICE_ROLE_KEY'],
    ],
  },
  {
    detail: 'Needed before running npm run v2:rls-check against the linked Supabase project.',
    name: 'live RLS project setup',
    required: [
      ['SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL'],
      ['SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
      ['SUPABASE_SERVICE_ROLE_KEY'],
    ],
  },
  {
    detail:
      'Needed before running npm run v2:e2e-commerce; run scripts/seed-demo.mjs first and ensure the demo tenant has promptpay_id.',
    name: 'live commerce E2E setup',
    required: [
      ['SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL'],
      ['SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
      ['SUPABASE_SERVICE_ROLE_KEY'],
      ['MIRA_DEMO_PROMPTPAY_ID'],
    ],
  },
  {
    detail: `Needed before LINE sandbox regression for tenant "${tenantSlug}".`,
    name: 'LINE sandbox setup',
    required: [
      [
        `LINE_CHANNEL_SECRET__${tenantSlug}`,
        `LINE_CHANNEL_SECRET__${normalizedTenantSlug}`,
      ],
      [
        `LINE_CHANNEL_TOKEN__${tenantSlug}`,
        `LINE_CHANNEL_TOKEN__${normalizedTenantSlug}`,
        `LINE_CHANNEL_ACCESS_TOKEN__${tenantSlug}`,
        `LINE_CHANNEL_ACCESS_TOKEN__${normalizedTenantSlug}`,
      ],
    ],
  },
  {
    detail: 'Needed before testing Stripe Checkout and webhook payment confirmation.',
    name: 'Stripe checkout setup',
    required: [
      ['STRIPE_SECRET_KEY'],
      ['STRIPE_WEBHOOK_SECRET'],
      ['MIRA_PUBLIC_APP_URL', 'APP_BASE_URL', 'SITE_URL'],
    ],
  },
];

let missingCount = 0;

for (const check of checks) {
  const missingEnvGroups = check.required.filter((names) => !hasAnyEnv(names));
  const missingTools = (check.tools ?? []).filter((tool) => !hasTool(tool));
  const ok = missingEnvGroups.length === 0 && missingTools.length === 0;

  console.log(`${ok ? 'PASS' : 'WAIT'} ${check.name}`);
  console.log(`  ${check.detail}`);

  if (!ok) {
    missingCount += 1;

    for (const names of missingEnvGroups) {
      console.log(`  missing env: ${names.join(' or ')}`);
    }

    for (const tool of missingTools) {
      console.log(`  missing tool: ${tool}`);
    }
  }
}

if (missingCount > 0) {
  console.log(`External preflight: ${missingCount} gate(s) not ready.`);

  if (strict) {
    process.exit(1);
  }
} else {
  console.log('External preflight: all external gates have local prerequisites.');
}

function env(name) {
  return process.env[name]?.trim() || null;
}

function hasAnyEnv(names) {
  return names.some((name) => Boolean(env(name)));
}

function hasTool(name) {
  const command = process.platform === 'win32' ? 'where' : 'command';
  const args = process.platform === 'win32' ? [name] : ['-v', name];
  const result = spawnSync(command, args, {
    shell: process.platform !== 'win32',
    stdio: 'ignore',
  });

  return result.status === 0;
}
