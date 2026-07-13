import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import type { PkmRole } from './lib/types';
import { Shell } from './components/Shell';
import { Login } from './pages/Login';
import { AdminOrders } from './pages/admin/AdminOrders';
import { SlipQueue } from './pages/admin/SlipQueue';
import { Catalog } from './pages/admin/Catalog';
import { Settings } from './pages/admin/Settings';
import { Payroll } from './pages/admin/Payroll';
import { PackerQueue } from './pages/PackerQueue';
import { RiderRounds } from './pages/RiderRounds';
import { StaffHome } from './pages/StaffHome';

function homeFor(roles: PkmRole[]): string {
  if (roles.includes('admin')) return '/admin/orders';
  if (roles.includes('stock')) return '/catalog';
  if (roles.includes('packer')) return '/packer';
  if (roles.includes('rider')) return '/rider';
  return '/staff';
}

export function App() {
  const { session, roles, loading } = useAuth();

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-slate-500">กำลังโหลด…</div>;
  }
  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Shell>
      <Routes>
        <Route path="/admin/orders" element={<AdminOrders />} />
        <Route path="/admin/slips" element={<SlipQueue />} />
        <Route path="/admin/settings" element={<Settings />} />
        <Route path="/admin/payroll" element={<Payroll />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/packer" element={<PackerQueue />} />
        <Route path="/rider" element={<RiderRounds />} />
        <Route path="/staff" element={<StaffHome />} />
        <Route path="*" element={<Navigate to={homeFor(roles)} replace />} />
      </Routes>
    </Shell>
  );
}
