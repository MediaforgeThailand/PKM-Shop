import type { HealthMetric, HealthPackage, PurchaseOrder, ReferralPartner, UserProfile } from '@/domain/health';

export type AuthIdentity = {
  provider: 'phone_otp' | 'line';
  providerUserId: string;
  phone?: string;
  lineId?: string;
};

export type AgentMemoryRecord = {
  confidence: number;
  id: string;
  memoryType: 'budget' | 'communication_preference' | 'goal' | 'lifestyle_preference' | 'location_preference' | 'other' | 'product_interest';
  observedAt: string;
  source: 'chat' | 'intake' | 'hospital_result' | 'partner_booking' | 'manual_note';
  sourceMessageId?: string;
  status: 'active' | 'deleted' | 'expired';
  summary: string;
  userId: string;
  validUntil?: string;
  value?: string;
};

export type AgentMemoryInput = {
  confidence: number;
  memoryType: AgentMemoryRecord['memoryType'];
  source: AgentMemoryRecord['source'];
  sourceMessageId?: string;
  summary: string;
  validUntil?: string;
  value?: string;
};

export type LegacyAgentMemoryRecord = {
  id: string;
  userId: string;
  source: 'chat' | 'intake' | 'hospital_result' | 'partner_booking' | 'manual_note';
  summary: string;
  observedAt: string;
  validUntil?: string;
  confidence: number;
};

export type BackendPort = {
  login(identity: AuthIdentity): Promise<UserProfile>;
  listPackages(userId: string): Promise<HealthPackage[]>;
  recommendPackages(userId: string): Promise<HealthPackage[]>;
  createOrder(packageId: string, referralCode?: string): Promise<PurchaseOrder>;
  createAgentMemory(input: AgentMemoryInput): Promise<AgentMemoryRecord>;
  deleteAgentMemory(memoryId: string): Promise<void>;
  lookupOrderForHospital(query: { phone?: string; nationalId?: string; orderId?: string }): Promise<PurchaseOrder | null>;
  listHealthMetrics(userId: string): Promise<HealthMetric[]>;
  listAgentMemory(userId: string): Promise<AgentMemoryRecord[]>;
  listReferralPartners(): Promise<ReferralPartner[]>;
};
