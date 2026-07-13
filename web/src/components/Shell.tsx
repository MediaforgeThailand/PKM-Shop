import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { hasRole, useAuth } from '../lib/auth';
import type { PkmRole } from '../lib/types';

type NavItem = { to: string; label: string; icon: string; roles: PkmRole[] };

const NAV: NavItem[] = [
  { to: '/admin/orders', label: 'ออเดอร์', icon: '🧾', roles: ['admin'] },
  { to: '/admin/slips', label: 'ตรวจสลิป', icon: '💳', roles: ['admin'] },
  { to: '/catalog', label: 'สินค้า', icon: '📦', roles: ['admin', 'stock'] },
  { to: '/packer', label: 'แพ็ค', icon: '🎁', roles: ['admin', 'packer'] },
  { to: '/rider', label: 'ไรเดอร์', icon: '🛵', roles: ['admin', 'rider'] },
  { to: '/admin/payroll', label: 'เงินเดือน', icon: '💰', roles: ['admin'] },
  { to: '/admin/settings', label: 'ตั้งค่า', icon: '⚙️', roles: ['admin'] },
  { to: '/staff', label: 'เช็คอิน', icon: '👤', roles: ['admin', 'stock', 'packer', 'rider', 'staff'] },
];

export function Shell({ children }: { children: ReactNode }) {
  const { roles, profile, signOut } = useAuth();
  const items = NAV.filter((n) => hasRole(roles, ...n.roles));
  const unlinked = profile && !profile.line_user_id;

  return (
    <div className="min-h-screen">
      <header className="safe-top sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-brand">PKM Shop</span>
          <span className="hidden text-xs text-slate-400 sm:inline">หลังบ้าน</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="max-w-[8rem] truncate text-slate-500">{profile?.name || 'พนักงาน'}</span>
          <button className="btn-ghost btn-sm" onClick={() => void signOut()}>ออก</button>
        </div>
      </header>

      {unlinked && (
        <div className="bg-amber-50 px-4 py-2 text-sm text-amber-800">
          ⚠️ ยังไม่ได้ผูก LINE — เพิ่ม PKM Shop OA เป็นเพื่อน แล้วพิมพ์รหัส{' '}
          <b className="font-mono">{profile?.link_code}</b> เพื่อรับแจ้งเตือนงาน
        </div>
      )}

      {/* Desktop / tablet: top nav */}
      <nav className="hidden gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 sm:flex">
        {items.map((n) => (
          <NavLink key={n.to} to={n.to}
            className={({ isActive }) => `whitespace-nowrap px-3 py-2 text-sm font-medium ${isActive ? 'border-b-2 border-brand text-brand' : 'text-slate-500 hover:text-slate-800'}`}>
            {n.icon} {n.label}
          </NavLink>
        ))}
      </nav>

      <main className="mx-auto max-w-5xl p-4 pb-28 sm:pb-6">{children}</main>

      {/* Mobile: fixed bottom tab bar (thumb reach, big targets) */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t border-slate-200 bg-white sm:hidden">
        {items.map((n) => (
          <NavLink key={n.to} to={n.to}
            className={({ isActive }) => `flex min-h-[56px] min-w-[4.25rem] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium ${isActive ? 'text-brand' : 'text-slate-500'}`}>
            <span className="text-xl leading-none">{n.icon}</span>
            <span className="whitespace-nowrap">{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
