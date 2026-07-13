import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { hasRole, useAuth } from '../lib/auth';
import type { PkmRole } from '../lib/types';

type NavItem = { to: string; label: string; roles: PkmRole[] };

const NAV: NavItem[] = [
  { to: '/admin/orders', label: 'ออเดอร์', roles: ['admin'] },
  { to: '/admin/slips', label: 'ตรวจสลิป', roles: ['admin'] },
  { to: '/catalog', label: 'สินค้า/สต็อก', roles: ['admin', 'stock'] },
  { to: '/packer', label: 'แพ็คของ', roles: ['admin', 'packer'] },
  { to: '/rider', label: 'ไรเดอร์', roles: ['admin', 'rider'] },
  { to: '/admin/payroll', label: 'เงินเดือน', roles: ['admin'] },
  { to: '/admin/settings', label: 'ตั้งค่า', roles: ['admin'] },
  { to: '/staff', label: 'เช็คอิน/แชท', roles: ['admin', 'stock', 'packer', 'rider', 'staff'] },
];

export function Shell({ children }: { children: ReactNode }) {
  const { roles, profile, signOut } = useAuth();
  const items = NAV.filter((n) => hasRole(roles, ...n.roles));
  const unlinked = profile && !profile.line_user_id;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-brand">PKM Shop</span>
          <span className="text-xs text-slate-400">หลังบ้าน</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500">{profile?.name || 'พนักงาน'}</span>
          <button className="btn-ghost py-1" onClick={() => void signOut()}>ออกจากระบบ</button>
        </div>
      </header>

      {unlinked && (
        <div className="bg-amber-50 px-4 py-2 text-sm text-amber-800">
          ⚠️ ยังไม่ได้ผูก LINE — เพิ่ม PKM Shop OA เป็นเพื่อน แล้วพิมพ์รหัส{' '}
          <b className="font-mono">{profile?.link_code}</b> เพื่อรับแจ้งเตือนงาน
        </div>
      )}

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2">
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              `whitespace-nowrap px-3 py-2 text-sm font-medium ${isActive ? 'border-b-2 border-brand text-brand' : 'text-slate-500 hover:text-slate-800'}`
            }
          >
            {n.label}
          </NavLink>
        ))}
      </nav>

      <main className="mx-auto max-w-5xl p-4">{children}</main>
    </div>
  );
}
