import type {
  AppState,
  CapitalInjectionRecord,
  InventoryItem,
  JerseyVersion,
  OperatingExpenseRecord,
  ReceivableItem,
} from '../types/erp';

export const PARTNER_SHARES = {
  Jesús: 0.5365,
  Josué: 0.4043,
  Gabriel: 0.0592,
} as const;

export const INITIAL_CASH_ON_HAND = 135.19;
export const INITIAL_TOTAL_CAPITAL_INJECTED = 1912.35;
export const INITIAL_TOTAL_OPERATING_EXPENSES = 624.0;
export const INITIAL_HISTORICAL_NET_PROFIT = 317.37;

export function getDefaultSalePrice(
  version: JerseyVersion,
  model?: string,
): number {
  const isRetroModel = model?.toLowerCase().includes('retro') ?? false;
  if (version === 'Retro' || isRetroModel) return 32.0;
  if (version === 'Player') return 30.0;
  return 25.0;
}

export const INITIAL_RECEIVABLES: ReceivableItem[] = [
  { id: 'rec-gabriel', debtor: 'Gabriel', amount: 150.0, originalAmount: 150.0, paidAmount: 0, createdAt: '2026-11-01T12:00:00.000Z', note: 'Saldo pendiente (USDT)' },
  { id: 'rec-charles', debtor: 'Charles', amount: 45.0, originalAmount: 45.0, paidAmount: 0, createdAt: '2026-11-02T12:00:00.000Z', note: 'Saldo pendiente (USDT)' },
  { id: 'rec-hermano-charles', debtor: 'Hermano de Charles', amount: 20.0, originalAmount: 20.0, paidAmount: 0, createdAt: '2026-11-03T12:00:00.000Z', note: 'Saldo pendiente (USDT)' },
  { id: 'rec-suegra', debtor: 'Suegra', amount: 20.0, originalAmount: 20.0, paidAmount: 0, createdAt: '2026-11-04T12:00:00.000Z', note: 'Saldo pendiente (USDT)' },
  { id: 'rec-jordy', debtor: 'Jordy', amount: 10.0, originalAmount: 10.0, paidAmount: 0, createdAt: '2026-11-05T12:00:00.000Z', note: 'Saldo pendiente (USDT)' },
  { id: 'rec-baron', debtor: 'Barón', amount: 10.0, originalAmount: 10.0, paidAmount: 0, createdAt: '2026-11-06T12:00:00.000Z', note: 'Saldo pendiente (USDT)' },
  { id: 'rec-enyer', debtor: 'Enyer', amount: 8.5, originalAmount: 8.5, paidAmount: 0, createdAt: '2026-11-07T12:00:00.000Z', note: 'Saldo pendiente (USDT)' },
];

export const INITIAL_CAPITAL_INJECTIONS: CapitalInjectionRecord[] = [
  {
    id: 'inj-hist-base',
    contributor: 'Socios X4SPORT',
    concept: 'Capital inyectado total histórico acumulado',
    amount: INITIAL_TOTAL_CAPITAL_INJECTED,
    paymentMethod: 'Binance USDT',
    destination: 'cashOnly',
    createdAt: '2026-11-01T10:00:00.000Z',
  },
];

export const INITIAL_OPERATING_EXPENSES: OperatingExpenseRecord[] = [
  {
    id: 'exp-hist-base',
    concept: 'Gastos operativos totales históricos acumulados',
    amount: INITIAL_TOTAL_OPERATING_EXPENSES,
    source: 'cashOnHand',
    paymentMethod: 'Binance USDT',
    createdAt: '2026-11-01T10:00:00.000Z',
  },
];

type RawSeedItem = Omit<InventoryItem, 'fifoBatches' | 'salePrice'>;

const RAW_DEMO_INVENTORY: RawSeedItem[] = [
  // Barcelona (40 unidades - solo demo/pruebas)
  { id: 'sku-fcb-1', team: 'Barcelona', model: 'Barcelona Local 25/26', version: 'Player', size: 'M', stock: 10, cogs: 6.5 },
  { id: 'sku-fcb-2', team: 'Barcelona', model: 'Barcelona Local 25/26', version: 'Player', size: 'L', stock: 8, cogs: 6.5 },
  { id: 'sku-fcb-3', team: 'Barcelona', model: 'Barcelona Local 25/26', version: 'Fans', size: 'M', stock: 12, cogs: 5.6 },
  { id: 'sku-fcb-4', team: 'Barcelona', model: 'Barcelona Visitante Negra', version: 'Fans', size: 'L', stock: 8, cogs: 5.8 },
  { id: 'sku-fcb-5', team: 'Barcelona', model: 'Barcelona Retro 08/09', version: 'Player', size: 'XL', stock: 2, cogs: 6.8 },

  // Real Madrid (42 unidades - solo demo/pruebas)
  { id: 'sku-rma-1', team: 'Real Madrid', model: 'Real Madrid Local 25/26', version: 'Player', size: 'M', stock: 11, cogs: 6.6 },
  { id: 'sku-rma-2', team: 'Real Madrid', model: 'Real Madrid Local 25/26', version: 'Player', size: 'L', stock: 9, cogs: 6.6 },
  { id: 'sku-rma-3', team: 'Real Madrid', model: 'Real Madrid Local 25/26', version: 'Fans', size: 'S', stock: 7, cogs: 5.5 },
  { id: 'sku-rma-4', team: 'Real Madrid', model: 'Real Madrid Visitante Naranja', version: 'Fans', size: 'M', stock: 10, cogs: 5.75 },
  { id: 'sku-rma-5', team: 'Real Madrid', model: 'Real Madrid Tercera Carbón', version: 'Player', size: 'XL', stock: 5, cogs: 6.75 },

  // Manchester City (28 unidades - solo demo/pruebas)
  { id: 'sku-mci-1', team: 'Manchester City', model: 'Manchester City Local 25/26', version: 'Player', size: 'M', stock: 8, cogs: 6.4 },
  { id: 'sku-mci-2', team: 'Manchester City', model: 'Manchester City Local 25/26', version: 'Fans', size: 'L', stock: 10, cogs: 5.65 },
  { id: 'sku-mci-3', team: 'Manchester City', model: 'Manchester City Visitante', version: 'Player', size: 'S', stock: 2, cogs: 6.45 },
  { id: 'sku-mci-4', team: 'Manchester City', model: 'Manchester City Cuarta Edición', version: 'Fans', size: 'XL', stock: 8, cogs: 5.9 },

  // PSG (26 unidades - solo demo/pruebas)
  { id: 'sku-psg-1', team: 'PSG', model: 'PSG Local 25/26', version: 'Player', size: 'M', stock: 9, cogs: 6.55 },
  { id: 'sku-psg-2', team: 'PSG', model: 'PSG Local 25/26', version: 'Fans', size: 'L', stock: 10, cogs: 5.7 },
  { id: 'sku-psg-3', team: 'PSG', model: 'PSG Visitante Jordan', version: 'Player', size: 'L', stock: 6, cogs: 6.7 },
  { id: 'sku-psg-4', team: 'PSG', model: 'PSG Tercera Edición', version: 'Fans', size: 'M', stock: 1, cogs: 5.85 },

  // Selecciones (40 unidades - solo demo/pruebas)
  { id: 'sku-sel-1', team: 'Selecciones', model: 'Selección Argentina Campeón', version: 'Player', size: 'M', stock: 10, cogs: 6.7 },
  { id: 'sku-sel-2', team: 'Selecciones', model: 'Selección Argentina Campeón', version: 'Fans', size: 'L', stock: 8, cogs: 5.8 },
  { id: 'sku-sel-3', team: 'Selecciones', model: 'Selección Venezuela Vinotinto', version: 'Player', size: 'M', stock: 10, cogs: 6.5 },
  { id: 'sku-sel-4', team: 'Selecciones', model: 'Selección Venezuela Vinotinto', version: 'Fans', size: 'XL', stock: 6, cogs: 5.6 },
  { id: 'sku-sel-5', team: 'Selecciones', model: 'Selección España Euro', version: 'Fans', size: 'M', stock: 4, cogs: 5.75 },
  { id: 'sku-sel-6', team: 'Selecciones', model: 'Selección Brasil Copa', version: 'Player', size: 'L', stock: 2, cogs: 6.65 },
];

export const DEMO_INVENTORY_IDS = new Set(RAW_DEMO_INVENTORY.map((i) => i.id));

export const INITIAL_INVENTORY: InventoryItem[] = RAW_DEMO_INVENTORY.map((item) => ({
  ...item,
  salePrice: getDefaultSalePrice(item.version, item.model),
  fifoBatches: [
    {
      batchId: `fifo-init-${item.id}`,
      batchName: 'Inventario Inicial Demo',
      entryDate: '2026-11-01',
      initialQuantity: item.stock,
      remainingQuantity: item.stock,
      unitCost: item.cogs,
    },
  ],
}));

/**
 * Estado base oficial sin ítems de prueba genéricos:
 * $135.19 USDT caja, 7 deudores reales ($263.50 USDT),
 * $1,912.35 capital inyectado, $624.00 gastos y $317.37 ganancia neta histórica.
 */
export function createInitialState(): AppState {
  return {
    cashOnHand: INITIAL_CASH_ON_HAND,
    exchangeRates: {
      bcv: 46.5,
      usdt: 54.2,
      updatedAt: new Date().toISOString(),
      source: 'seed',
    },
    inventory: [],
    receivables: INITIAL_RECEIVABLES.map((item) => ({ ...item })),
    collectedReceivablesCount: 0,
    sales: [],
    nextInvoiceSeq: 1,
    returns: [],
    purchases: [],
    purchaseBatches: [],
    operatingExpenses: INITIAL_OPERATING_EXPENSES.map((item) => ({ ...item })),
    capitalInjections: INITIAL_CAPITAL_INJECTIONS.map((item) => ({ ...item })),
    inventoryAdjustments: [],
    historicalNetProfit: INITIAL_HISTORICAL_NET_PROFIT,
    funds: {
      replacement: 0,
      commissions: 0,
      commissionsBySeller: {
        Jesús: 0,
        Josué: 0,
        Gabriel: 0,
      },
      operatingAndAds: 0,
      growthReinvestment: 0,
      dividendsByPartner: {
        Jesús: 0,
        Josué: 0,
        Gabriel: 0,
      },
      reinvestedFromDividendsTotal: 0,
    },
    movements: [],
    catalogEnabled: true,
  };
}

/**
 * Catálogo de demostración explícito (176 unidades) — solo se usa si el usuario
 * pulsa manualmente "Restaurar Catálogo Demo" o en pruebas unitarias.
 */
export function createDemoSeedState(): AppState {
  return {
    ...createInitialState(),
    isExplicitDemo: true,
    inventory: INITIAL_INVENTORY.map((item) => ({
      ...item,
      fifoBatches: item.fifoBatches.map((b) => ({ ...b })),
    })),
  };
}

export function createEmptyCleanState(
  cashOnHand = INITIAL_CASH_ON_HAND,
  bcv = 46.5,
  usdt = 54.2,
): AppState {
  return {
    ...createInitialState(),
    cashOnHand,
    exchangeRates: {
      bcv,
      usdt,
      updatedAt: new Date().toISOString(),
      source: 'seed',
    },
  };
}


