import {
  createEmptyCleanState,
  getDefaultSalePrice,
  INITIAL_CAPITAL_INJECTIONS,
  INITIAL_CASH_ON_HAND,
  INITIAL_HISTORICAL_NET_PROFIT,
  INITIAL_OPERATING_EXPENSES,
  INITIAL_RECEIVABLES,
  INITIAL_TOTAL_CAPITAL_INJECTED,
  INITIAL_TOTAL_OPERATING_EXPENSES,
} from '../data/initialState';
import type {
  AppState,
  AuditMovement,
  CapitalInjectionDestination,
  CapitalInjectionRecord,
  FifoBatch,
  InventoryItem,
  JerseySize,
  JerseyVersion,
  OperatingExpenseRecord,
  PaymentMethod,
  PaymentStatus,
  PurchaseBatchRecord,
  PurchaseRecord,
  ReceivableItem,
  SaleRecord,
  SellerName,
  SinglePaymentMethod,
  TeamCategory,
} from '../types/erp';
import {
  calculateFourLayerMatrixConsolidated,
  formatUSD,
  previewFifoConsumption,
  round2,
  round4,
} from './finance';

export interface XlsxWorkSheet {
  [key: string]: unknown;
}

export interface XlsxWorkBook {
  SheetNames: string[];
  Sheets: Record<string, XlsxWorkSheet>;
}

export interface XlsxGlobal {
  read: (
    data: ArrayBuffer | Uint8Array,
    opts?: { type?: string; cellDates?: boolean },
  ) => XlsxWorkBook;
  utils: {
    sheet_to_json: <T = unknown[]>(
      sheet: XlsxWorkSheet,
      opts?: { header?: number | string[]; defval?: unknown; raw?: boolean },
    ) => T[];
    aoa_to_sheet: (data: unknown[][]) => XlsxWorkSheet;
    book_new: () => XlsxWorkBook;
    book_append_sheet: (
      wb: XlsxWorkBook,
      ws: XlsxWorkSheet,
      name: string,
    ) => void;
  };
  write: (
    wb: XlsxWorkBook,
    opts: { bookType: string; type: string },
  ) => ArrayBuffer | Uint8Array;
  writeFile: (wb: XlsxWorkBook, filename: string) => void;
}

declare global {
  interface Window {
    XLSX?: XlsxGlobal;
  }
}

export type SheetMatrix = unknown[][];

export interface ComprasColumnMap {
  model: number;
  size: number;
  version: number;
  quantity: number;
  unitCost: number;
  salePrice: number;
  date: number;
  usdtRate: number;
  bcvRate: number;
  reference: number;
}

export interface VentasColumnMap {
  model: number;
  size: number;
  version: number;
  quantity: number;
  customer: number;
  seller: number;
  date: number;
  totalPrice: number;
  unitPrice: number;
  paymentStatus: number;
  paymentMethod: number;
}

export interface ExcelImportPreview {
  detectedSheets: {
    compras: string | null;
    ventas: string | null;
    finanzas: string | null;
    allSheets: string[];
  };
  mappedColumns: {
    compras: Record<string, string>;
    ventas: Record<string, string>;
  };
  comprasRowsParsed: number;
  comprasUnitsTotal: number;
  comprasCostTotal: number;
  ventasRowsParsed: number;
  ventasUnitsSold: number;
  ventasRevenueTotal: number;
  ventasFifoCogsTotal: number;
  ventasNetProfitTotal: number;
  resultingStockUnits: number;
  resultingSkusCount: number;
  cashOnHand: number;
  receivablesTotal: number;
  receivablesCount: number;
  injectionsTotal: number;
  injectionsCount: number;
  expensesTotal: number;
  expensesCount: number;
  historicalNetProfit: number;
  usdtRate: number;
  bcvRate: number;
  warnings: string[];
}

export interface ExcelImportResult {
  ok: boolean;
  error?: string;
  preview?: ExcelImportPreview;
  state?: AppState;
}

export interface ExcelImportOptions {
  currentBcv?: number;
  currentUsdt?: number;
}

export const DEFAULT_EXCEL_CASH = INITIAL_CASH_ON_HAND;
export const DEFAULT_EXCEL_RECEIVABLES = 263.5;

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_\-./\\|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseSpreadsheetNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  // Handle parentheses negative like (25.00)
  const isParenNegative = /^\(.*\)$/.test(raw);
  let cleaned = raw
    .replace(/[$€£]/g, '')
    .replace(/bs\.?/gi, '')
    .replace(/usd|usdt|ves/gi, '')
    .replace(/[()\s]/g, '');

  if (!cleaned) return null;

  // Handle Spanish/European vs US thousand/decimal separators
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      // 1.250,50 -> 1250.50
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,250.50 -> 1250.50
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 4) {
      cleaned = `${parts[0]}.${parts[1]}`;
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }

  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return isParenNegative ? -Math.abs(num) : num;
}

export function parseSpreadsheetDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && value > 20000 && value < 90000) {
    // Excel serial date (days since 1899-12-30)
    const utcMs = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(utcMs);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }
  const raw = String(value ?? '').trim();
  if (!raw) return new Date().toISOString().slice(0, 10);

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dmyMatch) {
    const [, d, m, yRaw] = dmyMatch;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

export function normalizeJerseyVersion(
  rawVersion: unknown,
  modelName = '',
): JerseyVersion {
  const v = normalizeText(rawVersion);
  const m = normalizeText(modelName);
  if (v.includes('retro') || v.includes('clasic') || v.includes('vintage')) {
    return 'Retro';
  }
  if (
    v.includes('player') ||
    v.includes('jugador') ||
    v.includes('match') ||
    v.includes('pro')
  ) {
    return 'Player';
  }
  if (
    v.includes('fan') ||
    v.includes('aficion') ||
    v.includes('estadio') ||
    v.includes('stadium') ||
    v.includes('replica')
  ) {
    return 'Fan';
  }
  if (m.includes('retro')) return 'Retro';
  if (m.includes('player') || m.includes('jugador')) return 'Player';
  return 'Fan';
}

export function normalizeJerseySize(rawSize: unknown): JerseySize {
  const s = normalizeText(rawSize).toUpperCase().replace(/\s+/g, '');
  if (s === 'S' || s === 'SMALL' || s === 'CH' || s === 'P') return 'S';
  if (s === 'M' || s === 'MEDIUM' || s === 'MEDIANA') return 'M';
  if (s === 'L' || s === 'LARGE' || s === 'GRANDE') return 'L';
  if (s === 'XL' || s === '2XL' || s === 'XXL' || s === 'EXTRALARGE') {
    return 'XL';
  }
  return 'M';
}

export function normalizeSellerName(rawSeller: unknown): SellerName {
  const s = normalizeText(rawSeller);
  if (s.includes('jesus')) return 'Jesús';
  if (s.includes('josue')) return 'Josué';
  if (s.includes('gabriel')) return 'Gabriel';
  return 'Sin Vendedor';
}

export function normalizePaymentMethod(rawMethod: unknown): PaymentMethod {
  const m = normalizeText(rawMethod);
  if (m.includes('binance') || m.includes('usdt') || m.includes('cripto')) {
    return 'Binance USDT';
  }
  if (m.includes('zelle')) return 'Zelle';
  if (
    m.includes('pago movil') ||
    m.includes('movil') ||
    m.includes('bolivar') ||
    m.includes('bs') ||
    m.includes('transferencia')
  ) {
    return 'Pago Móvil / Bs';
  }
  if (m.includes('mixto')) return 'Pago Mixto';
  return 'Efectivo ($)';
}

export function normalizeSinglePaymentMethod(
  rawMethod: unknown,
): SinglePaymentMethod {
  const pm = normalizePaymentMethod(rawMethod);
  return pm === 'Pago Mixto' ? 'Efectivo ($)' : pm;
}

export function inferTeamCategory(modelName: string): TeamCategory {
  const m = normalizeText(modelName);
  if (m.includes('barcelona') || m.includes('barca') || m.includes('fcb')) {
    return 'Barcelona';
  }
  if (m.includes('madrid') || m.includes('rma')) {
    return 'Real Madrid';
  }
  if (m.includes('city') || m.includes('manchester')) {
    return 'Manchester City';
  }
  if (m.includes('psg') || m.includes('paris')) {
    return 'PSG';
  }
  if (
    m.includes('seleccion') ||
    m.includes('argentina') ||
    m.includes('venezuela') ||
    m.includes('vinotinto') ||
    m.includes('espana') ||
    m.includes('brasil') ||
    m.includes('portugal') ||
    m.includes('francia') ||
    m.includes('alemania') ||
    m.includes('colombia')
  ) {
    return 'Selecciones';
  }
  return 'Otro';
}

function findColumnIndex(
  headers: string[],
  exactCandidates: string[],
  partialCandidates: string[],
  excludeCandidates: string[] = [],
): number {
  for (const candidate of exactCandidates) {
    const idx = headers.findIndex(
      (h) =>
        h === candidate &&
        !excludeCandidates.some((ex) => h.includes(ex)),
    );
    if (idx >= 0) return idx;
  }
  for (const candidate of partialCandidates) {
    const idx = headers.findIndex(
      (h) =>
        h.includes(candidate) &&
        !excludeCandidates.some((ex) => h.includes(ex)),
    );
    if (idx >= 0) return idx;
  }
  return -1;
}

function findHeaderRow(
  rows: SheetMatrix,
  keywordGroups: string[][],
): number {
  let bestIdx = -1;
  let bestScore = 0;
  const maxScan = Math.min(rows.length, 15);

  for (let r = 0; r < maxScan; r++) {
    const row = rows[r] ?? [];
    const normalizedCells = row.map((c) => normalizeText(c));
    let score = 0;
    for (const group of keywordGroups) {
      if (
        group.some((kw) => normalizedCells.some((cell) => cell.includes(kw)))
      ) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = r;
    }
  }
  return bestScore >= 2 ? bestIdx : -1;
}

function findSheetByPatterns(
  sheetNames: string[],
  patterns: string[],
): string | null {
  for (const pat of patterns) {
    const exact = sheetNames.find((n) => normalizeText(n) === pat);
    if (exact) return exact;
  }
  for (const pat of patterns) {
    const partial = sheetNames.find((n) => normalizeText(n).includes(pat));
    if (partial) return partial;
  }
  return null;
}

function isRowEmpty(row: unknown[]): boolean {
  return !row || row.every((cell) => String(cell ?? '').trim() === '');
}

interface ParsedPurchaseLine {
  model: string;
  size: JerseySize;
  version: JerseyVersion;
  quantity: number;
  unitCost: number;
  salePrice: number;
  date: string;
  usdtRate: number | null;
  bcvRate: number | null;
  reference: string;
}

interface ParsedSaleLine {
  rowOrder: number;
  model: string;
  size: JerseySize;
  version: JerseyVersion | null;
  quantity: number;
  customerName: string;
  seller: SellerName;
  date: string;
  totalPrice: number | null;
  unitPrice: number | null;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
}

function parseComprasSheet(
  rows: SheetMatrix,
  warnings: string[],
): {
  lines: ParsedPurchaseLine[];
  mappedLabels: Record<string, string>;
  latestUsdtRate: number | null;
  latestBcvRate: number | null;
} {
  const headerIdx = findHeaderRow(rows, [
    ['modelo', 'producto', 'camiseta', 'franela', 'articulo', 'descripcion'],
    ['talla', 'size'],
    ['version', 'tipo', 'edicion', 'gama'],
    ['cantidad', 'cant', 'unidades', 'uds', 'stock', 'qty'],
    ['costo', 'cogs', 'fabrica', 'compra'],
    ['precio', 'pvp', 'venta'],
  ]);

  if (headerIdx < 0) {
    warnings.push(
      'No se detectaron encabezados claros en la pestaña Compras (se requiere al menos Modelo y Cantidad/Costo).',
    );
    return {
      lines: [],
      mappedLabels: {},
      latestUsdtRate: null,
      latestBcvRate: null,
    };
  }

  const rawHeaders = (rows[headerIdx] ?? []).map((c) => String(c ?? '').trim());
  const normHeaders = rawHeaders.map((c) => normalizeText(c));

  const map: ComprasColumnMap = {
    model: findColumnIndex(
      normHeaders,
      ['modelo', 'producto', 'camiseta', 'franela', 'articulo', 'nombre'],
      ['modelo', 'camiseta', 'franela', 'producto', 'descripcion', 'articulo'],
    ),
    size: findColumnIndex(
      normHeaders,
      ['talla', 'size', 'tamano'],
      ['talla', 'size'],
    ),
    version: findColumnIndex(
      normHeaders,
      ['version', 'tipo', 'edicion', 'calidad', 'gama'],
      ['version', 'edicion', 'calidad', 'gama'],
    ),
    quantity: findColumnIndex(
      normHeaders,
      ['cantidad', 'cant', 'unidades', 'uds', 'stock', 'qty', 'compradas'],
      ['cantidad', 'unidad', 'stock', 'qty', 'cant'],
    ),
    unitCost: findColumnIndex(
      normHeaders,
      [
        'costo unitario (usdt)',
        'costo unitario usdt',
        'costo usdt',
        'costo unitario ($)',
        'costo unitario',
        'costo',
        'cogs',
        'precio fabrica',
        'costo fabrica',
        'precio compra',
        'landed cost',
        'unit cost',
      ],
      ['costo unitario (usdt)', 'costo usdt', 'costo unit', 'cogs', 'fabrica', 'compra', 'landed', 'costo'],
      ['total'],
    ),
    salePrice: findColumnIndex(
      normHeaders,
      ['precio de venta (usdt)', 'precio venta usdt', 'precio de venta', 'precio venta', 'pvp', 'precio usdt', 'precio usd', 'precio'],
      ['precio venta', 'precio de venta', 'pvp', 'precio'],
      ['costo', 'compra', 'fabrica', 'total'],
    ),
    date: findColumnIndex(
      normHeaders,
      ['fecha', 'fecha compra', 'fecha ingreso', 'date'],
      ['fecha', 'date'],
    ),
    usdtRate: findColumnIndex(
      normHeaders,
      ['tasa usdt', 'cambio usdt', 'usdt', 'tasa paralelo', 'paralelo'],
      ['tasa usdt', 'usdt', 'paralelo'],
      ['costo', 'precio', 'total', 'monto', 'venta', 'bcv'],
    ),
    bcvRate: findColumnIndex(
      normHeaders,
      ['tasa bcv', 'bcv', 'cambio bcv', 'dolar bcv'],
      ['bcv'],
      ['usdt', 'costo', 'precio', 'total', 'monto'],
    ),
    reference: findColumnIndex(
      normHeaders,
      ['lote', 'referencia', 'envio', 'orden'],
      ['lote', 'referencia', 'envio'],
    ),
  };

  const mappedLabels: Record<string, string> = {};
  (Object.keys(map) as Array<keyof ComprasColumnMap>).forEach((k) => {
    const colIdx = map[k];
    if (colIdx >= 0) {
      mappedLabels[k] = rawHeaders[colIdx] || `Columna ${colIdx + 1}`;
    }
  });

  if (map.model < 0 || map.quantity < 0) {
    warnings.push(
      'La pestaña Compras necesita columnas identificables de Modelo y Cantidad.',
    );
    return {
      lines: [],
      mappedLabels,
      latestUsdtRate: null,
      latestBcvRate: null,
    };
  }

  const lines: ParsedPurchaseLine[] = [];
  let latestUsdtRate: number | null = null;
  let latestBcvRate: number | null = null;

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (isRowEmpty(row)) continue;

    const rawModel = String(row[map.model] ?? '').trim();
    if (!rawModel) continue;
    const normModel = normalizeText(rawModel);
    if (normModel === 'total' || normModel === 'totales' || normModel.startsWith('total ')) {
      continue;
    }

    const qtyNum = parseSpreadsheetNumber(row[map.quantity]);
    const quantity = qtyNum !== null ? Math.floor(qtyNum) : 0;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const version =
      map.version >= 0
        ? normalizeJerseyVersion(row[map.version], rawModel)
        : normalizeJerseyVersion('', rawModel);
    const size =
      map.size >= 0 ? normalizeJerseySize(row[map.size]) : ('M' as JerseySize);

    const parsedCost =
      map.unitCost >= 0 ? parseSpreadsheetNumber(row[map.unitCost]) : null;
    const unitCost =
      parsedCost !== null && parsedCost > 0
        ? round4(parsedCost)
        : version === 'Player' || version === 'Retro'
          ? 6.5
          : 5.7;

    const parsedSalePrice =
      map.salePrice >= 0 ? parseSpreadsheetNumber(row[map.salePrice]) : null;
    const salePrice =
      parsedSalePrice !== null && parsedSalePrice > 0
        ? round2(parsedSalePrice)
        : getDefaultSalePrice(version, rawModel);

    const date =
      map.date >= 0
        ? parseSpreadsheetDate(row[map.date])
        : '2026-11-01';

    const parsedUsdt =
      map.usdtRate >= 0 ? parseSpreadsheetNumber(row[map.usdtRate]) : null;
    const usdtRate = parsedUsdt !== null && parsedUsdt > 1 ? round2(parsedUsdt) : null;
    if (usdtRate !== null) {
      latestUsdtRate = usdtRate;
    }

    const parsedBcv =
      map.bcvRate >= 0 ? parseSpreadsheetNumber(row[map.bcvRate]) : null;
    const bcvRate = parsedBcv !== null && parsedBcv > 1 ? round2(parsedBcv) : null;
    if (bcvRate !== null) {
      latestBcvRate = bcvRate;
    }

    const reference =
      map.reference >= 0 && String(row[map.reference] ?? '').trim()
        ? String(row[map.reference]).trim()
        : `Lote Excel (${date})`;

    lines.push({
      model: rawModel, // Mantiene exactamente el nombre original sin alteraciones
      size,
      version,
      quantity,
      unitCost,
      salePrice,
      date,
      usdtRate,
      bcvRate,
      reference,
    });
  }

  return { lines, mappedLabels, latestUsdtRate, latestBcvRate };
}

function parseVentasSheet(
  rows: SheetMatrix,
  warnings: string[],
): {
  lines: ParsedSaleLine[];
  mappedLabels: Record<string, string>;
} {
  const headerIdx = findHeaderRow(rows, [
    ['modelo', 'producto', 'camiseta', 'franela', 'articulo', 'descripcion'],
    ['talla', 'size'],
    ['cantidad', 'cant', 'unidades', 'uds', 'qty'],
    ['comprador', 'cliente', 'customer', 'persona'],
    ['vendedor', 'seller', 'socio', 'asesor'],
    ['fecha', 'date'],
  ]);

  if (headerIdx < 0) {
    warnings.push(
      'No se detectaron encabezados claros en la pestaña Ventas; no se procesaron salidas históricas.',
    );
    return { lines: [], mappedLabels: {} };
  }

  const rawHeaders = (rows[headerIdx] ?? []).map((c) => String(c ?? '').trim());
  const normHeaders = rawHeaders.map((c) => normalizeText(c));

  const map: VentasColumnMap = {
    model: findColumnIndex(
      normHeaders,
      ['modelo', 'producto', 'camiseta', 'franela', 'articulo', 'descripcion'],
      ['modelo', 'camiseta', 'franela', 'producto', 'descripcion', 'articulo'],
    ),
    size: findColumnIndex(
      normHeaders,
      ['talla', 'size', 'tamano'],
      ['talla', 'size'],
    ),
    version: findColumnIndex(
      normHeaders,
      ['version', 'tipo', 'edicion', 'gama'],
      ['version', 'edicion', 'gama'],
    ),
    quantity: findColumnIndex(
      normHeaders,
      ['cantidad', 'cant', 'unidades', 'uds', 'qty'],
      ['cantidad', 'unidad', 'qty', 'cant'],
    ),
    customer: findColumnIndex(
      normHeaders,
      ['comprador', 'cliente', 'nombre cliente', 'customer', 'deudor'],
      ['comprador', 'cliente', 'customer', 'deudor', 'persona'],
    ),
    seller: findColumnIndex(
      normHeaders,
      ['vendedor', 'seller', 'socio', 'asesor'],
      ['vendedor', 'seller', 'socio', 'asesor'],
    ),
    date: findColumnIndex(
      normHeaders,
      ['fecha', 'fecha venta', 'date'],
      ['fecha', 'date'],
    ),
    totalPrice: findColumnIndex(
      normHeaders,
      [
        'total',
        'monto',
        'precio total',
        'venta total',
        'importe',
        'total usd',
        'monto usd',
      ],
      ['total', 'monto', 'importe', 'venta'],
      ['unitario', 'costo', 'cogs', 'ganancia', 'utilidad'],
    ),
    unitPrice: findColumnIndex(
      normHeaders,
      ['precio unitario', 'precio de venta', 'pvp', 'precio', 'unit price'],
      ['precio unit', 'pvp', 'precio'],
      ['costo', 'total'],
    ),
    paymentStatus: findColumnIndex(
      normHeaders,
      ['estado', 'estatus', 'status', 'condicion', 'pagado'],
      ['estado', 'estatus', 'status', 'condicion'],
    ),
    paymentMethod: findColumnIndex(
      normHeaders,
      ['metodo', 'metodo de pago', 'forma de pago', 'via', 'pago'],
      ['metodo', 'forma de pago', 'via'],
    ),
  };

  const mappedLabels: Record<string, string> = {};
  (Object.keys(map) as Array<keyof VentasColumnMap>).forEach((k) => {
    const colIdx = map[k];
    if (colIdx >= 0) {
      mappedLabels[k] = rawHeaders[colIdx] || `Columna ${colIdx + 1}`;
    }
  });

  if (map.model < 0 || map.quantity < 0) {
    warnings.push(
      'La pestaña Ventas necesita columnas de Modelo y Cantidad para descontar el inventario FIFO.',
    );
    return { lines: [], mappedLabels };
  }

  const lines: ParsedSaleLine[] = [];

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (isRowEmpty(row)) continue;

    const rawModel = String(row[map.model] ?? '').trim();
    if (!rawModel) continue;
    const normModel = normalizeText(rawModel);
    if (normModel === 'total' || normModel === 'totales' || normModel.startsWith('total ')) {
      continue;
    }

    const qtyNum = parseSpreadsheetNumber(row[map.quantity]);
    const quantity = qtyNum !== null ? Math.floor(qtyNum) : 0;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const size =
      map.size >= 0 ? normalizeJerseySize(row[map.size]) : ('M' as JerseySize);
    const version =
      map.version >= 0 && String(row[map.version] ?? '').trim()
        ? normalizeJerseyVersion(row[map.version], rawModel)
        : null;

    const customerName =
      map.customer >= 0 && String(row[map.customer] ?? '').trim()
        ? String(row[map.customer]).trim()
        : 'Cliente Mostrador';
    const seller =
      map.seller >= 0
        ? normalizeSellerName(row[map.seller])
        : ('Sin Vendedor' as SellerName);
    const date =
      map.date >= 0
        ? parseSpreadsheetDate(row[map.date])
        : new Date().toISOString().slice(0, 10);

    const parsedTotal =
      map.totalPrice >= 0 ? parseSpreadsheetNumber(row[map.totalPrice]) : null;
    const parsedUnit =
      map.unitPrice >= 0 ? parseSpreadsheetNumber(row[map.unitPrice]) : null;

    const rawStatus =
      map.paymentStatus >= 0 ? normalizeText(row[map.paymentStatus]) : '';
    const paymentStatus: PaymentStatus =
      rawStatus.includes('pendiente') ||
      rawStatus.includes('credito') ||
      rawStatus.includes('debe') ||
      rawStatus.includes('fiao') ||
      rawStatus.includes('por cobrar')
        ? 'Pendiente'
        : 'Cobrado';

    const paymentMethod =
      map.paymentMethod >= 0
        ? normalizePaymentMethod(row[map.paymentMethod])
        : ('Efectivo ($)' as PaymentMethod);

    lines.push({
      rowOrder: r,
      model: rawModel,
      size,
      version,
      quantity,
      customerName,
      seller,
      date,
      totalPrice: parsedTotal !== null && parsedTotal > 0 ? round2(parsedTotal) : null,
      unitPrice: parsedUnit !== null && parsedUnit > 0 ? round2(parsedUnit) : null,
      paymentStatus,
      paymentMethod,
    });
  }

  // Orden cronológico estricto para motor FIFO
  lines.sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    return cmp !== 0 ? cmp : a.rowOrder - b.rowOrder;
  });

  return { lines, mappedLabels };
}

interface ParsedFinanzasSheet {
  cashOnHand: number;
  receivables: ReceivableItem[];
  capitalInjections: CapitalInjectionRecord[];
  operatingExpenses: OperatingExpenseRecord[];
  historicalNetProfit: number;
  bcvRate: number | null;
  usdtRate: number | null;
}

function parseFinanzasSheet(rows: SheetMatrix | null): ParsedFinanzasSheet {
  let cashFound: number | null = null;
  let totalReceivablesCell: number | null = null;
  let totalInjectionsCell: number | null = null;
  let totalExpensesCell: number | null = null;
  let historicalNetProfitFound: number | null = null;
  let bcvRate: number | null = null;
  let usdtRate: number | null = null;

  const receivables: ReceivableItem[] = [];
  const capitalInjections: CapitalInjectionRecord[] = [];
  const operatingExpenses: OperatingExpenseRecord[] = [];

  if (!rows || rows.length === 0) {
    return {
      cashOnHand: DEFAULT_EXCEL_CASH,
      receivables: INITIAL_RECEIVABLES.map((item) => ({ ...item })),
      capitalInjections: INITIAL_CAPITAL_INJECTIONS.map((item) => ({ ...item })),
      operatingExpenses: INITIAL_OPERATING_EXPENSES.map((item) => ({ ...item })),
      historicalNetProfit: INITIAL_HISTORICAL_NET_PROFIT,
      bcvRate: null,
      usdtRate: null,
    };
  }

  // 1. Escaneo de pares clave-valor y filas tabulares por tipo
  let currentSection: 'none' | 'cxc' | 'injection' | 'expense' = 'none';
  let sectionColAmount = -1;
  let sectionColName = -1;
  let sectionColConcept = -1;
  let sectionColMethod = -1;
  let sectionColDate = -1;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (isRowEmpty(row)) {
      currentSection = 'none';
      continue;
    }

    const normRow = row.map((c) => normalizeText(c));
    const joined = normRow.filter(Boolean).join(' ');

    // Detectar encabezados de subtablas dentro de Finanzas / Resumen
    const hasMontoCol = normRow.some(
      (c) =>
        c === 'monto' ||
        c === 'saldo' ||
        c === 'importe' ||
        c.includes('monto ($)') ||
        c.includes('monto (usdt)') ||
        c.includes('monto usdt') ||
        c === 'usd' ||
        c === 'usdt',
    );
    const hasDeudorCol = normRow.some(
      (c) => c.includes('deudor') || c.includes('cliente'),
    );
    const hasAportanteCol = normRow.some(
      (c) => c.includes('aportante') || c.includes('origen') || c.includes('inyeccion'),
    );
    const hasConceptoCol = normRow.some(
      (c) => c.includes('concepto') || c.includes('descripcion') || c.includes('gasto'),
    );

    if (hasMontoCol && hasDeudorCol) {
      currentSection = 'cxc';
      sectionColName = findColumnIndex(normRow, ['deudor', 'cliente'], ['deudor', 'cliente']);
      sectionColConcept = findColumnIndex(normRow, ['nota', 'concepto', 'detalle'], ['nota', 'concepto', 'detalle']);
      sectionColAmount = findColumnIndex(normRow, ['monto (usdt)', 'monto ($)', 'monto', 'saldo', 'importe', 'usdt', 'usd'], ['monto', 'saldo', 'importe']);
      sectionColDate = findColumnIndex(normRow, ['fecha'], ['fecha']);
      continue;
    }

    if (hasMontoCol && hasAportanteCol) {
      currentSection = 'injection';
      sectionColName = findColumnIndex(normRow, ['aportante', 'origen', 'socio'], ['aportante', 'origen', 'socio']);
      sectionColConcept = findColumnIndex(normRow, ['concepto', 'detalle', 'nota'], ['concepto', 'detalle', 'nota']);
      sectionColAmount = findColumnIndex(normRow, ['monto (usdt)', 'monto ($)', 'monto', 'importe', 'usdt', 'usd'], ['monto', 'importe']);
      sectionColMethod = findColumnIndex(normRow, ['metodo', 'via'], ['metodo', 'via']);
      sectionColDate = findColumnIndex(normRow, ['fecha'], ['fecha']);
      continue;
    }

    if (hasMontoCol && hasConceptoCol && (joined.includes('gasto') || joined.includes('caja chica') || joined.includes('egreso'))) {
      currentSection = 'expense';
      sectionColConcept = findColumnIndex(normRow, ['concepto', 'gasto', 'descripcion'], ['concepto', 'gasto', 'descripcion']);
      sectionColAmount = findColumnIndex(normRow, ['monto (usdt)', 'monto ($)', 'monto', 'importe', 'usdt', 'usd'], ['monto', 'importe']);
      sectionColMethod = findColumnIndex(normRow, ['metodo', 'via'], ['metodo', 'via']);
      sectionColDate = findColumnIndex(normRow, ['fecha'], ['fecha']);
      continue;
    }

    // Procesar fila si estamos dentro de una subtabla detectada
    if (currentSection !== 'none' && sectionColAmount >= 0) {
      const amt = parseSpreadsheetNumber(row[sectionColAmount]);
      const nameVal = sectionColName >= 0 ? String(row[sectionColName] ?? '').trim() : '';
      const conceptVal = sectionColConcept >= 0 ? String(row[sectionColConcept] ?? '').trim() : '';
      const normNameOrConcept = normalizeText(nameVal || conceptVal);

      if (normNameOrConcept.startsWith('total')) {
        currentSection = 'none';
        continue;
      }

      if (amt !== null && amt > 0 && (nameVal || conceptVal)) {
        const createdAt =
          sectionColDate >= 0 && String(row[sectionColDate] ?? '').trim()
            ? `${parseSpreadsheetDate(row[sectionColDate])}T12:00:00.000Z`
            : new Date().toISOString();

        if (currentSection === 'cxc') {
          receivables.push({
            id: `rec-xlsx-${r}`,
            debtor: nameVal || conceptVal,
            amount: round2(amt),
            originalAmount: round2(amt),
            paidAmount: 0,
            createdAt,
            note: conceptVal || 'Importado desde Excel Finanzas',
          });
          continue;
        }
        if (currentSection === 'injection') {
          capitalInjections.push({
            id: `inj-xlsx-${r}`,
            contributor: nameVal || 'Aporte Externo',
            concept: conceptVal || 'Inyección de capital',
            amount: round2(amt),
            paymentMethod:
              sectionColMethod >= 0
                ? normalizeSinglePaymentMethod(row[sectionColMethod])
                : 'Binance USDT',
            destination: 'cashOnly' as CapitalInjectionDestination,
            createdAt,
          });
          continue;
        }
        if (currentSection === 'expense') {
          operatingExpenses.push({
            id: `exp-xlsx-${r}`,
            concept: conceptVal || nameVal || 'Gasto operativo',
            amount: round2(amt),
            source: 'cashOnHand',
            paymentMethod:
              sectionColMethod >= 0
                ? normalizeSinglePaymentMethod(row[sectionColMethod])
                : 'Binance USDT',
            createdAt,
          });
          continue;
        }
      }
    }

    // Procesar filas explícitas de tipo o pares clave-valor en Resumen
    const firstNonEmptyIdx = row.findIndex((c) => String(c ?? '').trim() !== '');
    if (firstNonEmptyIdx < 0) continue;
    const label = normalizeText(row[firstNonEmptyIdx]);

    // Buscar primer valor numérico a la derecha de la etiqueta
    let rightNumeric: number | null = null;
    for (let c = firstNonEmptyIdx + 1; c < row.length; c++) {
      const parsed = parseSpreadsheetNumber(row[c]);
      if (parsed !== null) {
        rightNumeric = parsed;
        break;
      }
    }

    if (
      label.includes('efectivo') ||
      label === 'caja' ||
      label.includes('caja fisica') ||
      label.includes('saldo en caja') ||
      label.includes('cash')
    ) {
      if (rightNumeric !== null && rightNumeric >= 0) {
        cashFound = round2(rightNumeric);
      }
      continue;
    }

    if (
      label.includes('cuentas por cobrar') ||
      label === 'cxc' ||
      label.includes('total por cobrar') ||
      label.includes('receivables')
    ) {
      if (rightNumeric !== null && rightNumeric >= 0) {
        totalReceivablesCell = round2(rightNumeric);
      }
      continue;
    }

    if (
      label.includes('capital inyectado') ||
      label.includes('inyeccion total') ||
      label.includes('total inyectado')
    ) {
      if (rightNumeric !== null && rightNumeric >= 0) {
        totalInjectionsCell = round2(rightNumeric);
      }
      continue;
    }

    if (
      label.includes('gastos operativos totales') ||
      label.includes('gasto operativo total') ||
      label === 'gastos operativos'
    ) {
      if (rightNumeric !== null && rightNumeric >= 0) {
        totalExpensesCell = round2(rightNumeric);
      }
      continue;
    }

    if (
      label.includes('ganancia neta historica') ||
      label.includes('utilidad neta historica') ||
      label === 'ganancia neta' ||
      label === 'utilidad neta'
    ) {
      if (rightNumeric !== null) {
        historicalNetProfitFound = round2(rightNumeric);
      }
      continue;
    }

    if (label.includes('tasa bcv') || label === 'bcv') {
      if (rightNumeric !== null && rightNumeric > 1) {
        bcvRate = round2(rightNumeric);
      }
      continue;
    }

    if (label.includes('tasa usdt') || label.includes('usdt') || label.includes('paralelo')) {
      if (rightNumeric !== null && rightNumeric > 1) {
        usdtRate = round2(rightNumeric);
      }
      continue;
    }

    // Filas con prefijo de tipo: "Inyeccion | Jesus | Capital | 100" o "Gasto | Bolsas | 5" o "CxC | Enyer | 8.50"
    if (
      (label === 'inyeccion' || label === 'aporte' || label === 'capital') &&
      row.length >= firstNonEmptyIdx + 3
    ) {
      const contributor = String(row[firstNonEmptyIdx + 1] ?? '').trim() || 'Socio';
      const concept = String(row[firstNonEmptyIdx + 2] ?? '').trim() || 'Inyección de capital';
      const amt = rightNumeric;
      if (amt !== null && amt > 0) {
        capitalInjections.push({
          id: `inj-xlsx-${r}`,
          contributor,
          concept,
          amount: round2(amt),
          paymentMethod: 'Binance USDT',
          destination: 'cashOnly',
          createdAt: new Date().toISOString(),
        });
      }
      continue;
    }

    if (
      (label === 'gasto' || label === 'gasto operativo' || label === 'egreso') &&
      row.length >= firstNonEmptyIdx + 2
    ) {
      const concept = String(row[firstNonEmptyIdx + 1] ?? '').trim() || 'Gasto operativo';
      const amt = rightNumeric;
      if (amt !== null && amt > 0) {
        operatingExpenses.push({
          id: `exp-xlsx-${r}`,
          concept,
          amount: round2(amt),
          source: 'cashOnHand',
          paymentMethod: 'Binance USDT',
          createdAt: new Date().toISOString(),
        });
      }
      continue;
    }

    if (
      (label === 'cxc' || label === 'cuenta por cobrar' || label === 'deuda') &&
      row.length >= firstNonEmptyIdx + 2
    ) {
      const debtor = String(row[firstNonEmptyIdx + 1] ?? '').trim() || 'Cliente';
      const amt = rightNumeric;
      if (amt !== null && amt > 0) {
        receivables.push({
          id: `rec-xlsx-${r}`,
          debtor,
          amount: round2(amt),
          originalAmount: round2(amt),
          paidAmount: 0,
          createdAt: new Date().toISOString(),
          note: 'Importado desde Excel Finanzas',
        });
      }
    }
  }

  const finalCash = cashFound !== null ? cashFound : DEFAULT_EXCEL_CASH;
  let finalReceivables = receivables;
  if (finalReceivables.length === 0) {
    if (
      totalReceivablesCell === null ||
      Math.abs(totalReceivablesCell - DEFAULT_EXCEL_RECEIVABLES) < 0.01
    ) {
      finalReceivables = INITIAL_RECEIVABLES.map((item) => ({ ...item }));
    } else if (totalReceivablesCell > 0) {
      finalReceivables = [
        {
          id: 'rec-excel-summary',
          debtor: 'Saldo Consolidado CxC (Excel)',
          amount: totalReceivablesCell,
          originalAmount: totalReceivablesCell,
          paidAmount: 0,
          createdAt: new Date().toISOString(),
          note: 'Extraído desde Finanzas - Resumen',
        },
      ];
    }
  }

  let finalInjections = capitalInjections;
  if (finalInjections.length === 0) {
    const injAmt =
      totalInjectionsCell !== null
        ? totalInjectionsCell
        : INITIAL_TOTAL_CAPITAL_INJECTED;
    if (injAmt > 0) {
      finalInjections = [
        {
          ...INITIAL_CAPITAL_INJECTIONS[0],
          amount: injAmt,
        },
      ];
    }
  }

  let finalExpenses = operatingExpenses;
  if (finalExpenses.length === 0) {
    const expAmt =
      totalExpensesCell !== null
        ? totalExpensesCell
        : INITIAL_TOTAL_OPERATING_EXPENSES;
    if (expAmt > 0) {
      finalExpenses = [
        {
          ...INITIAL_OPERATING_EXPENSES[0],
          amount: expAmt,
        },
      ];
    }
  }

  const historicalNetProfit =
    historicalNetProfitFound !== null
      ? historicalNetProfitFound
      : INITIAL_HISTORICAL_NET_PROFIT;

  return {
    cashOnHand: finalCash,
    receivables: finalReceivables,
    capitalInjections: finalInjections,
    operatingExpenses: finalExpenses,
    historicalNetProfit,
    bcvRate,
    usdtRate,
  };
}

/**
 * Motor puro de importación por mapeo automático de columnas:
 * Procesa las pestañas Compras, Ventas (con consumo FIFO cronológico) y Finanzas / Resumen.
 */
export function buildErpStateFromSheets(
  sheetsMap: Record<string, SheetMatrix>,
  options?: ExcelImportOptions,
): ExcelImportResult {
  const sheetNames = Object.keys(sheetsMap);
  if (sheetNames.length === 0) {
    return {
      ok: false,
      error: 'El archivo Excel no contiene hojas legibles.',
    };
  }

  const comprasSheetName = findSheetByPatterns(sheetNames, [
    'compras',
    'compra',
    'inventario',
    'stock',
    'lotes',
    'entradas',
  ]);
  const ventasSheetName = findSheetByPatterns(sheetNames, [
    'ventas',
    'venta',
    'salidas',
    'pedidos',
    'facturas',
  ]);
  const finanzasSheetName = findSheetByPatterns(sheetNames, [
    'finanzas / resumen',
    'finanzas resumen',
    'finanzas',
    'resumen',
    'caja',
    'balance',
  ]);

  if (!comprasSheetName && !ventasSheetName && !finanzasSheetName) {
    return {
      ok: false,
      error:
        'No se encontraron pestañas compatibles ("Compras", "Ventas" o "Finanzas / Resumen") en el archivo Excel.',
    };
  }

  const warnings: string[] = [];

  const comprasParsed = comprasSheetName
    ? parseComprasSheet(sheetsMap[comprasSheetName] ?? [], warnings)
    : { lines: [], mappedLabels: {}, latestUsdtRate: null, latestBcvRate: null };

  const ventasParsed = ventasSheetName
    ? parseVentasSheet(sheetsMap[ventasSheetName] ?? [], warnings)
    : { lines: [], mappedLabels: {} };

  const finanzasParsed = parseFinanzasSheet(
    finanzasSheetName ? (sheetsMap[finanzasSheetName] ?? []) : null,
  );

  // Construir inventario base + capas FIFO desde Compras (orden cronológico)
  const sortedCompras = [...comprasParsed.lines].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const effectiveBcv =
    finanzasParsed.bcvRate ??
    comprasParsed.latestBcvRate ??
    options?.currentBcv ??
    46.5;
  const effectiveUsdt =
    finanzasParsed.usdtRate ??
    comprasParsed.latestUsdtRate ??
    options?.currentUsdt ??
    54.2;
  const hasExcelUsdt =
    finanzasParsed.usdtRate !== null || comprasParsed.latestUsdtRate !== null;

  const inventoryMap = new Map<string, InventoryItem>();
  const purchaseRecords: PurchaseRecord[] = [];
  const batchGroups = new Map<string, ParsedPurchaseLine[]>();

  let totalComprasUnits = 0;
  let totalComprasCost = 0;
  let skuCounter = 1;

  for (let i = 0; i < sortedCompras.length; i++) {
    const line = sortedCompras[i];
    const skuKey = `${normalizeText(line.model)}__${line.version}__${line.size}`;
    const batchId = `fifo-xlsx-${line.date}-${i + 1}`;
    const fifoEntry: FifoBatch = {
      batchId,
      batchName: line.reference,
      entryDate: line.date,
      initialQuantity: line.quantity,
      remainingQuantity: line.quantity,
      unitCost: line.unitCost,
      usdtRate: line.usdtRate ?? effectiveUsdt,
    };

    totalComprasUnits += line.quantity;
    totalComprasCost = round2(totalComprasCost + line.quantity * line.unitCost);

    const existing = inventoryMap.get(skuKey);
    let skuId: string;
    let previousCogs: number | null = null;

    if (existing) {
      skuId = existing.id;
      previousCogs = existing.cogs;
      existing.stock += line.quantity;
      existing.salePrice = line.salePrice;
      existing.fifoBatches.push(fifoEntry);
      existing.fifoBatches.sort((a, b) =>
        a.entryDate.localeCompare(b.entryDate),
      );
      const firstActive = existing.fifoBatches.find((b) => b.remainingQuantity > 0);
      if (firstActive) {
        existing.cogs = round2(firstActive.unitCost);
      }
    } else {
      skuId = `sku-xlsx-${skuCounter++}`;
      inventoryMap.set(skuKey, {
        id: skuId,
        team: inferTeamCategory(line.model),
        model: line.model, // Nombre exacto original
        version: line.version,
        size: line.size,
        stock: line.quantity,
        cogs: round2(line.unitCost),
        salePrice: line.salePrice,
        fifoBatches: [fifoEntry],
      });
    }

    purchaseRecords.unshift({
      id: `pur-xlsx-${i + 1}`,
      skuId,
      team: inferTeamCategory(line.model),
      model: line.model,
      version: line.version,
      size: line.size,
      quantity: line.quantity,
      unitCostWithFreight: round2(line.unitCost),
      totalCost: round2(line.quantity * line.unitCost),
      previousCogs,
      resultingCogs: round2(line.unitCost),
      createdAt: `${line.date}T10:00:00.000Z`,
    });

    const grpKey = `${line.date}__${line.reference}`;
    const grp = batchGroups.get(grpKey) ?? [];
    grp.push(line);
    batchGroups.set(grpKey, grp);
  }

  const purchaseBatches: PurchaseBatchRecord[] = [];
  let batchSeq = 1;
  for (const [grpKey, grpLines] of batchGroups.entries()) {
    const [date, ref] = grpKey.split('__');
    const totalUnits = grpLines.reduce((s, l) => s + l.quantity, 0);
    const totalCost = round2(
      grpLines.reduce((s, l) => s + l.quantity * l.unitCost, 0),
    );
    const batchUsdtRate =
      [...grpLines].reverse().find((l) => l.usdtRate !== null)?.usdtRate ??
      effectiveUsdt;
    purchaseBatches.unshift({
      id: `batch-xlsx-${batchSeq++}`,
      status: 'RECIBIDO EN BODEGA',
      fundingSource: 'cashOnHand',
      entryDate: date,
      receivedDate: date,
      referenceName: ref,
      shippingType: 'Aéreo',
      orderedTotalUnits: totalUnits,
      totalUnits,
      totalFactoryCost: totalCost,
      estimatedFreightCost: 0,
      totalFreightCost: 0,
      freightPerUnit: 0,
      totalLandedCost: totalCost,
      usdtRate: batchUsdtRate,
      items: grpLines.map((l) => ({
        team: inferTeamCategory(l.model),
        model: l.model,
        version: l.version,
        size: l.size,
        orderedQuantity: l.quantity,
        quantity: l.quantity,
        receivedQuantity: l.quantity,
        salePrice: l.salePrice,
        factoryUnitCost: round2(l.unitCost),
        proratedFreightPerUnit: 0,
        landedUnitCost: round2(l.unitCost),
        lineFactoryTotal: round2(l.quantity * l.unitCost),
        lineLandedTotal: round2(l.quantity * l.unitCost),
      })),
      createdAt: `${date}T10:00:00.000Z`,
      receivedAt: `${date}T10:00:00.000Z`,
    });
  }

  // Motor FIFO cronológico sobre Ventas (NO modifica cashOnHand histórico)
  const inventoryList = Array.from(inventoryMap.values());

  const cleanState = createEmptyCleanState(
    finanzasParsed.cashOnHand,
    effectiveBcv,
    effectiveUsdt,
  );

  const salesHistory: SaleRecord[] = [];
  const movements: AuditMovement[] = [];
  let totalUnitsSold = 0;
  let totalRevenue = 0;
  let totalFifoCogs = 0;
  let totalNetProfit = 0;

  for (let i = 0; i < ventasParsed.lines.length; i++) {
    const sale = ventasParsed.lines[i];
    const targetNormModel = normalizeText(sale.model);

    // Buscar SKU exacto (Modelo + Talla + Versión si fue provista)
    const skuIdx = inventoryList.findIndex((item) => {
      const sameModel = normalizeText(item.model) === targetNormModel;
      const sameSize = item.size === sale.size;
      const sameVer = sale.version ? item.version === sale.version : true;
      return sameModel && sameSize && sameVer;
    });

    if (skuIdx < 0) {
      warnings.push(
        `Venta "${sale.model} (${sale.size})" sin coincidencia exacta en Compras; omitida del descuento FIFO.`,
      );
      continue;
    }

    const sku = inventoryList[skuIdx];
    const sellQty = Math.min(sale.quantity, sku.stock);
    if (sale.quantity > sku.stock) {
      warnings.push(
        `Venta de ${sale.quantity} uds de "${sku.model} (${sku.size})" excede el stock comprado disponible (${sku.stock} uds); se descontaron ${sellQty} uds por FIFO.`,
      );
    }

    let lineCogsTotal = 0;
    let effectiveUnitCogs = sku.cogs;
    let consumedDetails:
      | Array<{
          batchId: string;
          batchName: string;
          quantity: number;
          unitCost: number;
          totalCost: number;
        }>
      | undefined;

    if (sellQty > 0) {
      const fifo = previewFifoConsumption(sku, sellQty);
      lineCogsTotal = fifo.totalCost;
      effectiveUnitCogs = fifo.effectiveUnitCogs;
      consumedDetails = fifo.consumedDetails;

      const nextStock = sku.stock - sellQty;
      const nextActiveBatch = fifo.updatedBatches.find(
        (b) => b.remainingQuantity > 0,
      );
      inventoryList[skuIdx] = {
        ...sku,
        stock: nextStock,
        fifoBatches: fifo.updatedBatches,
        cogs: nextActiveBatch ? round2(nextActiveBatch.unitCost) : sku.cogs,
      };
    }

    const resolvedUnitPrice =
      sale.unitPrice ??
      (sale.totalPrice !== null
        ? round2(sale.totalPrice / sale.quantity)
        : sku.salePrice);
    const resolvedFinalPrice =
      sale.totalPrice ?? round2(resolvedUnitPrice * sale.quantity);

    const breakdown = calculateFourLayerMatrixConsolidated(
      resolvedFinalPrice,
      lineCogsTotal,
      sale.seller,
    );

    totalUnitsSold += sellQty;
    totalRevenue = round2(totalRevenue + resolvedFinalPrice);
    totalFifoCogs = round2(totalFifoCogs + lineCogsTotal);
    totalNetProfit = round2(totalNetProfit + breakdown.netProfit);

    cleanState.funds.replacement = round2(
      cleanState.funds.replacement + breakdown.layer1CostRecovery,
    );
    cleanState.funds.commissions = round2(
      cleanState.funds.commissions + breakdown.layer2Commission,
    );
    if (sale.seller !== 'Sin Vendedor') {
      cleanState.funds.commissionsBySeller[sale.seller] = round2(
        cleanState.funds.commissionsBySeller[sale.seller] +
          breakdown.layer2Commission,
      );
    }
    cleanState.funds.operatingAndAds = round2(
      cleanState.funds.operatingAndAds + breakdown.layer3OperatingFund,
    );
    cleanState.funds.growthReinvestment = round2(
      cleanState.funds.growthReinvestment + breakdown.layer4GrowthReinvestment,
    );
    cleanState.funds.dividendsByPartner.Jesús = round2(
      cleanState.funds.dividendsByPartner.Jesús + breakdown.partnerSplits.Jesús,
    );
    cleanState.funds.dividendsByPartner.Josué = round2(
      cleanState.funds.dividendsByPartner.Josué + breakdown.partnerSplits.Josué,
    );
    cleanState.funds.dividendsByPartner.Gabriel = round2(
      cleanState.funds.dividendsByPartner.Gabriel +
        breakdown.partnerSplits.Gabriel,
    );

    const saleIso = `${sale.date}T12:00:00.000Z`;
    const saleRecord: SaleRecord = {
      id: `sale-xlsx-${i + 1}`,
      skuId: sku.id,
      modelLabel: sku.model,
      team: sku.team,
      version: sku.version,
      size: sku.size,
      quantity: sale.quantity,
      unitCogs: effectiveUnitCogs,
      finalPrice: resolvedFinalPrice,
      items: [
        {
          skuId: sku.id,
          modelLabel: sku.model,
          team: sku.team,
          version: sku.version,
          size: sku.size,
          quantity: sale.quantity,
          unitCogs: effectiveUnitCogs,
          totalLineCogs: lineCogsTotal,
          baseUnitPrice: sku.salePrice,
          unitPrice: resolvedUnitPrice,
          subtotal: resolvedFinalPrice,
          fifoConsumed: consumedDetails,
        },
      ],
      customerName: sale.customerName,
      seller: sale.seller,
      paymentStatus: sale.paymentStatus,
      paymentMethod: sale.paymentMethod,
      bcvEquivalent:
        sale.paymentMethod === 'Pago Móvil / Bs'
          ? round2(resolvedFinalPrice * effectiveBcv)
          : undefined,
      debtorName:
        sale.paymentStatus === 'Pendiente' ? sale.customerName : undefined,
      breakdown,
      createdAt: saleIso,
    };

    salesHistory.unshift(saleRecord);
  }

  const nowIso = new Date().toISOString();
  movements.push({
    id: `mov-xlsx-sync-${Date.now()}`,
    type: 'reconciliation',
    description: `Respaldo Excel sincronizado: ${totalComprasUnits} uds compradas, ${totalUnitsSold} uds vendidas (FIFO COGS ${formatUSD(totalFifoCogs)}), Caja ${formatUSD(finanzasParsed.cashOnHand)}`,
    amount: finanzasParsed.cashOnHand,
    createdAt: nowIso,
  });

  const finalState: AppState = {
    ...cleanState,
    cashOnHand: finanzasParsed.cashOnHand,
    exchangeRates: {
      bcv: effectiveBcv,
      usdt: effectiveUsdt,
      updatedAt: nowIso,
      source: hasExcelUsdt ? 'excel' : 'manual',
    },
    inventory: inventoryList,
    receivables: finanzasParsed.receivables,
    collectedReceivablesCount: 0,
    sales: salesHistory,
    purchases: purchaseRecords,
    purchaseBatches,
    operatingExpenses: finanzasParsed.operatingExpenses,
    capitalInjections: finanzasParsed.capitalInjections,
    inventoryAdjustments: [],
    historicalNetProfit: finanzasParsed.historicalNetProfit,
    movements,
  };

  const resultingStockUnits = inventoryList.reduce((s, i) => s + i.stock, 0);
  const receivablesTotal = round2(
    finanzasParsed.receivables.reduce((s, r) => s + r.amount, 0),
  );
  const injectionsTotal = round2(
    finanzasParsed.capitalInjections.reduce((s, inj) => s + inj.amount, 0),
  );
  const expensesTotal = round2(
    finanzasParsed.operatingExpenses.reduce((s, exp) => s + exp.amount, 0),
  );

  return {
    ok: true,
    state: finalState,
    preview: {
      detectedSheets: {
        compras: comprasSheetName,
        ventas: ventasSheetName,
        finanzas: finanzasSheetName,
        allSheets: sheetNames,
      },
      mappedColumns: {
        compras: comprasParsed.mappedLabels,
        ventas: ventasParsed.mappedLabels,
      },
      comprasRowsParsed: sortedCompras.length,
      comprasUnitsTotal: totalComprasUnits,
      comprasCostTotal: totalComprasCost,
      ventasRowsParsed: salesHistory.length,
      ventasUnitsSold: totalUnitsSold,
      ventasRevenueTotal: totalRevenue,
      ventasFifoCogsTotal: totalFifoCogs,
      ventasNetProfitTotal: totalNetProfit,
      resultingStockUnits,
      resultingSkusCount: inventoryList.length,
      cashOnHand: finalState.cashOnHand,
      receivablesTotal,
      receivablesCount: finalState.receivables.length,
      injectionsTotal,
      injectionsCount: finalState.capitalInjections.length,
      expensesTotal,
      expensesCount: finalState.operatingExpenses.length,
      historicalNetProfit: finanzasParsed.historicalNetProfit,
      usdtRate: effectiveUsdt,
      bcvRate: effectiveBcv,
      warnings,
    },
  };
}

/**
 * Lee un archivo .xlsx / .xls / .csv usando SheetJS (xlsx vía CDN) y ejecuta el mapeo automático.
 */
export async function parseExcelFileWithSheetJS(
  file: File,
  options?: ExcelImportOptions,
): Promise<ExcelImportResult> {
  if (typeof window === 'undefined' || !window.XLSX) {
    return {
      ok: false,
      error:
        'La librería SheetJS (xlsx CDN) aún no ha cargado o no está disponible sin conexión.',
    };
  }

  try {
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, {
      type: 'array',
      cellDates: true,
    });
    const sheetsMap: Record<string, SheetMatrix> = {};
    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      sheetsMap[sheetName] = window.XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
        raw: true,
      }) as SheetMatrix;
    }
    return buildErpStateFromSheets(sheetsMap, options);
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `No se pudo leer el archivo Excel: ${err.message}`
          : 'Formato de archivo Excel inválido o dañado.',
    };
  }
}

/**
 * Genera y descarga una plantilla Excel oficial de respaldo compatible con el mapeador 100% USDT.
 */
export function downloadExcelTemplateWithSheetJS(): boolean {
  if (typeof window === 'undefined' || !window.XLSX) return false;
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();

  const comprasAoa = [
    [
      'Fecha',
      'Modelo',
      'Versión',
      'Talla',
      'Cantidad',
      'Costo Unitario (USDT)',
      'Precio de Venta (USDT)',
      'Tasa USDT',
      'Tasa BCV',
      'Referencia / Lote',
    ],
    ['2026-08-15', 'Barcelona Local 25/26', 'Player', 'M', 10, 6.5, 30, 58.5, 46.5, 'Lote Agosto'],
    ['2026-08-15', 'Real Madrid Local 25/26', 'Fan', 'L', 12, 5.6, 25, 58.5, 46.5, 'Lote Agosto'],
    ['2026-11-05', 'Barcelona Retro 08/09', 'Retro', 'XL', 4, 6.8, 32, 61.2, 46.5, 'Lote Noviembre'],
  ];

  const ventasAoa = [
    [
      'Fecha',
      'Modelo',
      'Versión',
      'Talla',
      'Cantidad',
      'Comprador',
      'Vendedor',
      'Total (USDT)',
      'Estado',
      'Método de Pago',
    ],
    ['2026-11-10', 'Barcelona Local 25/26', 'Player', 'M', 2, 'Carlos Pérez', 'Jesús', 60, 'Cobrado', 'Binance USDT'],
    ['2026-11-12', 'Real Madrid Local 25/26', 'Fan', 'L', 1, 'María López', 'Josué', 25, 'Cobrado', 'Efectivo ($)'],
  ];

  const finanzasAoa = [
    ['Concepto / Indicador', 'Valor (USDT / Tasa)'],
    ['Efectivo físico en caja', 120.19],
    ['Cuentas por cobrar', 263.5],
    ['Capital inyectado total', 1912.35],
    ['Gastos operativos totales', 624.0],
    ['Ganancia neta histórica', 317.37],
    ['Tasa USDT', 61.2],
    ['Tasa BCV', 46.5],
    [],
    ['Deudor', 'Nota / Detalle', 'Monto (USDT)', 'Fecha'],
    ['Gabriel', 'Saldo pendiente (USDT)', 150.0, '2026-11-01'],
    ['Charles', 'Saldo pendiente (USDT)', 45.0, '2026-11-02'],
    ['Hermano de Charles', 'Saldo pendiente (USDT)', 20.0, '2026-11-03'],
    ['Suegra', 'Saldo pendiente (USDT)', 20.0, '2026-11-04'],
    ['Jordy', 'Saldo pendiente (USDT)', 10.0, '2026-11-05'],
    ['Barón', 'Saldo pendiente (USDT)', 10.0, '2026-11-06'],
    ['Enyer', 'Saldo pendiente (USDT)', 8.5, '2026-11-07'],
  ];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(comprasAoa), 'Compras');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ventasAoa), 'Ventas');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(finanzasAoa),
    'Finanzas - Resumen',
  );

  if (typeof XLSX.write === 'function') {
    const rawOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const bytes = rawOut instanceof Uint8Array ? rawOut : new Uint8Array(rawOut);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy.buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'X4SPORT-Plantilla-Respaldo.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  XLSX.writeFile(wb, 'X4SPORT-Plantilla-Respaldo.xlsx');
  return true;
}
