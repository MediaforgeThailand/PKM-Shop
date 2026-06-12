import { selectMany } from './db.ts';
import { HttpError } from './http.ts';
import type { BranchRow, OrderPanelBranch, ProductBranchRow } from './types.ts';

type ProductBranchWithBranchRow = ProductBranchRow & {
  branches?: Pick<BranchRow, 'active' | 'address' | 'district' | 'id' | 'name' | 'sort' | 'tenant_id'> | Pick<
    BranchRow,
    'active' | 'address' | 'district' | 'id' | 'name' | 'sort' | 'tenant_id'
  >[] | null;
};

function branchFromProductBranchJoin(row: ProductBranchWithBranchRow) {
  if (Array.isArray(row.branches)) {
    return row.branches[0] ?? null;
  }

  return row.branches ?? null;
}

export function orderPanelBranchesFromRows(rows: ProductBranchWithBranchRow[]): OrderPanelBranch[] {
  return rows
    .map(branchFromProductBranchJoin)
    .filter((branch): branch is NonNullable<ReturnType<typeof branchFromProductBranchJoin>> => Boolean(branch))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'th'))
    .map((branch) => ({
      address: branch.address,
      district: branch.district,
      id: branch.id,
      name: branch.name,
    }));
}

export async function activeBranchesForProduct(tenantId: string, productId: string) {
  const rows = await selectMany<ProductBranchWithBranchRow>('product_branches', {
    'branches.active': 'eq.true',
    'branches.tenant_id': `eq.${tenantId}`,
    product_id: `eq.${productId}`,
    select: 'product_id,branch_id,branches!inner(id,tenant_id,name,address,district,active,sort)',
  });

  return orderPanelBranchesFromRows(rows);
}

export async function activeBranchForProduct(tenantId: string, productId: string, branchId: string) {
  const branches = await activeBranchesForProduct(tenantId, productId);

  return branches.find((branch) => branch.id === branchId) ?? null;
}

export function resolveProductBranchSelection(branches: OrderPanelBranch[], branchId?: string | null) {
  if (branches.length === 0) {
    return null;
  }

  if (branches.length === 1) {
    const branch = branches[0];

    if (branchId && branchId !== branch.id) {
      throw new HttpError('VALIDATION', 'Branch is not available for this product.', 400);
    }

    return branch;
  }

  if (!branchId) {
    throw new HttpError('VALIDATION', 'branch_id is required for this product.', 400);
  }

  const branch = branches.find((candidate) => candidate.id === branchId);

  if (!branch) {
    throw new HttpError('VALIDATION', 'Branch is not available for this product.', 400);
  }

  return branch;
}
