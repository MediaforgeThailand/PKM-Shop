import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

// Shared UX primitives so no screen ever falls back to prompt()/alert()/confirm().
// Mobile-first: toasts sit above the bottom tab bar; modals are bottom sheets on phones.

type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; kind: ToastKind };
type ConfirmOpts = { title: string; message?: string; confirmText?: string; cancelText?: string; danger?: boolean };
type ConfirmState = ConfirmOpts & { resolve: (ok: boolean) => void };

type UICtx = {
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
};

const Ctx = createContext<UICtx | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const seq = useRef(0);

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = (seq.current += 1);
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const confirm = useCallback((opts: ConfirmOpts) => {
    return new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve }));
  }, []);

  const closeConfirm = (ok: boolean) => {
    confirmState?.resolve(ok);
    setConfirmState(null);
  };

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <Ctx.Provider value={value}>
      {children}

      {/* Toaster */}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto w-full max-w-sm rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 ${
              t.kind === 'success' ? 'bg-green-600 text-white ring-green-700'
                : t.kind === 'error' ? 'bg-red-600 text-white ring-red-700'
                : 'bg-slate-800 text-white ring-slate-900'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmState && (
        <Modal open title={confirmState.title} onClose={() => closeConfirm(false)}>
          {confirmState.message && <p className="text-sm text-slate-600">{confirmState.message}</p>}
          <div className="mt-4 flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => closeConfirm(false)}>
              {confirmState.cancelText ?? 'ยกเลิก'}
            </button>
            <button
              className={`flex-1 btn ${confirmState.danger ? 'bg-red-600 text-white hover:bg-red-700' : 'btn-primary'}`}
              onClick={() => closeConfirm(true)}
            >
              {confirmState.confirmText ?? 'ยืนยัน'}
            </button>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  );
}

export function useUI(): UICtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useUI outside UIProvider');
  return ctx;
}

// ── Presentational primitives ──────────────────────────────────────────────

export function Modal({ open, title, onClose, children }: { open: boolean; title?: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl safe-bottom sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold">{title}</h2>
            <button className="text-slate-400 hover:text-slate-600" onClick={onClose} aria-label="ปิด">✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Spinner({ label = 'กำลังโหลด…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ icon = '📭', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="py-12 text-center">
      <div className="text-4xl">{icon}</div>
      <div className="mt-2 text-sm font-medium text-slate-600">{title}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

// Distinct from EmptyState: a fetch actually FAILED (network/expired session), so the user must
// not mistake it for "no data". Offers a retry.
export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="py-10 text-center">
      <div className="text-4xl">⚠️</div>
      <div className="mt-2 text-sm font-medium text-slate-700">โหลดข้อมูลไม่สำเร็จ</div>
      <div className="mt-1 text-xs text-slate-400">อาจเป็นเน็ตหลุดหรือเซสชันหมดอายุ — ข้อมูลยังอยู่ในระบบ</div>
      {onRetry && <button className="btn-ghost btn-sm mt-3" onClick={onRetry}>ลองใหม่</button>}
    </div>
  );
}

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h1 className="text-lg font-bold">{title}</h1>
      {action}
    </div>
  );
}
