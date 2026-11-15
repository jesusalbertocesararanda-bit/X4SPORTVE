import {
  createInitialState,
  getDefaultSalePrice,
  PARTNER_SHARES,
} from '../data/initialState';
import type {
  AppState,
  AuditMovement,
  CapitalInjectionDestination,
  CapitalInjectionRecord,
  FifoBatch,
  FifoConsumptionDetail,
  FourLayerBreakdown,
  InventoryAdjustmentRecord,
  InventoryItem,
  JerseySize,
  JerseyVersion,
  OperatingExpenseRecord,
  PartnerName,
  PaymentMethod,
  PaymentSplit,
  PaymentStatus,
  PurchaseBatchItemRecord,
  PurchaseBatchRecord,
  PurchaseFundingSource,
  PurchaseRecord,
  ReceivableInstallment,
  ReceivableItem,
  SaleLineItem,
  SaleRecord,
  SellerName,
  ShippingType,
  SinglePaymentMethod,
  TeamCategory,
} from '../types/erp';

export const WHOLESALE_DISCOUNT_PCT = 20;

export type PricingAdjustMode =
  | 'normal'
  | 'wholesale'
  | 'discount_pct'
  | 'discount_usd'
  | 'manual';

export function calculateDiscountedUnitPrice(
  basePrice: number,
  mode: PricingAdjustMode,
  adjustValue = 0,
): { unitPrice: number; discountLabel?: string } {
  const safeBase = round2(Math.max(0.01, basePrice));
  if (mode === 'wholesale') {
    const unitPrice = round2(
      Math.max(0.01, safeBase * (1 - WHOLESALE_DISCOUNT_PCT / 100)),
    );
    return {
      unitPrice,
      discountLabel: `Al Mayor (-${WHOLESALE_DISCOUNT_PCT}%)`,
    };
  }
  if (mode === 'discount_pct') {
    const pct = Math.min(99, Math.max(0, round2(adjustValue)));
    const unitPrice = round2(Math.max(0.01, safeBase * (1 - pct / 100)));
    return {
      unitPrice,
      discountLabel: pct > 0 ? `Rebaja -${pct}%` : undefined,
    };
  }
  if (mode === 'discount_usd') {
    const usdOff = Math.max(0, round2(adjustValue));
    const unitPrice = round2(Math.max(0.01, safeBase - usdOff));
    return {
      unitPrice,
      discountLabel: usdOff > 0 ? `Rebaja -${formatUSD(usdOff)}` : undefined,
    };
  }
  return { unitPrice: safeBase };
}

export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function formatUSD(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function formatVES(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `Bs. ${new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe)}`;
}

export function getTotalUnits(state: AppState): number {
  return state.inventory.reduce((sum, item) => sum + item.stock, 0);
}

export function getTotalInventoryCostValue(state: AppState): number {
  return round2(
    state.inventory.reduce((sum, item) => {
      if (item.fifoBatches && item.fifoBatches.length > 0) {
        return (
          sum +
          item.fifoBatches.reduce(
            (bSum, b) => bSum + b.remainingQuantity * b.unitCost,
            0,
          )
        );
      }
      return sum + item.stock * item.cogs;
    }, 0),
  );
}

export function getTotalReceivables(state: AppState): number {
  return round2(state.receivables.reduce((sum, item) => sum + item.amount, 0));
}

export function getLowStockItems(state: AppState, threshold = 2) {
  return state.inventory
    .filter((item) => item.stock <= threshold)
    .sort((a, b) => a.stock - b.stock || a.model.localeCompare(b.model));
}

export function getNextFifoUnitCost(item: InventoryItem): number {
  if (!item.fifoBatches || item.fifoBatches.length === 0) return item.cogs;
  const sorted = [...item.fifoBatches]
    .filter((b) => b.remainingQuantity > 0)
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  return sorted.length > 0 ? round2(sorted[0].unitCost) : item.cogs;
}

/**
 * Simulates or executes FIFO consumption across chronological batches for a SKU.
 * Oldest entryDate batches are consumed first.
 */
export function previewFifoConsumption(
  item: InventoryItem,
  quantityToSell: number,
): {
  totalCost: number;
  effectiveUnitCogs: number;
  consumedDetails: FifoConsumptionDetail[];
  updatedBatches: FifoBatch[];
} {
  const batches: FifoBatch[] =
    item.fifoBatches && item.fifoBatches.length > 0
      ? item.fifoBatches.map((b) => ({ ...b }))
      : [
          {
            batchId: `fifo-legacy-${item.id}`,
            batchName: 'Lote Base',
            entryDate: '2026-11-01',
            initialQuantity: item.stock,
            remainingQuantity: item.stock,
            unitCost: item.cogs,
          },
        ];

  // Sort chronological order (stable by original order if entryDate ties)
  const indexed = batches.map((b, idx) => ({ b, idx }));
  indexed.sort((a, b) => {
    const cmp = a.b.entryDate.localeCompare(b.b.entryDate);
    return cmp !== 0 ? cmp : a.idx - b.idx;
  });

  let remainingToTake = quantityToSell;
  let totalCostRaw = 0;
  const consumedDetails: FifoConsumptionDetail[] = [];

  for (const entry of indexed) {
    if (remainingToTake <= 0) break;
    const batch = entry.b;
    if (batch.remainingQuantity <= 0) continue;

    const take = Math.min(batch.remainingQuantity, remainingToTake);
    batch.remainingQuantity -= take;
    remainingToTake -= take;

    const lineCost = round2(take * batch.unitCost);
    totalCostRaw += take * batch.unitCost;

    consumedDetails.push({
      batchId: batch.batchId,
      batchName: batch.batchName,
      quantity: take,
      unitCost: round2(batch.unitCost),
      totalCost: lineCost,
    });
  }

  const totalCost = round2(totalCostRaw);
  const effectiveUnitCogs =
    quantityToSell > 0 ? round2(totalCost / quantityToSell) : item.cogs;

  // Keep batches in chronological order, retaining history or active batches
  const updatedBatches = indexed.map((entry) => entry.b);

  return {
    totalCost,
    effectiveUnitCogs,
    consumedDetails,
    updatedBatches,
  };
}

export function calculateFourLayerMatrixConsolidated(
  finalSalePrice: number,
  totalBaseCost: number,
  seller: SellerName,
): FourLayerBreakdown {
  const grossRevenue = round2(Math.max(0, finalSalePrice));
  const rawCostRecovery = round2(Math.max(0, totalBaseCost));

  const layer1CostRecovery = round2(Math.min(grossRevenue, rawCostRecovery));

  const rawCommission =
    seller !== 'Sin Vendedor' ? round2(grossRevenue * 0.04) : 0;
  const maxAvailableAfterCost = round2(
    Math.max(0, grossRevenue - layer1CostRecovery),
  );
  const layer2Commission = round2(Math.min(rawCommission, maxAvailableAfterCost));

  const netProfit = round2(
    Math.max(0, grossRevenue - layer1CostRecovery - layer2Commission),
  );

  const layer3OperatingFund = round2(netProfit * 0.1);
  const remainingNetProfit = round2(netProfit - layer3OperatingFund);

  const layer4GrowthReinvestment = round2(remainingNetProfit * 0.8);
  const layer4TotalDividends = round2(
    remainingNetProfit - layer4GrowthReinvestment,
  );

  const jesus = round2(layer4TotalDividends * PARTNER_SHARES.Jesús);
  const josue = round2(layer4TotalDividends * PARTNER_SHARES.Josué);
  const gabriel = round2(Math.max(0, layer4TotalDividends - jesus - josue));

  return {
    grossRevenue,
    layer1CostRecovery,
    layer2Commission,
    netProfit,
    layer3OperatingFund,
    remainingNetProfit,
    layer4GrowthReinvestment,
    layer4TotalDividends,
    partnerSplits: {
      Jesús: jesus,
      Josué: josue,
      Gabriel: gabriel,
    },
  };
}

export function calculateFourLayerMatrix(
  finalSalePrice: number,
  unitCogs: number,
  quantity: number,
  seller: SellerName,
): FourLayerBreakdown {
  const rawCostRecovery = round2(Math.max(0, unitCogs) * Math.max(0, quantity));
  return calculateFourLayerMatrixConsolidated(
    finalSalePrice,
    rawCostRecovery,
    seller,
  );
}

export interface CartSaleItemInput {
  skuId: string;
  quantity: number;
  unitPrice: number;
  baseUnitPrice?: number;
  discountLabel?: string;
}

export interface RegisterMultiSaleInput {
  items: CartSaleItemInput[];
  customerName: string;
  seller: SellerName;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
  paymentSplits?: PaymentSplit[];
  debtorName?: string;
}

export interface RegisterSaleInput {
  skuId: string;
  quantity: number;
  finalPrice: number;
  customerName?: string;
  seller: SellerName;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
  paymentSplits?: PaymentSplit[];
  debtorName?: string;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  state: AppState;
}

export function registerMultiItemSale(
  state: AppState,
  input: RegisterMultiSaleInput,
): ActionResult {
  if (!input.items || input.items.length === 0) {
    return {
      ok: false,
      error: 'Agrega al menos un producto al carrito antes de registrar la venta.',
      state,
    };
  }

  const cleanCustomer = input.customerName?.trim() ?? '';
  if (cleanCustomer.length === 0) {
    return {
      ok: false,
      error: 'Ingresa el Nombre del Cliente para asociar el ticket de venta.',
      state,
    };
  }

  const cleanDebtor = (input.debtorName?.trim() || cleanCustomer).trim();
  const paymentMethod: PaymentMethod = input.paymentMethod ?? 'Efectivo ($)';

  // Working copy of inventory so multiple lines of the same SKU consume FIFO sequentially
  const workingInventory: InventoryItem[] = state.inventory.map((item) => ({
    ...item,
    fifoBatches: (item.fifoBatches ?? []).map((b) => ({ ...b })),
  }));

  const resolvedLines: SaleLineItem[] = [];

  for (const line of input.items) {
    const skuIdx = workingInventory.findIndex((item) => item.id === line.skuId);
    if (skuIdx < 0) {
      return {
        ok: false,
        error: 'Uno de los productos del carrito ya no existe en el inventario.',
        state,
      };
    }

    const sku = workingInventory[skuIdx];
    const quantity = Math.floor(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        ok: false,
        error: `La cantidad para ${sku.model} debe ser un número entero mayor a 0.`,
        state,
      };
    }

    const unitPrice = round2(line.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return {
        ok: false,
        error: `El precio unitario para ${sku.model} debe ser mayor a $0.00.`,
        state,
      };
    }

    if (quantity > sku.stock) {
      return {
        ok: false,
        error: `Stock insuficiente para ${sku.model} (${sku.version} · ${sku.size}). Disponible: ${sku.stock} ud(s), solicitado: ${quantity}.`,
        state,
      };
    }

    const fifoResult = previewFifoConsumption(sku, quantity);
    const nextStock = sku.stock - quantity;
    const nextActiveBatch = fifoResult.updatedBatches.find(
      (b) => b.remainingQuantity > 0,
    );

    workingInventory[skuIdx] = {
      ...sku,
      stock: nextStock,
      fifoBatches: fifoResult.updatedBatches,
      cogs: nextActiveBatch ? round2(nextActiveBatch.unitCost) : sku.cogs,
    };

    resolvedLines.push({
      skuId: sku.id,
      modelLabel: sku.model,
      team: sku.team,
      version: sku.version,
      size: sku.size,
      quantity,
      unitCogs: fifoResult.effectiveUnitCogs,
      totalLineCogs: fifoResult.totalCost,
      baseUnitPrice:
        line.baseUnitPrice !== undefined
          ? round2(line.baseUnitPrice)
          : sku.salePrice,
      discountLabel: line.discountLabel,
      unitPrice,
      subtotal: round2(quantity * unitPrice),
      fifoConsumed: fifoResult.consumedDetails,
    });
  }

  const totalFinalPrice = round2(
    resolvedLines.reduce((sum, l) => sum + l.subtotal, 0),
  );
  const totalBaseCost = round2(
    resolvedLines.reduce((sum, l) => sum + l.totalLineCogs, 0),
  );
  const totalUnits = resolvedLines.reduce((sum, l) => sum + l.quantity, 0);

  let resolvedSplits: PaymentSplit[];
  let bcvEquivalent: number | undefined;

  if (paymentMethod === 'Pago Mixto') {
    const nonZeroSplits = (input.paymentSplits ?? [])
      .map((sp) => ({
        method: sp.method,
        amountUsd: round2(Number(sp.amountUsd) || 0),
      }))
      .filter((sp) => sp.amountUsd > 0);

    if (nonZeroSplits.length === 0) {
      return {
        ok: false,
        error: 'Ingresa los montos del Pago Mixto por cada método utilizado.',
        state,
      };
    }

    const splitSum = round2(
      nonZeroSplits.reduce((acc, sp) => acc + sp.amountUsd, 0),
    );
    if (Math.abs(round2(splitSum - totalFinalPrice)) > 0.01) {
      return {
        ok: false,
        error: `La suma del Pago Mixto (${formatUSD(splitSum)}) debe coincidir con el total de la venta (${formatUSD(totalFinalPrice)}).`,
        state,
      };
    }

    resolvedSplits = nonZeroSplits.map((sp) => ({
      method: sp.method,
      amountUsd: sp.amountUsd,
      bcvEquivalent:
        sp.method === 'Pago Móvil / Bs'
          ? round2(sp.amountUsd * state.exchangeRates.bcv)
          : undefined,
    }));

    const pagoMovilTotalBs = round2(
      resolvedSplits.reduce((sum, sp) => sum + (sp.bcvEquivalent ?? 0), 0),
    );
    bcvEquivalent = pagoMovilTotalBs > 0 ? pagoMovilTotalBs : undefined;
  } else {
    bcvEquivalent =
      paymentMethod === 'Pago Móvil / Bs'
        ? round2(totalFinalPrice * state.exchangeRates.bcv)
        : undefined;
    resolvedSplits = [
      {
        method: paymentMethod,
        amountUsd: totalFinalPrice,
        bcvEquivalent,
      },
    ];
  }

  const now = new Date().toISOString();
  const saleId = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const breakdown = calculateFourLayerMatrixConsolidated(
    totalFinalPrice,
    totalBaseCost,
    input.seller,
  );

  const nextCash =
    input.paymentStatus === 'Cobrado'
      ? round2(state.cashOnHand + totalFinalPrice)
      : state.cashOnHand;

  const summaryItemsText = resolvedLines
    .map((l) => `${l.quantity}x ${l.modelLabel} (${l.version} ${l.size})`)
    .join(', ');

  const nextReceivables =
    input.paymentStatus === 'Pendiente'
      ? [
          {
            id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            debtor: cleanDebtor,
            amount: totalFinalPrice,
            createdAt: now,
            note: summaryItemsText,
            saleId,
            paymentMethod,
          },
          ...state.receivables,
        ]
      : state.receivables;

  const nextCommissionsBySeller = { ...state.funds.commissionsBySeller };
  if (input.seller !== 'Sin Vendedor') {
    nextCommissionsBySeller[input.seller] = round2(
      nextCommissionsBySeller[input.seller] + breakdown.layer2Commission,
    );
  }

  const nextDividends = {
    Jesús: round2(
      state.funds.dividendsByPartner.Jesús + breakdown.partnerSplits.Jesús,
    ),
    Josué: round2(
      state.funds.dividendsByPartner.Josué + breakdown.partnerSplits.Josué,
    ),
    Gabriel: round2(
      state.funds.dividendsByPartner.Gabriel + breakdown.partnerSplits.Gabriel,
    ),
  };

  const firstLine = resolvedLines[0];
  const saleRecord = {
    id: saleId,
    skuId: firstLine.skuId,
    modelLabel:
      resolvedLines.length === 1
        ? firstLine.modelLabel
        : `Venta múltiple (${resolvedLines.length} modelos)`,
    team: firstLine.team,
    version: firstLine.version,
    size: firstLine.size,
    quantity: totalUnits,
    unitCogs: round2(totalBaseCost / totalUnits),
    finalPrice: totalFinalPrice,
    items: resolvedLines,
    customerName: cleanCustomer,
    seller: input.seller,
    paymentStatus: input.paymentStatus,
    paymentMethod,
    paymentSplits: resolvedSplits,
    bcvEquivalent,
    debtorName: input.paymentStatus === 'Pendiente' ? cleanDebtor : undefined,
    breakdown,
    createdAt: now,
  };

  const nextState: AppState = {
    ...state,
    cashOnHand: nextCash,
    inventory: workingInventory,
    receivables: nextReceivables,
    sales: [saleRecord, ...state.sales],
    funds: {
      ...state.funds,
      replacement: round2(state.funds.replacement + breakdown.layer1CostRecovery),
      commissions: round2(state.funds.commissions + breakdown.layer2Commission),
      commissionsBySeller: nextCommissionsBySeller,
      operatingAndAds: round2(
        state.funds.operatingAndAds + breakdown.layer3OperatingFund,
      ),
      growthReinvestment: round2(
        state.funds.growthReinvestment + breakdown.layer4GrowthReinvestment,
      ),
      dividendsByPartner: nextDividends,
    },
    movements: [
      {
        id: `mov-${Date.now()}`,
        type: 'sale',
        description: `Venta a ${cleanCustomer}: ${summaryItemsText} · ${paymentMethod} · ${
          input.paymentStatus === 'Cobrado'
            ? 'Cobrado'
            : `Crédito (${cleanDebtor})`
        }`,
        amount: totalFinalPrice,
        createdAt: now,
      },
      ...state.movements.slice(0, 49),
    ],
  };

  return { ok: true, state: nextState };
}

export function registerSale(
  state: AppState,
  input: RegisterSaleInput,
): ActionResult {
  const quantity = Math.floor(input.quantity);
  const unitPrice = quantity > 0 ? input.finalPrice / quantity : 0;
  return registerMultiItemSale(state, {
    items: [
      {
        skuId: input.skuId,
        quantity: input.quantity,
        unitPrice,
      },
    ],
    customerName:
      input.customerName?.trim() ||
      input.debtorName?.trim() ||
      'Cliente Mostrador',
    seller: input.seller,
    paymentStatus: input.paymentStatus,
    paymentMethod: input.paymentMethod,
    paymentSplits: input.paymentSplits,
    debtorName: input.debtorName,
  });
}

export interface BatchPurchaseLineInput {
  team: TeamCategory;
  model: string;
  version: JerseyVersion;
  size: JerseySize;
  quantity: number;
  factoryUnitCost: number;
  salePrice?: number;
}

export interface RegisterImportBatchInput {
  entryDate: string;
  referenceName: string;
  shippingType: ShippingType;
  totalFreightCost: number;
  fundingSource?: PurchaseFundingSource;
  items: BatchPurchaseLineInput[];
}

export interface ReceiveBatchLineInput {
  itemIndex: number;
  receivedQuantity: number;
}

export interface ReceiveImportBatchInput {
  batchId: string;
  receivedDate?: string;
  actualFreightCost: number;
  receivedItems: ReceiveBatchLineInput[];
}

export function getTransitCapitalSummary(state: AppState): {
  transitBatches: PurchaseBatchRecord[];
  receivedBatches: PurchaseBatchRecord[];
  transitCount: number;
  transitUnits: number;
  transitCapital: number;
} {
  const all = state.purchaseBatches ?? [];
  const transitBatches = all.filter((b) => b.status === 'EN TRÁNSITO');
  const receivedBatches = all.filter((b) => b.status !== 'EN TRÁNSITO');
  const transitUnits = transitBatches.reduce((sum, b) => sum + b.totalUnits, 0);
  const transitCapital = round2(
    transitBatches.reduce((sum, b) => sum + b.totalLandedCost, 0),
  );
  return {
    transitBatches,
    receivedBatches,
    transitCount: transitBatches.length,
    transitUnits,
    transitCapital,
  };
}

/**
 * ETAPA 1: Crea una orden de compra en tránsito.
 * Descuenta inmediatamente de Caja General o Fondo de Reinversión y guarda como "EN TRÁNSITO"
 * SIN ingresar aún las unidades al inventario disponible.
 */
export function createImportOrder(
  state: AppState,
  input: RegisterImportBatchInput,
): ActionResult {
  const refName = input.referenceName.trim();
  if (!refName) {
    return {
      ok: false,
      error: 'Ingresa el nombre o referencia de la orden de envío.',
      state,
    };
  }

  const entryDate = input.entryDate.trim() || new Date().toISOString().slice(0, 10);
  const estimatedFreightCost = round2(input.totalFreightCost);
  if (!Number.isFinite(estimatedFreightCost) || estimatedFreightCost < 0) {
    return {
      ok: false,
      error: 'El costo estimado del flete no puede ser negativo.',
      state,
    };
  }

  if (!input.items || input.items.length === 0) {
    return {
      ok: false,
      error: 'Agrega al menos un modelo a la orden de importación.',
      state,
    };
  }

  let totalUnits = 0;
  let totalFactoryCostRaw = 0;

  for (const item of input.items) {
    if (!item.model.trim()) {
      return {
        ok: false,
        error: 'Todos los ítems de la orden deben tener un nombre de modelo.',
        state,
      };
    }
    const qty = Math.floor(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return {
        ok: false,
        error: `La cantidad para ${item.model} debe ser mayor a 0.`,
        state,
      };
    }
    const fCost = round2(item.factoryUnitCost);
    if (!Number.isFinite(fCost) || fCost <= 0) {
      return {
        ok: false,
        error: `El precio unitario de fábrica para ${item.model} debe ser mayor a $0.00.`,
        state,
      };
    }
    totalUnits += qty;
    totalFactoryCostRaw += qty * fCost;
  }

  const fundingSource: PurchaseFundingSource =
    input.fundingSource ?? 'cashOnHand';
  const totalFactoryCost = round2(totalFactoryCostRaw);
  const totalLandedCost = round2(totalFactoryCost + estimatedFreightCost);

  if (totalLandedCost > state.cashOnHand) {
    return {
      ok: false,
      error: `Efectivo insuficiente en caja (${formatUSD(state.cashOnHand)}) para cubrir el desembolso de la orden (${formatUSD(totalLandedCost)}).`,
      state,
    };
  }

  if (
    fundingSource === 'growthReinvestment' &&
    totalLandedCost > state.funds.growthReinvestment
  ) {
    return {
      ok: false,
      error: `El Fondo de Reinversión disponible (${formatUSD(state.funds.growthReinvestment)}) no alcanza para cubrir ${formatUSD(totalLandedCost)}.`,
      state,
    };
  }

  const freightPerUnitExact = estimatedFreightCost / totalUnits;
  const freightPerUnitDisplay = round2(freightPerUnitExact);

  const now = new Date().toISOString();
  const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const batchItems: PurchaseBatchItemRecord[] = input.items.map((line) => {
    const cleanModel = line.model.trim();
    const qty = Math.floor(line.quantity);
    const factoryUnitCost = round2(line.factoryUnitCost);
    const exactLandedUnitCost = round4(factoryUnitCost + freightPerUnitExact);
    const landedUnitCostDisplay = round2(exactLandedUnitCost);
    return {
      team: line.team,
      model: cleanModel,
      version: line.version,
      size: line.size,
      orderedQuantity: qty,
      quantity: qty,
      salePrice:
        line.salePrice && line.salePrice > 0
          ? round2(line.salePrice)
          : undefined,
      factoryUnitCost,
      proratedFreightPerUnit: freightPerUnitDisplay,
      landedUnitCost: landedUnitCostDisplay,
      lineFactoryTotal: round2(qty * factoryUnitCost),
      lineLandedTotal: round2(qty * exactLandedUnitCost),
    };
  });

  const batchRecord: PurchaseBatchRecord = {
    id: batchId,
    status: 'EN TRÁNSITO',
    fundingSource,
    entryDate,
    referenceName: refName,
    shippingType: input.shippingType,
    orderedTotalUnits: totalUnits,
    totalUnits,
    totalFactoryCost,
    estimatedFreightCost,
    totalFreightCost: estimatedFreightCost,
    freightPerUnit: freightPerUnitDisplay,
    totalLandedCost,
    items: batchItems,
    createdAt: now,
  };

  const fundingLabel =
    fundingSource === 'growthReinvestment'
      ? 'Fondo Reinversión'
      : 'Caja General';

  const nextState: AppState = {
    ...state,
    cashOnHand: round2(state.cashOnHand - totalLandedCost),
    funds: {
      ...state.funds,
      growthReinvestment:
        fundingSource === 'growthReinvestment'
          ? round2(state.funds.growthReinvestment - totalLandedCost)
          : state.funds.growthReinvestment,
    },
    purchaseBatches: [batchRecord, ...(state.purchaseBatches ?? [])],
    movements: [
      {
        id: `mov-${Date.now()}`,
        type: 'purchase',
        description: `Orden EN TRÁNSITO: ${refName} (${input.shippingType}) · ${totalUnits} uds · Pago ${fundingLabel} (Fábrica ${formatUSD(totalFactoryCost)} + Flete est. ${formatUSD(estimatedFreightCost)})`,
        amount: -totalLandedCost,
        createdAt: now,
      },
      ...state.movements.slice(0, 49),
    ],
  };

  return { ok: true, state: nextState };
}

/**
 * ETAPA 2: Recepción y auditoría de ingreso a bodega.
 * Recalcula Landed Cost con flete real prorrateado sobre las piezas recibidas,
 * ajusta la diferencia de flete en caja/fondo, ingresa al inventario FIFO con fecha de recepción
 * y cambia el estatus del lote a "RECIBIDO EN BODEGA".
 */
export function receiveImportBatch(
  state: AppState,
  input: ReceiveImportBatchInput,
): ActionResult {
  const existingBatches = state.purchaseBatches ?? [];
  const batchIdx = existingBatches.findIndex((b) => b.id === input.batchId);
  if (batchIdx < 0) {
    return {
      ok: false,
      error: 'Orden de importación no encontrada.',
      state,
    };
  }

  const targetBatch = existingBatches[batchIdx];
  if (targetBatch.status !== 'EN TRÁNSITO') {
    return {
      ok: false,
      error: 'Este lote ya fue recibido y auditado en bodega.',
      state,
    };
  }

  const actualFreightCost = round2(input.actualFreightCost);
  if (!Number.isFinite(actualFreightCost) || actualFreightCost < 0) {
    return {
      ok: false,
      error: 'El costo real del flete debe ser mayor o igual a $0.00.',
      state,
    };
  }

  const receivedDate =
    input.receivedDate?.trim() || new Date().toISOString().slice(0, 10);

  const qtyByIndex = new Map<number, number>();
  for (const item of input.receivedItems ?? []) {
    qtyByIndex.set(item.itemIndex, Math.floor(Number(item.receivedQuantity) || 0));
  }

  const receivedCounts: number[] = [];
  let totalReceivedUnits = 0;

  for (let i = 0; i < targetBatch.items.length; i++) {
    const orderedItem = targetBatch.items[i];
    const qty = qtyByIndex.has(i)
      ? qtyByIndex.get(i)!
      : orderedItem.orderedQuantity;
    if (!Number.isFinite(qty) || qty < 0) {
      return {
        ok: false,
        error: `La cantidad recibida para ${orderedItem.model} no puede ser negativa.`,
        state,
      };
    }
    receivedCounts.push(qty);
    totalReceivedUnits += qty;
  }

  if (totalReceivedUnits <= 0) {
    return {
      ok: false,
      error: 'Debes confirmar al menos 1 prenda recibida para ingresar el lote a bodega.',
      state,
    };
  }

  const estimatedFreight =
    targetBatch.estimatedFreightCost ?? targetBatch.totalFreightCost;
  const freightDiff = round2(actualFreightCost - estimatedFreight);
  const fundingSource = targetBatch.fundingSource ?? 'cashOnHand';

  if (freightDiff > 0) {
    if (freightDiff > state.cashOnHand) {
      return {
        ok: false,
        error: `Efectivo insuficiente en caja (${formatUSD(state.cashOnHand)}) para cubrir la diferencia de flete real (+${formatUSD(freightDiff)}).`,
        state,
      };
    }
    if (
      fundingSource === 'growthReinvestment' &&
      freightDiff > state.funds.growthReinvestment
    ) {
      return {
        ok: false,
        error: `Fondo de Reinversión insuficiente (${formatUSD(state.funds.growthReinvestment)}) para cubrir la diferencia de flete real (+${formatUSD(freightDiff)}).`,
        state,
      };
    }
  }

  const freightPerUnitExact = actualFreightCost / totalReceivedUnits;
  const freightPerUnitDisplay = round2(freightPerUnitExact);

  const now = new Date().toISOString();
  const nextInventory: InventoryItem[] = state.inventory.map((item) => ({
    ...item,
    fifoBatches: (item.fifoBatches ?? []).map((b) => ({ ...b })),
  }));

  const updatedItems: PurchaseBatchItemRecord[] = [];
  const nextLegacyPurchases = [...state.purchases];

  for (let i = 0; i < targetBatch.items.length; i++) {
    const line = targetBatch.items[i];
    const receivedQty = receivedCounts[i];
    const exactLandedUnitCost = round4(line.factoryUnitCost + freightPerUnitExact);
    const landedUnitCostDisplay = round2(exactLandedUnitCost);
    const lineFactoryTotal = round2(receivedQty * line.factoryUnitCost);
    const lineLandedTotal = round2(receivedQty * exactLandedUnitCost);

    let skuId = line.skuId;

    if (receivedQty > 0) {
      const normalizedModel = line.model.trim().toLowerCase();
      const existingIdx = nextInventory.findIndex(
        (item) =>
          item.model.trim().toLowerCase() === normalizedModel &&
          item.version === line.version &&
          item.size === line.size,
      );

      const fifoBatchEntry: FifoBatch = {
        batchId: `${targetBatch.id}-line-${i}`,
        batchName: targetBatch.referenceName,
        entryDate: receivedDate,
        initialQuantity: receivedQty,
        remainingQuantity: receivedQty,
        unitCost: exactLandedUnitCost,
      };

      let previousCogs: number | null = null;

      if (existingIdx >= 0) {
        const existing = nextInventory[existingIdx];
        skuId = existing.id;
        previousCogs = existing.cogs;
        const updatedBatches = [
          ...(existing.fifoBatches ?? []),
          fifoBatchEntry,
        ].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
        const nextStock = existing.stock + receivedQty;
        const firstActive = updatedBatches.find((b) => b.remainingQuantity > 0);
        nextInventory[existingIdx] = {
          ...existing,
          stock: nextStock,
          fifoBatches: updatedBatches,
          cogs: firstActive ? round2(firstActive.unitCost) : landedUnitCostDisplay,
          salePrice:
            line.salePrice && line.salePrice > 0
              ? round2(line.salePrice)
              : existing.salePrice,
        };
      } else {
        skuId = `sku-imp-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`;
        nextInventory.unshift({
          id: skuId,
          team: line.team,
          model: line.model.trim(),
          version: line.version,
          size: line.size,
          stock: receivedQty,
          cogs: landedUnitCostDisplay,
          salePrice:
            line.salePrice && line.salePrice > 0
              ? round2(line.salePrice)
              : getDefaultSalePrice(line.version, line.model),
          fifoBatches: [fifoBatchEntry],
        });
      }

      nextLegacyPurchases.unshift({
        id: `pur-${Date.now()}-${i}`,
        skuId,
        team: line.team,
        model: line.model.trim(),
        version: line.version,
        size: line.size,
        quantity: receivedQty,
        unitCostWithFreight: landedUnitCostDisplay,
        totalCost: lineLandedTotal,
        previousCogs,
        resultingCogs: landedUnitCostDisplay,
        createdAt: now,
      });
    }

    updatedItems.push({
      ...line,
      skuId,
      quantity: receivedQty,
      receivedQuantity: receivedQty,
      proratedFreightPerUnit: freightPerUnitDisplay,
      landedUnitCost: landedUnitCostDisplay,
      lineFactoryTotal,
      lineLandedTotal,
    });
  }

  const totalLandedCost = round2(targetBatch.totalFactoryCost + actualFreightCost);

  const updatedBatch: PurchaseBatchRecord = {
    ...targetBatch,
    status: 'RECIBIDO EN BODEGA',
    receivedDate,
    receivedAt: now,
    totalUnits: totalReceivedUnits,
    totalFreightCost: actualFreightCost,
    freightAdjustment: freightDiff,
    freightPerUnit: freightPerUnitDisplay,
    totalLandedCost,
    items: updatedItems,
  };

  const nextBatches = existingBatches.map((b, idx) =>
    idx === batchIdx ? updatedBatch : b,
  );

  const nextCashOnHand = round2(state.cashOnHand - freightDiff);
  const nextGrowthReinvestment =
    fundingSource === 'growthReinvestment'
      ? round2(state.funds.growthReinvestment - freightDiff)
      : state.funds.growthReinvestment;

  const adjustmentNote =
    freightDiff === 0
      ? 'sin ajuste de flete'
      : freightDiff > 0
        ? `cargo adicional flete +${formatUSD(freightDiff)}`
        : `reembolso flete -${formatUSD(Math.abs(freightDiff))}`;

  return {
    ok: true,
    state: {
      ...state,
      cashOnHand: nextCashOnHand,
      inventory: nextInventory,
      purchases: nextLegacyPurchases,
      purchaseBatches: nextBatches,
      funds: {
        ...state.funds,
        growthReinvestment: nextGrowthReinvestment,
      },
      movements: [
        {
          id: `mov-${Date.now()}`,
          type: 'purchase',
          description: `Recepción EN BODEGA: ${targetBatch.referenceName} · ${totalReceivedUnits}/${targetBatch.orderedTotalUnits} uds · Flete real ${formatUSD(actualFreightCost)} (${adjustmentNote})`,
          amount: freightDiff !== 0 ? -freightDiff : 0,
          createdAt: now,
        },
        ...state.movements.slice(0, 49),
      ],
    },
  };
}

export function registerImportBatch(
  state: AppState,
  input: RegisterImportBatchInput,
): ActionResult {
  return createImportOrder(state, input);
}

export interface RegisterPurchaseInput {
  team: TeamCategory;
  model: string;
  version: JerseyVersion;
  size: JerseySize;
  quantity: number;
  unitCostWithFreight: number;
}

export function registerPurchase(
  state: AppState,
  input: RegisterPurchaseInput,
): ActionResult {
  const today = new Date().toISOString().slice(0, 10);
  const stage1 = createImportOrder(state, {
    entryDate: today,
    referenceName: `Compra Directa · ${input.model.trim()}`,
    shippingType: 'Aéreo',
    totalFreightCost: 0,
    items: [
      {
        team: input.team,
        model: input.model,
        version: input.version,
        size: input.size,
        quantity: input.quantity,
        factoryUnitCost: input.unitCostWithFreight,
      },
    ],
  });
  if (!stage1.ok) return stage1;
  const createdBatch = stage1.state.purchaseBatches[0];
  return receiveImportBatch(stage1.state, {
    batchId: createdBatch.id,
    receivedDate: today,
    actualFreightCost: 0,
    receivedItems: [{ itemIndex: 0, receivedQuantity: input.quantity }],
  });
}

export function collectReceivable(
  state: AppState,
  receivableId: string,
  paymentMethod: PaymentMethod = 'Efectivo ($)',
  amountPaid?: number,
): ActionResult {
  const target = state.receivables.find((r) => r.id === receivableId);
  if (!target) {
    return { ok: false, error: 'Cuenta por cobrar no encontrada.', state };
  }

  const payAmount =
    amountPaid === undefined ? target.amount : round2(amountPaid);
  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    return {
      ok: false,
      error: 'El monto del pago o abono debe ser mayor a $0.00.',
      state,
    };
  }
  if (payAmount > round2(target.amount + 0.01)) {
    return {
      ok: false,
      error: `El abono (${formatUSD(payAmount)}) supera el saldo pendiente de ${target.debtor} (${formatUSD(target.amount)}).`,
      state,
    };
  }

  const effectivePayment = round2(Math.min(target.amount, payAmount));
  const remainingAmount = round2(Math.max(0, target.amount - effectivePayment));
  const isFullLiquidation = remainingAmount <= 0.009;
  const now = new Date().toISOString();

  const originalAmount = round2(target.originalAmount ?? target.amount);
  const previousPaid = round2(
    target.paidAmount ?? Math.max(0, originalAmount - target.amount),
  );
  const nextPaid = round2(previousPaid + effectivePayment);

  const installment: ReceivableInstallment = {
    id: `inst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    amount: effectivePayment,
    paymentMethod,
    createdAt: now,
  };

  const nextReceivables = isFullLiquidation
    ? state.receivables.filter((r) => r.id !== receivableId)
    : state.receivables.map((r) =>
        r.id === receivableId
          ? {
              ...r,
              amount: remainingAmount,
              originalAmount,
              paidAmount: nextPaid,
              installments: [installment, ...(r.installments ?? [])],
            }
          : r,
      );

  // Sincronizar estado de liquidación de la venta asociada si quedó saldada por completo
  const nextSales =
    isFullLiquidation && target.saleId
      ? state.sales.map((s) =>
          s.id === target.saleId ? { ...s, paymentStatus: 'Cobrado' as const } : s,
        )
      : state.sales;

  const movementDescription = isFullLiquidation
    ? `Liquidación total recibida de ${target.debtor} (${paymentMethod})`
    : `Abono recibido de ${target.debtor} (${paymentMethod}) · Resta ${formatUSD(remainingAmount)}`;

  const nextState: AppState = {
    ...state,
    cashOnHand: round2(state.cashOnHand + effectivePayment),
    receivables: nextReceivables,
    sales: nextSales,
    collectedReceivablesCount: isFullLiquidation
      ? state.collectedReceivablesCount + 1
      : state.collectedReceivablesCount,
    movements: [
      {
        id: `mov-${Date.now()}`,
        type: 'collection',
        description: movementDescription,
        amount: effectivePayment,
        createdAt: now,
      },
      ...state.movements.slice(0, 49),
    ],
  };

  return { ok: true, state: nextState };
}

export function reinvestPartnerDividends(
  state: AppState,
  partner: PartnerName,
): ActionResult {
  const available = round2(state.funds.dividendsByPartner[partner]);
  if (available <= 0) {
    return {
      ok: false,
      error: `${partner} no tiene dividendos acumulados disponibles para reinvertir.`,
      state,
    };
  }

  const now = new Date().toISOString();
  const nextState: AppState = {
    ...state,
    funds: {
      ...state.funds,
      growthReinvestment: round2(state.funds.growthReinvestment + available),
      reinvestedFromDividendsTotal: round2(
        state.funds.reinvestedFromDividendsTotal + available,
      ),
      dividendsByPartner: {
        ...state.funds.dividendsByPartner,
        [partner]: 0,
      },
    },
    movements: [
      {
        id: `mov-${Date.now()}`,
        type: 'reinvestment',
        description: `Reinversión de dividendos de ${partner} al Fondo de Crecimiento`,
        amount: available,
        createdAt: now,
      },
      ...state.movements.slice(0, 49),
    ],
  };

  return { ok: true, state: nextState };
}

export function updateExchangeRates(
  state: AppState,
  bcv: number,
  usdt: number,
  source: 'api' | 'manual' = 'manual',
): ActionResult {
  const cleanBcv = round2(bcv);
  const cleanUsdt = round2(usdt);

  if (
    !Number.isFinite(cleanBcv) ||
    cleanBcv <= 0 ||
    !Number.isFinite(cleanUsdt) ||
    cleanUsdt <= 0
  ) {
    return {
      ok: false,
      error: 'Las tasas BCV y USDT deben ser valores numéricos mayores a 0.',
      state,
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      exchangeRates: {
        bcv: cleanBcv,
        usdt: cleanUsdt,
        updatedAt: new Date().toISOString(),
        source,
      },
    },
  };
}

export interface RegisterOperatingExpenseInput {
  concept: string;
  amount: number;
  source: 'operatingFund' | 'cashOnHand';
  paymentMethod?: SinglePaymentMethod;
}

export function registerOperatingExpense(
  state: AppState,
  input: RegisterOperatingExpenseInput,
): ActionResult {
  const concept = input.concept.trim();
  if (!concept) {
    return {
      ok: false,
      error: 'Ingresa el concepto o descripción del gasto operativo.',
      state,
    };
  }

  const amount = round2(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false,
      error: 'El monto del gasto debe ser mayor a $0.00.',
      state,
    };
  }

  if (amount > state.cashOnHand) {
    return {
      ok: false,
      error: `Efectivo insuficiente en caja (${formatUSD(state.cashOnHand)}) para cubrir el gasto de ${formatUSD(amount)}.`,
      state,
    };
  }

  if (
    input.source === 'operatingFund' &&
    amount > state.funds.operatingAndAds
  ) {
    return {
      ok: false,
      error: `El Fondo Operativo (10%) disponible (${formatUSD(state.funds.operatingAndAds)}) no alcanza para cubrir ${formatUSD(amount)}. Puedes descontarlo de Caja Física General.`,
      state,
    };
  }

  const paymentMethod: SinglePaymentMethod = input.paymentMethod ?? 'Efectivo ($)';
  const now = new Date().toISOString();

  const expenseRecord: OperatingExpenseRecord = {
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    concept,
    amount,
    source: input.source,
    paymentMethod,
    createdAt: now,
  };

  return {
    ok: true,
    state: {
      ...state,
      cashOnHand: round2(state.cashOnHand - amount),
      operatingExpenses: [expenseRecord, ...(state.operatingExpenses ?? [])],
      funds: {
        ...state.funds,
        operatingAndAds:
          input.source === 'operatingFund'
            ? round2(state.funds.operatingAndAds - amount)
            : state.funds.operatingAndAds,
      },
      movements: [
        {
          id: `mov-${Date.now()}`,
          type: 'expense',
          description: `Gasto Caja Chica: ${concept} (${paymentMethod} · ${
            input.source === 'operatingFund' ? 'Fondo Operativo 10%' : 'Caja General'
          })`,
          amount: -amount,
          createdAt: now,
        },
        ...state.movements.slice(0, 49),
      ],
    },
  };
}

export interface RegisterCapitalInjectionInput {
  contributor: string;
  concept: string;
  amount: number;
  paymentMethod?: SinglePaymentMethod;
  destination?: CapitalInjectionDestination;
}

/**
 * Registra una inyección de capital / aporte de liquidez externa.
 * Incrementa la caja operativa y el patrimonio líquido SIN alterar costos ni capas FIFO del inventario.
 */
export function registerCapitalInjection(
  state: AppState,
  input: RegisterCapitalInjectionInput,
): ActionResult {
  const contributor = input.contributor.trim();
  if (!contributor) {
    return {
      ok: false,
      error: 'Indica quién realiza el aporte o el origen de la inyección de dinero.',
      state,
    };
  }

  const concept = input.concept.trim() || 'Inyección de liquidez';
  const amount = round2(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false,
      error: 'El monto de la inyección de dinero debe ser mayor a $0.00.',
      state,
    };
  }

  const paymentMethod: SinglePaymentMethod = input.paymentMethod ?? 'Efectivo ($)';
  const destination: CapitalInjectionDestination =
    input.destination ?? 'cashOnly';
  const now = new Date().toISOString();

  const record: CapitalInjectionRecord = {
    id: `inj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    contributor,
    concept,
    amount,
    paymentMethod,
    destination,
    createdAt: now,
  };

  const destLabel =
    destination === 'growthReinvestment'
      ? 'Caja + Fondo Reinversión'
      : destination === 'operatingFund'
        ? 'Caja + Fondo Operativo 10%'
        : 'Caja Operativa General';

  return {
    ok: true,
    state: {
      ...state,
      cashOnHand: round2(state.cashOnHand + amount),
      capitalInjections: [record, ...(state.capitalInjections ?? [])],
      funds: {
        ...state.funds,
        operatingAndAds:
          destination === 'operatingFund'
            ? round2(state.funds.operatingAndAds + amount)
            : state.funds.operatingAndAds,
        growthReinvestment:
          destination === 'growthReinvestment'
            ? round2(state.funds.growthReinvestment + amount)
            : state.funds.growthReinvestment,
      },
      movements: [
        {
          id: `mov-${Date.now()}`,
          type: 'capital_injection',
          description: `Inyección de capital (${contributor}): ${concept} · ${paymentMethod} · ${destLabel}`,
          amount,
          createdAt: now,
        },
        ...state.movements.slice(0, 49),
      ],
    },
  };
}

export interface ReconcileCashInput {
  countedCash: number;
  reason?: string;
}

/**
 * Concilia el efectivo físico en caja contra el arqueo real contado
 * sin modificar el inventario ni sus capas de costo FIFO.
 */
export function reconcileCashOnHand(
  state: AppState,
  input: ReconcileCashInput,
): ActionResult {
  const counted = round2(input.countedCash);
  if (!Number.isFinite(counted) || counted < 0) {
    return {
      ok: false,
      error: 'El efectivo físico contado debe ser mayor o igual a $0.00.',
      state,
    };
  }

  const diff = round2(counted - state.cashOnHand);
  if (diff === 0) {
    return {
      ok: false,
      error: `La caja física ya coincide exactamente con ${formatUSD(state.cashOnHand)}.`,
      state,
    };
  }

  const reason = input.reason?.trim() || 'Conciliación / arqueo de caja';
  const now = new Date().toISOString();

  return {
    ok: true,
    state: {
      ...state,
      cashOnHand: counted,
      movements: [
        {
          id: `mov-${Date.now()}`,
          type: 'reconciliation',
          description: `Conciliación de caja (${reason}): ${formatUSD(state.cashOnHand)} → ${formatUSD(counted)}`,
          amount: diff,
          createdAt: now,
        },
        ...state.movements.slice(0, 49),
      ],
    },
  };
}

export interface AdjustInventoryCountInput {
  skuId: string;
  newStock: number;
  reason: string;
}

export function adjustInventoryPhysicalCount(
  state: AppState,
  input: AdjustInventoryCountInput,
): ActionResult {
  const idx = state.inventory.findIndex((i) => i.id === input.skuId);
  if (idx < 0) {
    return { ok: false, error: 'SKU no encontrado en el catálogo.', state };
  }

  const newStock = Math.floor(input.newStock);
  if (!Number.isFinite(newStock) || newStock < 0) {
    return {
      ok: false,
      error: 'El conteo físico debe ser un número entero mayor o igual a 0.',
      state,
    };
  }

  const reason = input.reason.trim() || 'Conteo físico de inventario';
  const target = state.inventory[idx];
  const previousStock = target.stock;
  const delta = newStock - previousStock;

  if (delta === 0) {
    return {
      ok: false,
      error: `El conteo físico (${newStock} uds) coincide con el stock actual en sistema.`,
      state,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  let nextBatches: FifoBatch[];
  let nextCogs = target.cogs;
  let fifoLossCost: number | undefined;

  if (delta < 0) {
    const res = previewFifoConsumption(target, Math.abs(delta));
    nextBatches = res.updatedBatches;
    fifoLossCost = res.totalCost;
    const firstActive = nextBatches.find((b) => b.remainingQuantity > 0);
    nextCogs = firstActive ? round2(firstActive.unitCost) : target.cogs;
  } else {
    const unitCost = getNextFifoUnitCost(target);
    const adjustmentBatch: FifoBatch = {
      batchId: `fifo-adj-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      batchName: `Ajuste Físico (${reason})`,
      entryDate: today,
      initialQuantity: delta,
      remainingQuantity: delta,
      unitCost,
    };
    nextBatches = [...(target.fifoBatches ?? []), adjustmentBatch].sort((a, b) =>
      a.entryDate.localeCompare(b.entryDate),
    );
    const firstActive = nextBatches.find((b) => b.remainingQuantity > 0);
    nextCogs = firstActive ? round2(firstActive.unitCost) : unitCost;
  }

  const nextInventory = state.inventory.map((item, i) =>
    i === idx
      ? {
          ...item,
          stock: newStock,
          cogs: nextCogs,
          fifoBatches: nextBatches,
        }
      : item,
  );

  const adjustmentRecord: InventoryAdjustmentRecord = {
    id: `adj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    skuId: target.id,
    modelLabel: target.model,
    version: target.version,
    size: target.size,
    previousStock,
    newStock,
    delta,
    fifoLossCost,
    auditMode: 'manual',
    reason,
    createdAt: now,
  };

  return {
    ok: true,
    state: {
      ...state,
      inventory: nextInventory,
      inventoryAdjustments: [
        adjustmentRecord,
        ...(state.inventoryAdjustments ?? []),
      ],
      movements: [
        {
          id: `mov-${Date.now()}`,
          type: 'adjustment',
          description: `Ajuste físico ${target.model} (${target.version} ${target.size}): ${previousStock} → ${newStock} uds (${delta > 0 ? `+${delta}` : delta}) · ${reason}`,
          amount: fifoLossCost ? -fifoLossCost : 0,
          createdAt: now,
        },
        ...state.movements.slice(0, 49),
      ],
    },
  };
}

export interface InventoryCascadeGroup {
  key: string;
  team: TeamCategory;
  model: string;
  version: JerseyVersion;
  expectedStock: number;
  items: InventoryItem[];
}

const SIZE_ORDER: Record<JerseySize, number> = {
  S: 0,
  M: 1,
  L: 2,
  XL: 3,
};

export function getInventoryCascadeGroups(
  inventory: InventoryItem[],
): InventoryCascadeGroup[] {
  const groupMap = new Map<string, InventoryCascadeGroup>();

  for (const item of inventory) {
    const cleanModel = item.model.trim();
    const key = `${cleanModel.toLowerCase()}__${item.version}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.expectedStock += item.stock;
      existing.items.push(item);
    } else {
      groupMap.set(key, {
        key,
        team: item.team,
        model: cleanModel,
        version: item.version,
        expectedStock: item.stock,
        items: [item],
      });
    }
  }

  const groups = Array.from(groupMap.values());
  for (const group of groups) {
    group.items.sort((a, b) => SIZE_ORDER[a.size] - SIZE_ORDER[b.size]);
  }
  groups.sort(
    (a, b) =>
      a.team.localeCompare(b.team) ||
      a.model.localeCompare(b.model) ||
      a.version.localeCompare(b.version),
  );
  return groups;
}

export interface AuditAdjustmentItemInput {
  skuId: string;
  newStock: number;
}

export interface ApplyAuditAdjustmentsInput {
  items: AuditAdjustmentItemInput[];
  reason?: string;
  auditMode?: 'cascade' | 'sku';
}

export function applyAuditAdjustments(
  state: AppState,
  input: ApplyAuditAdjustmentsInput,
): ActionResult {
  if (!input.items || input.items.length === 0) {
    return {
      ok: false,
      error: 'No hay ajustes pendientes por aplicar.',
      state,
    };
  }

  const reason = input.reason?.trim() || 'Conteo físico de auditoría';
  const auditMode = input.auditMode ?? 'sku';
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const workingInventory = state.inventory.map((item) => ({
    ...item,
    fifoBatches: (item.fifoBatches ?? []).map((b) => ({ ...b })),
  }));

  const newAdjustmentRecords: InventoryAdjustmentRecord[] = [];
  let totalShortageUnits = 0;
  let totalSurplusUnits = 0;
  let totalFifoLossCost = 0;

  for (const entry of input.items) {
    const idx = workingInventory.findIndex((i) => i.id === entry.skuId);
    if (idx < 0) {
      return {
        ok: false,
        error: 'Uno de los SKUs auditados ya no existe en el inventario.',
        state,
      };
    }

    const newStock = Math.floor(entry.newStock);
    if (!Number.isFinite(newStock) || newStock < 0) {
      return {
        ok: false,
        error: 'El conteo físico debe ser un número entero mayor o igual a 0.',
        state,
      };
    }

    const target = workingInventory[idx];
    const previousStock = target.stock;
    const delta = newStock - previousStock;
    if (delta === 0) continue;

    let nextBatches: FifoBatch[];
    let nextCogs = target.cogs;
    let fifoLossCost: number | undefined;

    if (delta < 0) {
      const res = previewFifoConsumption(target, Math.abs(delta));
      nextBatches = res.updatedBatches;
      fifoLossCost = res.totalCost;
      totalShortageUnits += Math.abs(delta);
      totalFifoLossCost = round2(totalFifoLossCost + res.totalCost);
      const firstActive = nextBatches.find((b) => b.remainingQuantity > 0);
      nextCogs = firstActive ? round2(firstActive.unitCost) : target.cogs;
    } else {
      const unitCost = getNextFifoUnitCost(target);
      const adjustmentBatch: FifoBatch = {
        batchId: `fifo-audit-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
        batchName: `Sobrante Auditoría (${reason})`,
        entryDate: today,
        initialQuantity: delta,
        remainingQuantity: delta,
        unitCost,
      };
      nextBatches = [...(target.fifoBatches ?? []), adjustmentBatch].sort((a, b) =>
        a.entryDate.localeCompare(b.entryDate),
      );
      totalSurplusUnits += delta;
      const firstActive = nextBatches.find((b) => b.remainingQuantity > 0);
      nextCogs = firstActive ? round2(firstActive.unitCost) : unitCost;
    }

    workingInventory[idx] = {
      ...target,
      stock: newStock,
      cogs: nextCogs,
      fifoBatches: nextBatches,
    };

    newAdjustmentRecords.unshift({
      id: `adj-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      skuId: target.id,
      modelLabel: target.model,
      version: target.version,
      size: target.size,
      previousStock,
      newStock,
      delta,
      fifoLossCost,
      auditMode,
      reason,
      createdAt: now,
    });
  }

  if (newAdjustmentRecords.length === 0) {
    return {
      ok: false,
      error: 'Todos los conteos ingresados coinciden con el stock actual en sistema.',
      state,
    };
  }

  const summaryParts: string[] = [];
  if (totalShortageUnits > 0) {
    summaryParts.push(
      `Merma -${totalShortageUnits} uds (Costo FIFO ${formatUSD(totalFifoLossCost)})`,
    );
  }
  if (totalSurplusUnits > 0) {
    summaryParts.push(`Sobrante +${totalSurplusUnits} uds`);
  }

  return {
    ok: true,
    state: {
      ...state,
      inventory: workingInventory,
      inventoryAdjustments: [
        ...newAdjustmentRecords,
        ...(state.inventoryAdjustments ?? []),
      ],
      movements: [
        {
          id: `mov-${Date.now()}`,
          type: 'adjustment',
          description: `Auditoría (${newAdjustmentRecords.length} SKUs · ${reason}): ${summaryParts.join(' · ')}`,
          amount: totalFifoLossCost > 0 ? -totalFifoLossCost : 0,
          createdAt: now,
        },
        ...state.movements.slice(0, 49),
      ],
    },
  };
}

function migrateInventoryWithFifo(items: InventoryItem[]): InventoryItem[] {
  return items.map((item) => {
    const salePrice =
      typeof item.salePrice === 'number' && item.salePrice > 0
        ? round2(item.salePrice)
        : getDefaultSalePrice(item.version, item.model);

    if (Array.isArray(item.fifoBatches) && item.fifoBatches.length > 0) {
      return { ...item, salePrice };
    }
    return {
      ...item,
      salePrice,
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
    };
  });
}

export function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    return Object.values(value) as T[];
  }
  return [];
}

export function sanitizeForFirebase<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'number') {
    return (Number.isFinite(value) ? value : 0) as T;
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirebase(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val !== undefined) {
        out[key] = sanitizeForFirebase(val);
      }
    }
    return out as T;
  }
  return value;
}

export function normalizeAppState(raw: unknown): AppState {
  try {
    if (!raw || typeof raw !== 'object') {
      return createInitialState();
    }

    const parsed = raw as Partial<AppState>;
    if (
      typeof parsed.cashOnHand !== 'number' ||
      !parsed.funds ||
      !parsed.exchangeRates
    ) {
      return createInitialState();
    }

    const base = createInitialState();
    const rawInventory = toArray<InventoryItem>(parsed.inventory).map((item) => ({
      ...item,
      fifoBatches: toArray<FifoBatch>(item.fifoBatches),
    }));

    const parsedFunds = parsed.funds;
    const normalizedFunds = {
      replacement: Number.isFinite(parsedFunds.replacement)
        ? round2(parsedFunds.replacement)
        : base.funds.replacement,
      commissions: Number.isFinite(parsedFunds.commissions)
        ? round2(parsedFunds.commissions)
        : base.funds.commissions,
      commissionsBySeller: {
        ...base.funds.commissionsBySeller,
        ...(parsedFunds.commissionsBySeller ?? {}),
      },
      operatingAndAds: Number.isFinite(parsedFunds.operatingAndAds)
        ? round2(parsedFunds.operatingAndAds)
        : base.funds.operatingAndAds,
      growthReinvestment: Number.isFinite(parsedFunds.growthReinvestment)
        ? round2(parsedFunds.growthReinvestment)
        : base.funds.growthReinvestment,
      dividendsByPartner: {
        ...base.funds.dividendsByPartner,
        ...(parsedFunds.dividendsByPartner ?? {}),
      },
      reinvestedFromDividendsTotal: Number.isFinite(
        parsedFunds.reinvestedFromDividendsTotal,
      )
        ? round2(parsedFunds.reinvestedFromDividendsTotal)
        : base.funds.reinvestedFromDividendsTotal,
    };

    return {
      cashOnHand: round2(parsed.cashOnHand),
      collectedReceivablesCount: Number.isFinite(
        Number(parsed.collectedReceivablesCount),
      )
        ? Number(parsed.collectedReceivablesCount)
        : 0,
      exchangeRates: {
        ...base.exchangeRates,
        ...parsed.exchangeRates,
        source: parsed.exchangeRates.source ?? 'manual',
      },
      inventory: migrateInventoryWithFifo(rawInventory),
      receivables: toArray<ReceivableItem>(parsed.receivables).map((r) => ({
        ...r,
        installments: r.installments
          ? toArray<ReceivableInstallment>(r.installments)
          : undefined,
      })),
      sales: toArray<SaleRecord>(parsed.sales).map((s) => ({
        ...s,
        customerName: s.customerName || s.debtorName || 'Cliente Mostrador',
        paymentMethod: s.paymentMethod ?? 'Efectivo ($)',
        items: s.items
          ? toArray<SaleLineItem>(s.items).map((line) => ({
              ...line,
              fifoConsumed: line.fifoConsumed
                ? toArray<FifoConsumptionDetail>(line.fifoConsumed)
                : undefined,
            }))
          : undefined,
        paymentSplits: s.paymentSplits
          ? toArray<PaymentSplit>(s.paymentSplits)
          : undefined,
      })),
      purchases: toArray<PurchaseRecord>(parsed.purchases),
      purchaseBatches: toArray<PurchaseBatchRecord>(parsed.purchaseBatches).map(
        (b) => ({
          ...b,
          status: b.status ?? 'RECIBIDO EN BODEGA',
          fundingSource: b.fundingSource ?? 'cashOnHand',
          orderedTotalUnits: b.orderedTotalUnits ?? b.totalUnits,
          estimatedFreightCost: b.estimatedFreightCost ?? b.totalFreightCost,
          items: toArray<PurchaseBatchItemRecord>(b.items).map((item) => ({
            ...item,
            orderedQuantity: item.orderedQuantity ?? item.quantity,
          })),
        }),
      ),
      operatingExpenses: toArray<OperatingExpenseRecord>(
        parsed.operatingExpenses,
      ),
      capitalInjections: toArray<CapitalInjectionRecord>(
        parsed.capitalInjections,
      ),
      inventoryAdjustments: toArray<InventoryAdjustmentRecord>(
        parsed.inventoryAdjustments,
      ),
      funds: normalizedFunds,
      movements: toArray<AuditMovement>(parsed.movements),
    };
  } catch {
    return createInitialState();
  }
}
