import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { invokeFn, uploadToBucket } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Category, Product } from '../../lib/types';

function uid() {
  return crypto.randomUUID();
}

export function Catalog() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id ?? '';
  const [adding, setAdding] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase.from('products').select('id,catalog_key,name,description,price_baht,category_id,stock_qty,reserved_qty,weight_g,packer_commission_rate,active').order('name');
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

  async function stockIn(product: Product) {
    const qtyStr = prompt(`รับของเข้า "${product.name}" จำนวน?`, '10');
    if (!qtyStr) return;
    const qty = parseInt(qtyStr, 10);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const path = `${tenantId}/${uid()}.jpg`;
      await uploadToBucket('stock-in', path, file);
      await invokeFn('stock-action', { product_id: product.id, qty, photo_path: path, reason: 'ของเข้า' });
      await qc.invalidateQueries({ queryKey: ['products'] });
    };
    input.click();
  }

  async function addProduct(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from('products').insert({
      tenant_id: tenantId,
      catalog_key: String(f.get('catalog_key')).toLowerCase(),
      name: String(f.get('name')),
      description: String(f.get('description') ?? ''),
      price_baht: Number(f.get('price')),
      category_id: (f.get('category_id') as string) || null,
      packer_commission_rate: Number(f.get('commission') ?? 0),
      weight_g: Number(f.get('weight') ?? 0),
    });
    if (error) {
      alert(error.message);
      return;
    }
    setAdding(false);
    await qc.invalidateQueries({ queryKey: ['products'] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">สินค้า & สต็อก</h1>
        <button className="btn-primary py-1 text-sm" onClick={() => setAdding((v) => !v)}>{adding ? 'ปิด' : '+ เพิ่มสินค้า'}</button>
      </div>

      {adding && (
        <form onSubmit={addProduct} className="card grid grid-cols-2 gap-2">
          <input name="name" placeholder="ชื่อสินค้า" className="input col-span-2" required />
          <input name="catalog_key" placeholder="รหัส (a-z0-9-)" className="input" required />
          <input name="price" type="number" placeholder="ราคา" className="input" required />
          <select name="category_id" className="input">
            <option value="">— หมวด —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input name="commission" type="number" placeholder="ค่าคอมแพ็ค/ชิ้น" className="input" />
          <input name="weight" type="number" placeholder="น้ำหนัก (กรัม)" className="input" />
          <input name="description" placeholder="รายละเอียด" className="input col-span-2" />
          <button className="btn-primary col-span-2">บันทึก</button>
        </form>
      )}

      <div className="space-y-2">
        {products.map((p) => (
          <div key={p.id} className="card flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">{p.name}</div>
              <div className="text-xs text-slate-500">฿{p.price_baht.toLocaleString('th-TH')} · คงเหลือ {p.stock_qty - p.reserved_qty} (จอง {p.reserved_qty})</div>
            </div>
            <button className="btn-ghost py-1 text-xs" onClick={() => void stockIn(p)}>รับของเข้า</button>
          </div>
        ))}
        {products.length === 0 && <p className="text-sm text-slate-400">ยังไม่มีสินค้า</p>}
      </div>
    </div>
  );
}
