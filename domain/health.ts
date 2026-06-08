export type Money = {
  amount: number;
  currency: 'THB';
};

export type HealthPackage = {
  id: string;
  title: string;
  hospital: string;
  category: string;
  price: Money;
  gpRate: number;
  referralRate: number;
  duration: string;
  location: string;
  tags: string[];
  includes: string[];
  bestFor: string;
  aiReason: string;
};

export type PackageCategory = {
  id: string;
  code: 'A' | 'B' | 'C' | 'D';
  title: string;
  description: string;
  packageId: string;
  popularity: string;
};

export type HospitalBranch = {
  id: string;
  name: string;
  hospital: string;
  address: string;
  district: string;
  distanceKm: number;
  nextSlot: string;
  supportedPackageIds: string[];
};

export type UserProfile = {
  id: string;
  name: string;
  phone: string;
  lineId: string;
  ageRange: string;
  goals: string[];
  latestHealthDataAt: string;
  agentStatus: string;
};

export type PurchaseOrder = {
  id: string;
  userName: string;
  userPhone: string;
  nationalIdLast4: string;
  packageTitle: string;
  hospital: string;
  paidAt: string;
  amount: Money;
  commission: Money;
  referralCode?: string;
  bookingStatus: 'awaiting_call' | 'scheduled' | 'completed';
};

export type HealthMetric = {
  label: string;
  value: string;
  status: 'good' | 'watch' | 'risk';
  updatedAt: string;
  explanation: string;
};

export type ReferralPartner = {
  id: string;
  name: string;
  type: 'doctor' | 'nurse' | 'creator' | 'clinic';
  code: string;
  attributedSales: number;
  pendingPayout: Money;
  conversionRate: string;
};
