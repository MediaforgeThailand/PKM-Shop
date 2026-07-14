import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { hasRole, useAuth } from './lib/auth';
import type { PkmRole } from './lib/types';
import { Shell } from './components/Shell';
import { Login } from './pages/Login';
import { AdminOrders } from './pages/admin/AdminOrders';
import { SlipQueue } from './pages/admin/SlipQueue';
import { AdminChat } from './pages/admin/AdminChat';
import { Analytics } from './pages/admin/Analytics';
import { Catalog } from './pages/admin/Catalog';
import { Settings } from './pages/admin/Settings';
import { Payroll } from './pages/admin/Payroll';
import { Staff } from './pages/admin/Staff';
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

function Guard({ need, children }: { need: PkmRole[]; children: ReactElement }) {
  const { roles } = useAuth();
  return hasRole(roles, ...need) ? children : <Navigate to={homeFor(roles)} replace />;
}

// Logged in but no staff profile bound yet (and not the bootstrap owner) — awaiting admin.
function PendingAccess() {
  const { profile, signOut } = useAuth();
  const { link_code } = profile ?? {};
  return (
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <div className="card max-w-sm space-y-3">
        <div className="text-3xl">🕓</div>
        <h1 className="text-lg font-bold">รอผู้ดูแลเพิ่มสิทธิ์</h1>
        <p className="text-sm text-slate-500">บัญชีนี้ยังไม่ได้ถูกกำหนดหน้าที่ในระบบ กรุณาให้แอดมินเพิ่มคุณเข้าทีมก่อน</p>
        {link_code && <p className="text-xs text-slate-400">รหัสของคุณ: <b className="font-mono">{link_code}</b></p>}
        <button className="btn-ghost w-full" onClick={() => void signOut()}>ออกจากระบบ</button>
      </div>
    </div>
  );
}

export function App() {
  const { session, profile, roles, loading } = useAuth();

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
  if (!profile || roles.length === 0) {
    return <PendingAccess />;
  }

  return (
    <Shell>
      <Routes>
        <Route path="/admin/orders" element={<Guard need={['admin']}><AdminOrders /></Guard>} />
        <Route path="/admin/slips" element={<Guard need={['admin']}><SlipQueue /></Guard>} />
        <Route path="/admin/chats" element={<Guard need={['admin']}><AdminChat /></Guard>} />
        <Route path="/admin/analytics" element={<Guard need={['admin']}><Analytics /></Guard>} />
        <Route path="/admin/settings" element={<Guard need={['admin']}><Settings /></Guard>} />
        <Route path="/admin/payroll" element={<Guard need={['admin']}><Payroll /></Guard>} />
        <Route path="/admin/staff" element={<Guard need={['admin']}><Staff /></Guard>} />
        <Route path="/catalog" element={<Guard need={['admin', 'stock']}><Catalog /></Guard>} />
        <Route path="/packer" element={<Guard need={['admin', 'packer']}><PackerQueue /></Guard>} />
        <Route path="/rider" element={<Guard need={['admin', 'rider']}><RiderRounds /></Guard>} />
        <Route path="/staff" element={<StaffHome />} />
        <Route path="*" element={<Navigate to={homeFor(roles)} replace />} />
      </Routes>
    </Shell>
  );
}
