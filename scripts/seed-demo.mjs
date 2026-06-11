import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Set SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY before running seed-demo.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const tenantSlug = process.env.MIRA_DEMO_TENANT_SLUG ?? 'demo-hospital';
const demoLineUserId = process.env.MIRA_DEMO_LINE_USER_ID?.trim() || 'demo-line-user';

function optionalEnv(name) {
  return process.env[name]?.trim() || null;
}

function assertUuidEnv(name, value) {
  if (value && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${name} must be an existing auth.users UUID.`);
  }
}

const products = [
  {
    catalog_key: 'chk-basic',
    name: 'Basic Health Checkup',
    description: 'CBC, fasting glucose, lipid profile, liver and kidney screening for a first annual checkup.',
    price_baht: 1590,
    category: 'checkup',
  },
  {
    catalog_key: 'chk-basic-plus',
    name: 'Basic Plus Checkup',
    description: 'Annual checkup with CBC, fasting glucose, HbA1c, lipid profile, liver, kidney, and doctor summary.',
    price_baht: 2990,
    category: 'checkup',
  },
  {
    catalog_key: 'chk-executive',
    name: 'Executive Checkup',
    description: 'Expanded health screening for busy adults, including metabolic, heart, liver, kidney, and consultation review.',
    price_baht: 6900,
    category: 'checkup',
  },
  {
    catalog_key: 'chk-diabetes',
    name: 'Diabetes Risk Package',
    description: 'Fasting glucose, HbA1c, lipid profile, kidney markers, and lifestyle review for blood sugar concerns.',
    price_baht: 2490,
    category: 'checkup',
  },
  {
    catalog_key: 'chk-heart',
    name: 'Heart Risk Screening',
    description: 'Lipid profile, ECG, blood pressure review, and doctor consultation for cardiovascular risk screening.',
    price_baht: 3900,
    category: 'checkup',
  },
  {
    catalog_key: 'vac-flu',
    name: 'Influenza Vaccine',
    description: 'Seasonal influenza vaccine with brief doctor screening and post-vaccination observation.',
    price_baht: 990,
    category: 'vaccine',
  },
  {
    catalog_key: 'vac-hpv',
    name: 'HPV Vaccine',
    description: 'HPV vaccination package with eligibility review and appointment-based administration.',
    price_baht: 5200,
    category: 'vaccine',
  },
];

async function upsertTenant() {
  const { data, error } = await supabase
    .from('tenants')
    .upsert(
      {
        display_name: 'Demo Hospital',
        features: {
          dashboard: true,
          line: false,
        },
        promptpay_id: process.env.MIRA_DEMO_PROMPTPAY_ID ?? null,
        slug: tenantSlug,
      },
      {
        onConflict: 'slug',
      },
    )
    .select('id,slug,display_name')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to seed demo tenant.');
  }

  return data;
}

async function upsertProducts(tenantId) {
  const rows = products.map((product) => ({
    ...product,
    active: true,
    branch_info: 'Demo Hospital main branch',
    image_url: null,
    requires_appointment: true,
    tenant_id: tenantId,
  }));
  const { error } = await supabase.from('products').upsert(rows, {
    onConflict: 'tenant_id,catalog_key',
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function upsertCustomer(tenantId) {
  const authUserId = optionalEnv('DEMO_CUSTOMER_AUTH_USER_ID');
  assertUuidEnv('DEMO_CUSTOMER_AUTH_USER_ID', authUserId);

  const row = {
    auth_user_id: authUserId,
    line_user_id: demoLineUserId,
    nickname: 'Boss',
    phone: '0812345678',
    tenant_id: tenantId,
  };

  if (!authUserId) {
    const { data, error } = await supabase
      .from('customers')
      .upsert(
        {
          line_user_id: row.line_user_id,
          nickname: row.nickname,
          phone: row.phone,
          tenant_id: row.tenant_id,
        },
        {
          onConflict: 'tenant_id,line_user_id',
        },
      )
      .select('id,tenant_id,auth_user_id,line_user_id,nickname,phone')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Unable to seed demo customer.');
    }

    return data;
  }

  const { data: authCustomer, error: authLookupError } = await supabase
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (authLookupError) {
    throw new Error(authLookupError.message);
  }

  if (authCustomer?.id) {
    const { data, error } = await supabase
      .from('customers')
      .update({
        line_user_id: row.line_user_id,
        nickname: row.nickname,
        phone: row.phone,
      })
      .eq('id', authCustomer.id)
      .select('id,tenant_id,auth_user_id,line_user_id,nickname,phone')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Unable to update demo customer.');
    }

    return data;
  }

  const { data: lineCustomer, error: lineLookupError } = await supabase
    .from('customers')
    .select('id,auth_user_id')
    .eq('tenant_id', tenantId)
    .eq('line_user_id', demoLineUserId)
    .maybeSingle();

  if (lineLookupError) {
    throw new Error(lineLookupError.message);
  }

  if (lineCustomer?.id) {
    if (lineCustomer.auth_user_id && lineCustomer.auth_user_id !== authUserId) {
      throw new Error(
        `Demo customer line_user_id ${demoLineUserId} is already attached to a different auth user. ` +
          'Use a different MIRA_DEMO_LINE_USER_ID or resolve the existing customer row first.',
      );
    }

    const { data, error } = await supabase
      .from('customers')
      .update({
        auth_user_id: row.auth_user_id,
        nickname: row.nickname,
        phone: row.phone,
      })
      .eq('id', lineCustomer.id)
      .select('id,tenant_id,auth_user_id,line_user_id,nickname,phone')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Unable to attach auth user to demo customer.');
    }

    return data;
  }

  const { data, error } = await supabase
    .from('customers')
    .insert(row)
    .select('id,tenant_id,auth_user_id,line_user_id,nickname,phone')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to seed demo customer with auth user.');
  }

  return data;
}

async function upsertTenantMember(tenantId) {
  const authUserId = optionalEnv('DEMO_ADMIN_AUTH_USER_ID');
  assertUuidEnv('DEMO_ADMIN_AUTH_USER_ID', authUserId);

  if (!authUserId) {
    console.log('Skipped tenant_members seed. Set DEMO_ADMIN_AUTH_USER_ID to attach an existing auth user as tenant_admin.');
    return;
  }

  const { error } = await supabase.from('tenant_members').upsert(
    {
      auth_user_id: authUserId,
      role: 'tenant_admin',
      tenant_id: tenantId,
    },
    {
      onConflict: 'tenant_id,auth_user_id',
    },
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function maybeSeedReferrer(tenantId) {
  const authUserId = optionalEnv('DEMO_REFERRER_AUTH_USER_ID');
  assertUuidEnv('DEMO_REFERRER_AUTH_USER_ID', authUserId);

  const { error } = await supabase.from('referrers').upsert(
    {
      active: true,
      auth_user_id: authUserId,
      commission_scheme: {
        default: 10,
        mode: 'percent',
      },
      name: 'Demo Referrer',
      phone: '0899999999',
      ref_code: 'DEMO01',
      tenant_id: tenantId,
      type: 'staff',
    },
    {
      onConflict: 'ref_code',
    },
  );

  if (error?.code === '42P01' || error?.message.toLowerCase().includes('referrers')) {
    console.log('Skipped referrer seed because Phase 4 tables are not present yet.');
    return;
  }

  if (error) {
    throw new Error(error.message);
  }
}

const tenant = await upsertTenant();
await upsertProducts(tenant.id);
const customer = await upsertCustomer(tenant.id);
await upsertTenantMember(tenant.id);
await maybeSeedReferrer(tenant.id);

console.log(`Seeded ${products.length} products for ${tenant.display_name} (${tenant.slug}).`);
console.log(`Seeded demo customer ${customer.id}${customer.auth_user_id ? ` for auth user ${customer.auth_user_id}` : ' without auth user linkage'}.`);
