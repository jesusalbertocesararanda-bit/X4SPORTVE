export type TabId =
  | 'dashboard'
  | 'ventas'
  | 'inventario'
  | 'auditoria'
  | 'compras'
  | 'finanzas'
  | 'estadisticas';

export type TeamCategory =
  | 'Barcelona'
  | 'Real Madrid'
  | 'Manchester City'
  | 'PSG'
  | 'Selecciones'
  | 'Otro';

export type JerseyVersion = 'Player' | 'Fan' | 'Retro';
export type JerseySize = 'S' | 'M' | 'L' | 'XL';

export type SellerName = 'Jesús' | 'Josué' | 'Gabriel' | 'Sin Vendedor';
export type PartnerName = 'Jesús' | 'Josué' | 'Gabriel';
export type PaymentStatus = 'Cobrado' | 'Pendiente';
export type PaymentMethod =
  | 'Efectivo ($)'
  | 'Binance USDT'
  | 'Zelle'
  | 'Pago Móvil / Bs'
  | 'Pago Mixto';

export type SinglePaymentMethod = Exclude<PaymentMethod, 'Pago Mixto'>;

export interface PaymentSplit {
  method: SinglePaymentMethod;
  amountUsd: number;
  bcvEquivalent?: number;
}

export type ShippingType = 'Aéreo' | 'Marítimo';

export interface FifoBatch {
  batchId: string;
  batchName: string;
  entryDate: string; // YYYY-MM-DD
  initialQuantity: number;
  remainingQuantity: number;
  unitCost: number; // Landed unit cost exact of this batch
}

export interface InventoryItem {
  id: string;
  team: TeamCategory;
  model: string;
  version: JerseyVersion;
  size: JerseySize;
  stock: number;
  cogs: number; // Next active FIFO unit cost (or weighted avg display)
  salePrice: number; // Retail unit price in USD / USDT
  fifoBatches: FifoBatch[];
}

export interface ReceivableInstallment {
  id: string;
  amount: number;
  paymentMethod: PaymentMethod;
  createdAt: string;
}

export interface ReceivableItem {
  id: string;
  debtor: string;
  amount: number;
  originalAmount?: number;
  paidAmount?: number;
  installments?: ReceivableInstallment[];
  createdAt: string;
  note?: string;
  saleId?: string;
  paymentMethod?: PaymentMethod;
}

export interface FourLayerBreakdown {
  grossRevenue: number;
  layer1CostRecovery: number;
  layer2Commission: number;
  netProfit: number;
  layer3OperatingFund: number;
  remainingNetProfit: number;
  layer4GrowthReinvestment: number;
  layer4TotalDividends: number;
  partnerSplits: Record<PartnerName, number>;
}

export interface FifoConsumptionDetail {
  batchId: string;
  batchName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface SaleLineItem {
  skuId: string;
  modelLabel: string;
  team: TeamCategory;
  version: JerseyVersion;
  size: JerseySize;
  quantity: number;
  unitCogs: number; // Weighted effective COGS from consumed FIFO layers
  totalLineCogs: number;
  baseUnitPrice?: number;
  discountLabel?: string;
  unitPrice: number;
  subtotal: number;
  fifoConsumed?: FifoConsumptionDetail[];
}

export interface SaleRecord {
  id: string;
  skuId: string;
  modelLabel: string;
  team: TeamCategory;
  version: JerseyVersion;
  size: JerseySize;
  quantity: number;
  unitCogs: number;
  finalPrice: number;
  items?: SaleLineItem[];
  customerName: string;
  seller: SellerName;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paymentSplits?: PaymentSplit[];
  bcvEquivalent?: number;
  debtorName?: string;
  breakdown: FourLayerBreakdown;
  createdAt: string;
}

export type PurchaseBatchStatus = 'EN TRÁNSITO' | 'RECIBIDO EN BODEGA';
export type PurchaseFundingSource = 'cashOnHand' | 'growthReinvestment';

export interface PurchaseBatchItemRecord {
  skuId?: string;
  team: TeamCategory;
  model: string;
  version: JerseyVersion;
  size: JerseySize;
  orderedQuantity: number;
  quantity: number;
  receivedQuantity?: number;
  salePrice?: number;
  factoryUnitCost: number;
  proratedFreightPerUnit: number;
  landedUnitCost: number;
  lineFactoryTotal: number;
  lineLandedTotal: number;
}

export interface PurchaseBatchRecord {
  id: string;
  status: PurchaseBatchStatus;
  fundingSource: PurchaseFundingSource;
  entryDate: string; // Order date (YYYY-MM-DD)
  receivedDate?: string; // Warehouse arrival date for FIFO (YYYY-MM-DD)
  referenceName: string;
  shippingType: ShippingType;
  orderedTotalUnits: number;
  totalUnits: number;
  totalFactoryCost: number;
  estimatedFreightCost: number;
  totalFreightCost: number;
  freightAdjustment?: number;
  freightPerUnit: number;
  totalLandedCost: number;
  items: PurchaseBatchItemRecord[];
  createdAt: string;
  receivedAt?: string;
}

export interface PurchaseRecord {
  id: string;
  skuId: string;
  team: TeamCategory;
  model: string;
  version: JerseyVersion;
  size: JerseySize;
  quantity: number;
  unitCostWithFreight: number;
  totalCost: number;
  previousCogs: number | null;
  resultingCogs: number;
  createdAt: string;
}

export interface ExchangeRates {
  bcv: number;
  usdt: number;
  updatedAt: string;
  source?: 'api' | 'manual' | 'seed';
}

export interface OperatingExpenseRecord {
  id: string;
  concept: string;
  amount: number;
  source: 'operatingFund' | 'cashOnHand';
  paymentMethod: SinglePaymentMethod;
  createdAt: string;
}

export interface InventoryAdjustmentRecord {
  id: string;
  skuId: string;
  modelLabel: string;
  version: JerseyVersion;
  size: JerseySize;
  previousStock: number;
  newStock: number;
  delta: number;
  fifoLossCost?: number;
  auditMode?: 'cascade' | 'sku' | 'manual';
  reason: string;
  createdAt: string;
}

export interface FinancialFunds {
  replacement: number;
  commissions: number;
  commissionsBySeller: Record<PartnerName, number>;
  operatingAndAds: number;
  growthReinvestment: number;
  dividendsByPartner: Record<PartnerName, number>;
  reinvestedFromDividendsTotal: number;
}

export type CapitalInjectionDestination =
  | 'cashOnly'
  | 'operatingFund'
  | 'growthReinvestment';

export interface CapitalInjectionRecord {
  id: string;
  contributor: string;
  concept: string;
  amount: number;
  paymentMethod: SinglePaymentMethod;
  destination: CapitalInjectionDestination;
  createdAt: string;
}

export interface AuditMovement {
  id: string;
  type:
    | 'sale'
    | 'purchase'
    | 'collection'
    | 'reinvestment'
    | 'expense'
    | 'adjustment'
    | 'capital_injection'
    | 'reconciliation';
  description: string;
  amount: number;
  createdAt: string;
}

export interface AppState {
  cashOnHand: number;
  exchangeRates: ExchangeRates;
  inventory: InventoryItem[];
  receivables: ReceivableItem[];
  collectedReceivablesCount: number;
  sales: SaleRecord[];
  purchases: PurchaseRecord[];
  purchaseBatches: PurchaseBatchRecord[];
  operatingExpenses: OperatingExpenseRecord[];
  capitalInjections: CapitalInjectionRecord[];
  inventoryAdjustments: InventoryAdjustmentRecord[];
  funds: FinancialFunds;
  movements: AuditMovement[];
}
