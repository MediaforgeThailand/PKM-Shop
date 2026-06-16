import { AdminShell } from '@/components/admin/AdminShell';
import { OrdersQueue } from '@/components/admin/OrdersQueue';

export default function ShowcaseAdminOrdersScreen() {
  return (
    <AdminShell>
      <OrdersQueue title="คิวคำสั่งซื้อ" />
    </AdminShell>
  );
}
