import { invokeFunction } from '@/lib/api/client';
import type { LabConfirmRequest, LabConfirmResponse } from '@/lib/types/api';

export async function confirmLabResults(payload: LabConfirmRequest): Promise<LabConfirmResponse> {
  return invokeFunction<LabConfirmRequest, LabConfirmResponse>('lab-confirm', payload);
}
