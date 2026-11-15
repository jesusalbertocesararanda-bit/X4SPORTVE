import type {
  AppState,
  InventoryItem,
  JerseyVersion,
  ReceivableItem,
} from '../types/erp';

export const PARTNER_SHARES = {
  Jesús: 0.5365,
  Josué: 0.4043,
  Gabriel: 0.0592,
} as const;

export const INITIAL_CASH_ON_HAND = 120.19;

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
  { id: 'rec-3', debtor: 'Enyer', amount: 8.5, createdAt: '2026-11-03T14:15:00.000Z', note: 'Restante camiseta' },
  { id: 'rec-4', debtor: 'Suegra', amount: 20.0, createdAt: '2026-11-04T09:45:00.000Z', note: 'Saldo inicial pendiente' },
  { id: 'rec-5', debtor: 'Jordy', amount: 20.0, createdAt: '2026-11-05T16:20:00.000Z', note: 'Saldo inicial pendiente' },
  { id: 'rec-6', debtor: 'Gabriel', amount: 150.0, createdAt: '2026-11-06T18:00:00.000Z', note: 'Cuenta por cobrar lote' },
  { id: 'rec-7', debtor: 'Amigo de Josué', amount: 20.0, createdAt: '2026-11-07T12:10:00.000Z', note: 'Saldo inicial pendiente' },
  { id: 'rec-8', debtor: 'Charles', amount: 45.0, createdAt: '2026-11-08T15:00:00.000Z', note: 'Saldo inicial pendiente' },
];

type RawSeedItem = Omit<InventoryItem, 'fifoBatches' | 'salePrice'>;

const RAW_INITIAL_INVENTORY: RawSeedItem[] = [
  // Barcelona (40 unidades)
  { id: 'sku-fcb-1', team: 'Barcelona', model: 'Barcelona Local 25/26', version: 'Player', size: 'M', stock: 10, cogs: 6.5 },
  { id: 'sku-fcb-2', team: 'Barcelona', model: 'Barcelona Local 25/26', version: 'Player', size: 'L', stock: 8, cogs: 6.5 },
  { id: 'sku-fcb-3', team: 'Barcelona', model: 'Barcelona Local 25/26', version: 'Fan', size: 'M', stock: 12, cogs: 5.6 },
  { id: 'sku-fcb-4', team: 'Barcelona', model: 'Barcelona Visitante Negra', version: 'Fan', size: 'L', stock: 8, cogs: 5.8 },
  { id: 'sku-fcb-5', team: 'Barcelona', model: 'Barcelona Retro 08/09', version: 'Player', size: 'XL', stock: 2, cogs: 6.8 },

  // Real Madrid (42 unidades)
  { id: 'sku-rma-1', team: 'Real Madrid', model: 'Real Madrid Local 25/26', version: 'Player', size: 'M', stock: 11, cogs: 6.6 },
  { id: 'sku-rma-2', team: 'Real Madrid', model: 'Real Madrid Local 25/26', version: 'Player', size: 'L', stock: 9, cogs: 6.6 },
  { id: 'sku-rma-3', team: 'Real Madrid', model: 'Real Madrid Local 25/26', version: 'Fan', size: 'S', stock: 7, cogs: 5.5 },
  { id: 'sku-rma-4', team: 'Real Madrid', model: 'Real Madrid Visitante Naranja', version: 'Fan', size: 'M', stock: 10, cogs: 5.75 },
  { id: 'sku-rma-5', team: 'Real Madrid', model: 'Real Madrid Tercera Carbón', version: 'Player', size: 'XL', stock: 5, cogs: 6.75 },

  // Manchester City (28 unidades)
  { id: 'sku-mci-1', team: 'Manchester City', model: 'Manchester City Local 25/26', version: 'Player', size: 'M', stock: 8, cogs: 6.4 },
  { id: 'sku-mci-2', team: 'Manchester City', model: 'Manchester City Local 25/26', version: 'Fan', size: 'L', stock: 10, cogs: 5.65 },
  { id: 'sku-mci-3', team: 'Manchester City', model: 'Manchester City Visitante', version: 'Player', size: 'S', stock: 2, cogs: 6.45 },
  { id: 'sku-mci-4', team: 'Manchester City', model: 'Manchester City Cuarta Edición', version: 'Fan', size: 'XL', stock: 8, cogs: 5.9 },

  // PSG (26 unidades)
  { id: 'sku-psg-1', team: 'PSG', model: 'PSG Local 25/26', version: 'Player', size: 'M', stock: 9, cogs: 6.55 },
  { id: 'sku-psg-2', team: 'PSG', model: 'PSG Local 25/26', version: 'Fan', size: 'L', stock: 10, cogs: 5.7 },
  { id: 'sku-psg-3', team: 'PSG', model: 'PSG Visitante Jordan', version: 'Player', size: 'L', stock: 6, cogs: 6.7 },
  { id: 'sku-psg-4', team: 'PSG', model: 'PSG Tercera Edición', version: 'Fan', size: 'M', stock: 1, cogs: 5.85 },

  // Selecciones (40 unidades)
  { id: 'sku-sel-1', team: 'Selecciones', model: 'Selección Argentina Campeón', version: 'Player', size: 'M', stock: 10, cogs: 6.7 },
  { id: 'sku-sel-2', team: 'Selecciones', model: 'Selección Argentina Campeón', version: 'Fan', size: 'L', stock: 8, cogs: 5.8 },
  { id: 'sku-sel-3', team: 'Selecciones', model: 'Selección Venezuela Vinotinto', version: 'Player', size: 'M', stock: 10, cogs: 6.5 },
  { id: 'sku-sel-4', team: 'Selecciones', model: 'Selección Venezuela Vinotinto', version: 'Fan', size: 'XL', stock: 6, cogs: 5.6 },
  { id: 'sku-sel-5', team: 'Selecciones', model: 'Selección España Euro', version: 'Fan', size: 'M', stock: 4, cogs: 5.75 },
  { id: 'sku-sel-6', team: 'Selecciones', model: 'Selección Brasil Copa', version: 'Player', size: 'L', stock: 2, cogs: 6.65 },
];

export const INITIAL_INVENTORY: InventoryItem[] = RAW_INITIAL_INVENTORY.map((item) => ({
  ...item,
  salePrice: getDefaultSalePrice(item.version, item.model),
  fifoBatches: [
    {
      batchId: `fifo-init-${item.id}`,
      batchName: 'Inventario Inicial',
      entryDate: '2026-11-01',
      initialQuantity: item.stock,
      remainingQuantity: item.stock,
      unitCost: item.cogs,
    },
  ],
}));

export function createInitialState(): AppState {
  return {
    cashOnHand: INITIAL_CASH_ON_HAND,
    exchangeRates: {
      bcv: 46.5,
      usdt: 54.2,
      updatedAt: new Date().toISOString(),
      source: 'seed',
    },
    inventory: INITIAL_INVENTORY.map((item) => ({
      ...item,
      fifoBatches: item.fifoBatches.map((b) => ({ ...b })),
    })),
    receivables: INITIAL_RECEIVABLES.map((item) => ({ ...item })),
    collectedReceivablesCount: 0,
    sales: [],
    purchases: [],
    purchaseBatches: [],
    operatingExpenses: [],
    capitalInjections: [],
    inventoryAdjustments: [],
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
  };
}

export function createEmptyCleanState(
  cashOnHand = 0,
  bcv = 46.5,
  usdt = 54.2,
): AppState {
  return {
    cashOnHand,
    exchangeRates: {
      bcv,
      usdt,
      updatedAt: new Date().toISOString(),
      source: 'seed',
    },
    inventory: [],
    receivables: [],
    collectedReceivablesCount: 0,
    sales: [],
    purchases: [],
    purchaseBatches: [],
    operatingExpenses: [],
    capitalInjections: [],
    inventoryAdjustments: [],
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
  };
}

