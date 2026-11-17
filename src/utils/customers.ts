import type { CustomerProfile, SaleRecord } from '../types/erp';

export interface CustomerHistorySummary {
  key: string;
  name: string;
  phone?: string;
  city?: string;
  social?: string;
  idDoc?: string;
  purchaseCount: number;
  totalSpentUsd: number;
  lastPurchaseDate?: string;
  lastPurchaseInvoice?: string;
  lastPurchaseSummary?: string;
  lastPurchaseAmountUsd?: number;
  updatedAt: string;
}

export interface CustomerStatusEvaluation {
  status: 'anonymous' | 'new' | 'frequent';
  matchedCustomer: CustomerHistorySummary | null;
  purchaseCount: number;
  totalSpentUsd: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeCustomerText(value?: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizePhoneDigits(phone?: string): string {
  return String(phone ?? '').replace(/\D/g, '');
}

export function isWalkInCustomerName(name?: string): boolean {
  const norm = normalizeCustomerText(name);
  return norm === '' || norm === 'cliente mostrador' || norm === 'mostrador';
}

function summarizeSaleItems(sale: SaleRecord): string {
  if (sale.items && sale.items.length > 0) {
    if (sale.items.length === 1) {
      const it = sale.items[0];
      return `${it.quantity}x ${it.modelLabel} (${it.size})`;
    }
    return `${sale.quantity} prendas (${sale.items.length} modelos)`;
  }
  return `${sale.quantity}x ${sale.modelLabel}`;
}

export function buildCustomerDirectory(
  sales: SaleRecord[],
  profiles: CustomerProfile[] = [],
): CustomerHistorySummary[] {
  const entries: CustomerHistorySummary[] = [];
  const nameIndex = new Map<string, number>();
  const phoneIndex = new Map<string, number>();

  const registerIndices = (idx: number, normName: string, phoneDigits: string) => {
    if (normName && !nameIndex.has(normName)) {
      nameIndex.set(normName, idx);
    }
    if (phoneDigits.length >= 7 && !phoneIndex.has(phoneDigits)) {
      phoneIndex.set(phoneDigits, idx);
    }
  };

  const findExistingIndex = (normName: string, phoneDigits: string): number => {
    if (normName && nameIndex.has(normName)) {
      return nameIndex.get(normName)!;
    }
    if (phoneDigits.length >= 7 && phoneIndex.has(phoneDigits)) {
      return phoneIndex.get(phoneDigits)!;
    }
    return -1;
  };

  // Seed with explicit saved profiles first (may have 0 purchases)
  for (const profile of profiles) {
    const cleanName = profile.name?.trim();
    if (!cleanName || isWalkInCustomerName(cleanName)) continue;
    const normName = normalizeCustomerText(cleanName);
    const phoneDigits = normalizePhoneDigits(profile.phone);
    const existingIdx = findExistingIndex(normName, phoneDigits);

    if (existingIdx >= 0) {
      const target = entries[existingIdx];
      target.name = target.name || cleanName;
      target.phone = target.phone || profile.phone?.trim() || undefined;
      target.city = target.city || profile.city?.trim() || undefined;
      target.social = target.social || profile.social?.trim() || undefined;
      target.idDoc = target.idDoc || profile.idDoc?.trim() || undefined;
      if (profile.updatedAt > target.updatedAt) {
        target.updatedAt = profile.updatedAt;
      }
      registerIndices(existingIdx, normName, phoneDigits);
      continue;
    }

    const idx = entries.length;
    entries.push({
      key: `cust-${normName}-${phoneDigits || idx}`,
      name: cleanName,
      phone: profile.phone?.trim() || undefined,
      city: profile.city?.trim() || undefined,
      social: profile.social?.trim() || undefined,
      idDoc: profile.idDoc?.trim() || undefined,
      purchaseCount: 0,
      totalSpentUsd: 0,
      updatedAt: profile.updatedAt || profile.createdAt || '',
    });
    registerIndices(idx, normName, phoneDigits);
  }

  // Sort sales oldest -> newest so latest metadata naturally wins when updating
  const orderedSales = [...sales].sort((a, b) =>
    (a.createdAt || '').localeCompare(b.createdAt || ''),
  );

  for (const sale of orderedSales) {
    const rawName = (sale.customerName || sale.debtorName || '').trim();
    if (isWalkInCustomerName(rawName)) continue;

    const normName = normalizeCustomerText(rawName);
    const phoneDigits = normalizePhoneDigits(sale.customerPhone);
    const existingIdx = findExistingIndex(normName, phoneDigits);
    const saleDate = sale.createdAt || '';
    const saleSummary = summarizeSaleItems(sale);

    if (existingIdx >= 0) {
      const target = entries[existingIdx];
      target.purchaseCount += 1;
      target.totalSpentUsd = round2(target.totalSpentUsd + (sale.finalPrice || 0));
      target.name = rawName;
      if (sale.customerPhone?.trim()) target.phone = sale.customerPhone.trim();
      if (sale.customerCity?.trim()) target.city = sale.customerCity.trim();
      if (sale.customerSocial?.trim()) target.social = sale.customerSocial.trim();
      if (sale.customerIdDoc?.trim()) target.idDoc = sale.customerIdDoc.trim();

      if (!target.lastPurchaseDate || saleDate >= target.lastPurchaseDate) {
        target.lastPurchaseDate = saleDate;
        target.lastPurchaseInvoice = sale.invoiceNumber || sale.id;
        target.lastPurchaseSummary = saleSummary;
        target.lastPurchaseAmountUsd = round2(sale.finalPrice || 0);
      }
      if (saleDate > target.updatedAt) {
        target.updatedAt = saleDate;
      }
      registerIndices(existingIdx, normName, phoneDigits);
    } else {
      const idx = entries.length;
      entries.push({
        key: `cust-${normName}-${phoneDigits || idx}`,
        name: rawName,
        phone: sale.customerPhone?.trim() || undefined,
        city: sale.customerCity?.trim() || undefined,
        social: sale.customerSocial?.trim() || undefined,
        idDoc: sale.customerIdDoc?.trim() || undefined,
        purchaseCount: 1,
        totalSpentUsd: round2(sale.finalPrice || 0),
        lastPurchaseDate: saleDate,
        lastPurchaseInvoice: sale.invoiceNumber || sale.id,
        lastPurchaseSummary: saleSummary,
        lastPurchaseAmountUsd: round2(sale.finalPrice || 0),
        updatedAt: saleDate,
      });
      registerIndices(idx, normName, phoneDigits);
    }
  }

  return entries.sort(
    (a, b) =>
      b.purchaseCount - a.purchaseCount ||
      b.updatedAt.localeCompare(a.updatedAt) ||
      a.name.localeCompare(b.name),
  );
}

export function searchCustomerDirectory(
  directory: CustomerHistorySummary[],
  query: string,
  limit = 8,
): CustomerHistorySummary[] {
  const normQuery = normalizeCustomerText(query);
  const digitQuery = normalizePhoneDigits(query);

  if (!normQuery && !digitQuery) {
    return directory.slice(0, limit);
  }

  return directory
    .filter((customer) => {
      const normName = normalizeCustomerText(customer.name);
      const normSocial = normalizeCustomerText(customer.social);
      const normIdDoc = normalizeCustomerText(customer.idDoc);
      const normCity = normalizeCustomerText(customer.city);
      const phoneDigits = normalizePhoneDigits(customer.phone);

      const textMatch =
        normQuery.length > 0 &&
        (normName.includes(normQuery) ||
          normSocial.includes(normQuery) ||
          normIdDoc.includes(normQuery) ||
          normCity.includes(normQuery));

      const phoneMatch =
        digitQuery.length >= 2 && phoneDigits.includes(digitQuery);

      return textMatch || phoneMatch;
    })
    .slice(0, limit);
}

export function evaluateCustomerStatus(
  directory: CustomerHistorySummary[],
  nameInput: string,
  phoneInput?: string,
): CustomerStatusEvaluation {
  const isWalkIn = isWalkInCustomerName(nameInput);
  const normName = isWalkIn ? '' : normalizeCustomerText(nameInput);
  const phoneDigits = normalizePhoneDigits(phoneInput);

  if (!normName && phoneDigits.length < 7) {
    return {
      status: 'anonymous',
      matchedCustomer: null,
      purchaseCount: 0,
      totalSpentUsd: 0,
    };
  }

  const matched =
    directory.find((customer) => {
      const cName = normalizeCustomerText(customer.name);
      const cPhone = normalizePhoneDigits(customer.phone);
      const nameMatches = Boolean(normName) && cName === normName;
      const phoneMatches =
        phoneDigits.length >= 7 && cPhone.length >= 7 && cPhone === phoneDigits;
      return nameMatches || phoneMatches;
    }) ?? null;

  if (matched && matched.purchaseCount > 0) {
    return {
      status: 'frequent',
      matchedCustomer: matched,
      purchaseCount: matched.purchaseCount,
      totalSpentUsd: matched.totalSpentUsd,
    };
  }

  return {
    status: 'new',
    matchedCustomer: matched,
    purchaseCount: 0,
    totalSpentUsd: 0,
  };
}
