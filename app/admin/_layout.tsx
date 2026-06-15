import { Slot } from 'expo-router';

import { AdminShell } from '@/components/admin/AdminShell';

export default function AdminLayout() {
  return (
    <AdminShell>
      <Slot />
    </AdminShell>
  );
}
