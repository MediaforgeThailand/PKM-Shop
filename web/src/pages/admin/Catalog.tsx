import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { catalogAction, fileToImagePayload, invokeFn, signedUrl, uploadToBucket } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  EmptyState, ErrorState, Field, Modal, PageHeader, PhotoPicker, Spinner, Stepper, useUI,
} from '../../lib/ui';
import type { Category, Product } from '../../lib/types';

function uid() {
  return crypto.randomUUID();
}

// ── Page-local types ────────────────────────────────────────────────────────

type StockMode = 'in' | 'out';

type StockMovementRow = {
  id: string;
  qty: number;
  reason: string | null;
  photo_url: string | null;
  created_at: string;
};

type MovementView = StockMovementRow & { photo_signed: string | null };

// Ready.md §3.5: ตัดสต็อก (qty ลบ) ต้องมีเหตุผลเสมอ — รูปไม่บังคับ
const OUT_REASONS = ['ของเสีย', 'สูญหาย', 'นับสต็อกใหม่', 'อื่นๆ'] as const;
type OutReason = (typeof OUT_REASONS)[number];

export function Catalog() {
  const qc = useQueryClient();
  const { toast } = useUI();
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [stockTarget, setStockTarget] = useState<{ product: Product; mode: StockMode } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Product | null>(null);

  const { data: products = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('id,catalog_key,name,description,price_baht,category_id,category,image_url,stock_qty,reserved_qty,active')
        .order('name');
      if (error) throw new Error(error.message);
      return (data as Product[]) ?? [];
    },
  });
  const { data: categories = [], isError: catIsError, refetch: refetchCats } = useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from('categories').select('id,name,sort,active').order('sort');
      if (error) throw new Error(error.message);
      return (data as Category[]) ?? [];
    },
  });

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="สินค้า & สต็อก"
        action={<button className="btn-primary btn-sm" onClick={() => setEditing('new')}>+ เพิ่มสินค้า</button>}
      />

      {catIsError && (
        <div className="card">
          <div className="text-sm font-semibold">หมวดสินค้า</div>
          <ErrorState onRetry={() => void refetchCats()} />
        </div>
      )}

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Spinner />
      ) : products.length === 0 ? (
        <EmptyState icon="📦" title="ยังไม่มีสินค้า" hint="กด “เพิ่มสินค้า” เพื่อเริ่มขาย" />
      ) : (
        <div className="space-y-2">
          {products.map((p) => {
            const available = p.stock_qty - p.reserved_qty;
            return (
              <div key={p.id} className="card flex items-center gap-3">
                <Thumb url={p.image_url} name={p.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{p.name}</span>
                    {!p.active && <span className="badge bg-slate-200 text-slate-500">ปิดขาย</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    ฿{p.price_baht.toLocaleString('th-TH')}
                    {p.category_id && catName.has(p.category_id) ? ` · ${catName.get(p.category_id)}` : ''}
                  </div>
                  <div className={`text-xs ${available <= 0 ? 'text-red-600' : 'text-slate-500'}`}>
                    คงเหลือ {available}{p.reserved_qty > 0 ? ` (จอง ${p.reserved_qty})` : ''}
                  </div>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-1.5">
                  <button className="btn-ghost btn-sm" onClick={() => setStockTarget({ product: p, mode: 'in' })}>รับเข้า</button>
                  <button
                    className="btn-ghost btn-sm text-red-600 disabled:opacity-40"
                    disabled={p.stock_qty <= 0}
                    onClick={() => setStockTarget({ product: p, mode: 'out' })}
                  >
                    ตัดสต็อก
                  </button>
                  <button className="btn-ghost btn-sm" onClick={() => setHistoryTarget(p)}>ประวัติ</button>
                  <button className="btn-ghost btn-sm" onClick={() => setEditing(p)}>แก้ไข</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <ProductModal
          product={editing === 'new' ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await qc.invalidateQueries({ queryKey: ['products'] });
            await qc.invalidateQueries({ queryKey: ['stock-movements'] });
            toast('บันทึกสินค้าแล้ว', 'success');
          }}
          onCategoryCreated={() => qc.invalidateQueries({ queryKey: ['categories'] })}
        />
      )}

      {stockTarget && (
        <StockMoveModal
          product={stockTarget.product}
          mode={stockTarget.mode}
          onClose={() => setStockTarget(null)}
          onDone={async () => {
            const mode = stockTarget.mode;
            setStockTarget(null);
            await qc.invalidateQueries({ queryKey: ['products'] });
            await qc.invalidateQueries({ queryKey: ['stock-movements'] });
            toast(mode === 'in' ? 'รับของเข้าสต็อกแล้ว' : 'ตัดสต็อกแล้ว', 'success');
          }}
        />
      )}

      {historyTarget && (
        <StockHistoryModal product={historyTarget} onClose={() => setHistoryTarget(null)} />
      )}
    </div>
  );
}

function Thumb({ url, name }: { url: string | null; name: string }) {
  if (!url) {
    return <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-slate-100 text-xl text-slate-300">🛍️</div>;
  }
  return <img src={url} alt={name} className="h-14 w-14 shrink-0 rounded-lg object-cover" />;
}

function ProductModal({
  product, categories, onClose, onSaved, onCategoryCreated,
}: {
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
  onCategoryCreated: () => void;
}) {
  const { toast } = useUI();
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product ? String(product.price_baht) : '');
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [active, setActive] = useState(product?.active ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(product?.image_url ?? null);
  // Ready.md §3.5: สินค้าใหม่ต้องระบุสต็อกตั้งต้น และของเข้า (qty > 0) บังคับแนบรูป
  const [initialStock, setInitialStock] = useState(0);
  const [stockFile, setStockFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  function pickFile(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : product?.image_url ?? null);
  }

  async function createCategory() {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    try {
      const res = await catalogAction<{ category: Category }>({ action: 'create_category', name: trimmed });
      onCategoryCreated();
      setCategoryId(res.category.id);
      setNewCat(false);
      setNewCatName('');
      toast('สร้างหมวดแล้ว', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'สร้างหมวดไม่สำเร็จ', 'error');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const priceNum = Number(price);
    if (!name.trim() || !Number.isFinite(priceNum) || priceNum < 0) {
      toast('กรอกชื่อและราคาให้ถูกต้อง', 'error');
      return;
    }
    if (!product && initialStock > 0 && !stockFile) {
      toast('สต็อกตั้งต้นมากกว่า 0 ต้องถ่ายรูปของที่รับเข้า', 'error');
      return;
    }
    setBusy(true);
    try {
      const image = file ? await fileToImagePayload(file) : undefined;
      if (product) {
        await catalogAction({
          action: 'update_product', product_id: product.id,
          name: name.trim(), price_baht: priceNum, category_id: categoryId || null,
          description: description.trim(), active, ...(image ? { image } : {}),
        });
      } else {
        const stockPhoto = initialStock > 0 && stockFile ? await fileToImagePayload(stockFile) : undefined;
        await catalogAction({
          action: 'create_product',
          name: name.trim(), price_baht: priceNum, category_id: categoryId || null,
          description: description.trim(), ...(image ? { image } : {}),
          ...(initialStock > 0 && stockPhoto ? { initial_stock: initialStock, stock_photo: stockPhoto } : {}),
        });
      }
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={product ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="cursor-pointer">
            {preview ? (
              <img src={preview} alt="" className="h-20 w-20 rounded-lg object-cover" />
            ) : (
              <div className="grid h-20 w-20 place-items-center rounded-lg border-2 border-dashed border-slate-300 text-2xl text-slate-300">📷</div>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          </label>
          <span className="text-xs text-slate-400">แตะเพื่อใส่/เปลี่ยนรูปสินค้า</span>
        </div>

        <Field label="ชื่อสินค้า">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ข้าวหอมมะลิ 5 กก." required />
        </Field>

        <Field label="ราคา (บาท)">
          <input className="input" type="number" inputMode="numeric" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" required />
        </Field>

        <Field label="หมวดสินค้า">
          {newCat ? (
            <div className="flex gap-2">
              <input className="input flex-1" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="ชื่อหมวดใหม่" autoFocus />
              <button type="button" className="btn-primary btn-sm" onClick={() => void createCategory()}>สร้าง</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setNewCat(false)}>ยกเลิก</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select className="input flex-1" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">— ไม่ระบุ —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" className="btn-ghost btn-sm whitespace-nowrap" onClick={() => setNewCat(true)}>+ หมวดใหม่</button>
            </div>
          )}
        </Field>

        <Field label="รายละเอียด (ไม่บังคับ)">
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="รายละเอียดสั้น ๆ" />
        </Field>

        {!product && (
          <>
            <Field label="สต็อกตั้งต้น" hint="จำนวนของที่มีพร้อมขายตอนเพิ่มสินค้า — ถ้ามากกว่า 0 ต้องถ่ายรูปของ">
              <Stepper value={initialStock} onChange={setInitialStock} min={0} quick={[10, 50, 100]} />
            </Field>
            {initialStock > 0 && (
              <Field label="รูปของที่รับเข้า">
                <PhotoPicker file={stockFile} onPick={setStockFile} label="ถ่ายรูปสต็อกตั้งต้น" required />
              </Field>
            )}
          </>
        )}

        {product && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={active} onChange={(e) => setActive(e.target.checked)} />
            เปิดขายสินค้านี้
          </label>
        )}

        <button className="btn-primary w-full" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
      </form>
    </Modal>
  );
}

// Stock in (รับของเข้า — Ready.md §3.5 บังคับรูป) and adjust out (ตัดสต็อก — บังคับเหตุผล).
function StockMoveModal({ product, mode, onClose, onDone }: {
  product: Product;
  mode: StockMode;
  onClose: () => void;
  onDone: () => void;
}) {
  const { profile } = useAuth();
  const { toast, confirm } = useUI();
  const tenantId = profile?.tenant_id ?? '';
  const [qty, setQty] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [outReason, setOutReason] = useState<OutReason>('ของเสีย');
  const [busy, setBusy] = useState(false);

  const current = product.stock_qty;
  const after = mode === 'in' ? current + qty : current - qty;
  const maxOut = Math.max(1, current);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!tenantId) {
      toast('ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่', 'error');
      return;
    }
    if (mode === 'in') {
      if (!file) {
        toast('ต้องถ่ายรูปของที่รับเข้า', 'error');
        return;
      }
    } else {
      if (qty > current) {
        toast('จำนวนที่ตัดมากกว่าสต็อกคงเหลือ', 'error');
        return;
      }
      if (outReason === 'อื่นๆ' && !note.trim()) {
        toast('กรุณาระบุเหตุผล', 'error');
        return;
      }
      const ok = await confirm({
        title: 'ยืนยันตัดสต็อก',
        message: `${product.name} จะถูกตัดออก ${qty} ชิ้น (คงเหลือ ${current} → ${after}) และยอดพร้อมขายจะลดลงทันที`,
        confirmText: 'ตัดสต็อก',
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      let photoPath: string | null = null;
      if (mode === 'in' && file) {
        photoPath = `${tenantId}/${uid()}.jpg`;
        await uploadToBucket('stock-in', photoPath, file);
      }
      const reason = mode === 'in'
        ? (note.trim() || 'รับของเข้า')
        : (outReason === 'อื่นๆ' ? `อื่นๆ: ${note.trim()}` : outReason);
      await invokeFn('stock-action', {
        product_id: product.id,
        qty: mode === 'in' ? qty : -qty,
        ...(photoPath ? { photo_path: photoPath } : {}),
        reason,
      });
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'ทำรายการไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={`${mode === 'in' ? 'รับของเข้า' : 'ตัดสต็อก / แก้ยอด'} · ${product.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label={mode === 'in' ? 'จำนวนที่รับเข้า' : 'จำนวนที่ตัดออก'}>
          {mode === 'in' ? (
            <Stepper value={qty} onChange={setQty} min={1} quick={[10, 50, 100]} />
          ) : (
            <Stepper value={qty} onChange={setQty} min={1} max={maxOut} />
          )}
        </Field>

        {/* Live summary: current stock → stock after this movement */}
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
          <span className="text-slate-500">
            คงเหลือปัจจุบัน <span className="font-bold text-slate-900">{current}</span>
          </span>
          <span className="text-slate-400">→</span>
          <span className="text-slate-500">
            {mode === 'in' ? 'หลังรับเข้า' : 'หลังตัด'}{' '}
            <span className={`font-bold ${mode === 'in' ? 'text-green-600' : after <= 0 ? 'text-red-600' : 'text-slate-900'}`}>{after}</span>
          </span>
        </div>
        {product.reserved_qty > 0 && (
          <div className="text-xs text-amber-600">มีของถูกจองอยู่ {product.reserved_qty} ชิ้น (รวมอยู่ในคงเหลือ)</div>
        )}

        {mode === 'in' ? (
          <>
            <Field label="รูปของที่รับเข้า">
              <PhotoPicker file={file} onPick={setFile} label="ถ่ายรูปของที่รับเข้า" required />
            </Field>
            <Field label="หมายเหตุ (ไม่บังคับ)">
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ล็อตใหม่จากซัพพลายเออร์" />
            </Field>
          </>
        ) : (
          <>
            <Field label="เหตุผล (บังคับ)">
              <select className="input" value={outReason} onChange={(e) => setOutReason(e.target.value as OutReason)}>
                {OUT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            {outReason === 'อื่นๆ' && (
              <Field label="ระบุเหตุผล">
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น แพ็คเกจฉีกขาดระหว่างขนย้าย" autoFocus />
              </Field>
            )}
          </>
        )}

        <button
          className={`w-full ${mode === 'in' ? 'btn-primary' : 'btn bg-red-600 text-white hover:bg-red-700 disabled:opacity-50'}`}
          disabled={busy}
        >
          {busy ? 'กำลังบันทึก…' : mode === 'in' ? 'ยืนยันรับเข้า' : 'ตัดสต็อก'}
        </button>
      </form>
    </Modal>
  );
}

// Last 20 stock movements for one product, with signed thumbnails for stock-in photos.
function StockHistoryModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['stock-movements', product.id],
    queryFn: async (): Promise<MovementView[]> => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('id,qty,reason,photo_url,created_at')
        .eq('product_id', product.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      const raw = (data as StockMovementRow[]) ?? [];
      return Promise.all(raw.map(async (m) => ({
        ...m,
        photo_signed: m.photo_url ? await signedUrl('stock-in', m.photo_url) : null,
      })));
    },
  });

  return (
    <Modal open title={`ประวัติสต็อก · ${product.name}`} onClose={onClose}>
      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState icon="🗒️" title="ยังไม่มีความเคลื่อนไหว" hint="รายการรับเข้า/ตัดสต็อกจะแสดงที่นี่" />
      ) : (
        <div className="space-y-2">
          {rows.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-2.5">
              {m.photo_signed ? (
                <a href={m.photo_signed} target="_blank" rel="noreferrer" className="shrink-0">
                  <img src={m.photo_signed} alt="รูปของเข้า" className="h-12 w-12 rounded-lg object-cover" />
                </a>
              ) : (
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-slate-100 text-lg text-slate-300">🗒️</div>
              )}
              <div className="min-w-0 flex-1">
                <span className={`text-sm font-bold ${m.qty > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {m.qty > 0 ? `+${m.qty}` : m.qty}
                </span>
                <div className="truncate text-xs text-slate-500">{m.reason || '—'}</div>
                <div className="text-xs text-slate-400">
                  {new Date(m.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              </div>
            </div>
          ))}
          {rows.length >= 20 && <div className="pt-1 text-center text-xs text-slate-400">แสดง 20 รายการล่าสุด</div>}
        </div>
      )}
    </Modal>
  );
}
