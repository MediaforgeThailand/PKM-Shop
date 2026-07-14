import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

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

export function baht(n: number): string {
  return `฿${n.toLocaleString('th-TH')}`;
}

// Segmented tab bar (mobile-friendly, large targets).
export function Tabs<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; badge?: number }[];
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex min-h-[40px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${
            value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
          }`}
        >
          {o.label}
          {typeof o.badge === 'number' && o.badge > 0 && (
            <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{o.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// Quantity stepper: big +/- targets plus a typeable field (no bare browser number input).
export function Stepper({ value, onChange, min = 1, max = 999999, quick }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  quick?: number[];
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? Math.trunc(n) : min));
  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-2">
        <button type="button" className="min-h-[48px] w-14 rounded-xl bg-slate-100 text-2xl font-bold text-slate-600 active:bg-slate-200" onClick={() => onChange(clamp(value - 1))} aria-label="ลด">−</button>
        <input
          className="input min-h-[48px] flex-1 text-center text-xl font-bold"
          inputMode="numeric"
          value={String(value)}
          onChange={(e) => {
            const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
            onChange(Number.isFinite(n) ? clamp(n) : min);
          }}
        />
        <button type="button" className="min-h-[48px] w-14 rounded-xl bg-brand text-2xl font-bold text-white active:opacity-80" onClick={() => onChange(clamp(value + 1))} aria-label="เพิ่ม">+</button>
      </div>
      {quick && quick.length > 0 && (
        <div className="flex gap-2">
          {quick.map((q) => (
            <button key={q} type="button" className="btn-ghost btn-sm flex-1" onClick={() => onChange(clamp(value + q))}>+{q}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Photo capture with inline preview + retake (mobile camera first).
export function PhotoPicker({ file, onPick, label = 'ถ่ายรูป', required = false }: {
  file: File | null;
  onPick: (f: File | null) => void;
  label?: string;
  required?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div>
      {preview ? (
        <div className="relative overflow-hidden rounded-xl">
          <img src={preview} alt="ตัวอย่างรูป" className="max-h-56 w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-black/50 to-transparent p-2">
            <label className="btn-ghost btn-sm cursor-pointer bg-white/90">
              ถ่ายใหม่
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        </div>
      ) : (
        <label className="flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 py-4 text-slate-500 active:bg-slate-100">
          <span className="text-3xl">📷</span>
          <span className="text-sm font-medium">{label}{required ? ' (บังคับ)' : ''}</span>
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
        </label>
      )}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'default' }: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'brand' | 'warn';
}) {
  return (
    <div className={`card ${tone === 'brand' ? 'border-brand/30 bg-brand/5' : tone === 'warn' ? 'border-amber-300 bg-amber-50' : ''}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${tone === 'brand' ? 'text-brand' : ''}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
