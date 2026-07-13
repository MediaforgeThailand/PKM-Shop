import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { catalogAction, fileToImagePayload, invokeFn, uploadToBucket } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { EmptyState, ErrorState, Field, Modal, PageHeader, Spinner, useUI } from '../../lib/ui';
import type { Category, Product } from '../../lib/types';

function uid() {
  return crypto.randomUUID();
}

export function Catalog() {
  const qc = useQueryClient();
  const { toast } = useUI();
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [stockTarget, setStockTarget] = useState<Product | null>(null);

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
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<Category[]> => {
      const { data } = await supabase.from('categories').select('id,name,sort,active').order('sort');
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
                <div className="flex shrink-0 flex-col gap-1.5">
                  <button className="btn-ghost btn-sm" onClick={() => setStockTarget(p)}>รับเข้า</button>
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
            toast('บันทึกสินค้าแล้ว', 'success');
          }}
          onCategoryCreated={() => qc.invalidateQueries({ queryKey: ['categories'] })}
        />
      )}

      {stockTarget && (
        <StockInModal
          product={stockTarget}
          onClose={() => setStockTarget(null)}
          onDone={async () => {
            setStockTarget(null);
            await qc.invalidateQueries({ queryKey: ['products'] });
            toast('รับของเข้าสต็อกแล้ว', 'success');
          }}
        />
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
        await catalogAction({
          action: 'create_product',
          name: name.trim(), price_baht: priceNum, category_id: categoryId || null,
          description: description.trim(), ...(image ? { image } : {}),
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

function StockInModal({ product, onClose, onDone }: { product: Product; onClose: () => void; onDone: () => void }) {
  const { profile } = useAuth();
  const { toast } = useUI();
  const tenantId = profile?.tenant_id ?? '';
  const [qty, setQty] = useState('10');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = parseInt(qty, 10);
    if (!Number.isFinite(n) || n <= 0) return toast('จำนวนไม่ถูกต้อง', 'error');
    if (!file) return toast('ต้องถ่ายรูปของที่รับเข้า', 'error');
    setBusy(true);
    try {
      const path = `${tenantId}/${uid()}.jpg`;
      await uploadToBucket('stock-in', path, file);
      await invokeFn('stock-action', { product_id: product.id, qty: n, photo_path: path, reason: 'รับของเข้า' });
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'รับของเข้าไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={`รับของเข้า · ${product.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="จำนวนที่รับเข้า">
          <input className="input" type="number" inputMode="numeric" min="1" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </Field>
        <Field label="รูปของที่รับเข้า (บังคับ)">
          <input className="input py-2" type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        </Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'ยืนยันรับเข้า'}</button>
      </form>
    </Modal>
  );
}
