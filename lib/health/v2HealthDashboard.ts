import { defaultTenantSlug } from '@/lib/marketplace/hospitalProducts';
import { supabase, supabaseConfigStatus } from '@/lib/supabase';
import type { CustomerRow, LabReportRow, LabResultRow, UserFactRow, WearableMetricRow } from '@/lib/types/api';

export type LabReportWithResults = LabReportRow & {
  lab_results?: LabResultRow[] | null;
};

export type HealthDashboardData = {
  customer: CustomerRow | null;
  facts: UserFactRow[];
  labReports: LabReportWithResults[];
  wearableMetrics: WearableMetricRow[];
};

const emptyData: HealthDashboardData = {
  customer: null,
  facts: [],
  labReports: [],
  wearableMetrics: [],
};

export async function loadHealthDashboardData(): Promise<HealthDashboardData> {
  if (!supabaseConfigStatus.isConfigured) {
    return emptyData;
  }

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return emptyData;
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', defaultTenantSlug)
    .maybeSingle();

  if (!tenant) {
    return emptyData;
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('id,tenant_id,auth_user_id,line_user_id,nickname,phone,referred_by,referred_at,created_at')
    .eq('tenant_id', (tenant as { id: string }).id)
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();

  if (!customer) {
    return emptyData;
  }

  const typedCustomer = customer as CustomerRow;
  const [labResponse, wearableResponse, factsResponse] = await Promise.all([
    supabase
      .from('lab_reports')
      .select(
        'id,tenant_id,customer_id,storage_path,status,ai_summary_th,collected_date,created_at,lab_results(id,report_id,test_code,test_name_raw,value,unit,ref_low,ref_high,confidence,confirmed)',
      )
      .eq('customer_id', typedCustomer.id)
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('wearable_metrics')
      .select('id,tenant_id,customer_id,source,metric,day,value')
      .eq('customer_id', typedCustomer.id)
      .order('day', { ascending: false })
      .limit(120),
    supabase
      .from('user_facts')
      .select('id,tenant_id,customer_id,key,value_text,value_num,confidence,status,source,source_ref,superseded_by,created_at')
      .eq('customer_id', typedCustomer.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(80),
  ]);

  return {
    customer: typedCustomer,
    facts: (factsResponse.data ?? []) as unknown as UserFactRow[],
    labReports: (labResponse.data ?? []) as unknown as LabReportWithResults[],
    wearableMetrics: (wearableResponse.data ?? []) as unknown as WearableMetricRow[],
  };
}
