import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, PARTNER_SHARES } from '../data/initialState';
import { parseDolarApiPayload } from './exchangeRatesApi';
import {
  adjustInventoryPhysicalCount,
  applyAuditAdjustments,
  calculateDiscountedUnitPrice,
  calculateFourLayerMatrix,
  collectReceivable,
  createImportOrder,
  getInventoryCascadeGroups,
  getLowStockItems,
  getTotalInventoryCostValue,
  getTotalReceivables,
  getTotalUnits,
  getTransitCapitalSummary,
  normalizeAppState,
  receiveImportBatch,
  reconcileCashOnHand,
  registerCapitalInjection,
  registerMultiItemSale,
  registerOperatingExpense,
  registerPurchase,
  registerSale,
  reinvestPartnerDividends,
  round2,
  sanitizeForFirebase,
  updateExchangeRates,
} from './finance';

test('initial seed state matches exact mandatory X4SPORT balances', () => {
  const state = createInitialState();

  assert.equal(state.cashOnHand, 120.19);
  assert.equal(getTotalReceivables(state), 263.5);
  assert.equal(getTotalUnits(state), 176);

  // Verify every initial COGS is between $5.50 and $6.80 and salePrice is configured
  for (const item of state.inventory) {
    assert.ok(
      item.cogs >= 5.5 && item.cogs <= 6.8,
      `COGS out of range for ${item.model}: ${item.cogs}`,
    );
    assert.ok(item.salePrice >= 25, `salePrice missing for ${item.model}`);
  }

  // Verify all 5 required team groups exist
  const teams = new Set(state.inventory.map((i) => i.team));
  for (const required of [
    'Barcelona',
    'Real Madrid',
    'Manchester City',
    'PSG',
    'Selecciones',
  ]) {
    assert.ok(teams.has(required as never), `Missing team ${required}`);
  }

  // Verify partner shares sum to 100%
  assert.equal(
    round2(PARTNER_SHARES.Jesús + PARTNER_SHARES.Josué + PARTNER_SHARES.Gabriel),
    1,
  );

  // Verify low stock alerts exist for <= 2 units
  assert.ok(getLowStockItems(state, 2).length > 0);
});

test('4-layer financial matrix calculates exact splits with assigned seller', () => {
  const breakdown = calculateFourLayerMatrix(25, 6.5, 1, 'Jesús');

  assert.equal(breakdown.layer1CostRecovery, 6.5);
  assert.equal(breakdown.layer2Commission, 1.0);
  assert.equal(breakdown.netProfit, 17.5);
  assert.equal(breakdown.layer3OperatingFund, 1.75);
  assert.equal(breakdown.remainingNetProfit, 15.75);
  assert.equal(breakdown.layer4GrowthReinvestment, 12.6);
  assert.equal(breakdown.layer4TotalDividends, 3.15);
  assert.equal(breakdown.partnerSplits.Jesús, 1.69);
  assert.equal(breakdown.partnerSplits.Josué, 1.27);
  assert.equal(breakdown.partnerSplits.Gabriel, 0.19);

  const totalAllocated = round2(
    breakdown.layer1CostRecovery +
      breakdown.layer2Commission +
      breakdown.layer3OperatingFund +
      breakdown.layer4GrowthReinvestment +
      breakdown.partnerSplits.Jesús +
      breakdown.partnerSplits.Josué +
      breakdown.partnerSplits.Gabriel,
  );
  assert.equal(totalAllocated, 25);
});

test('4-layer financial matrix assigns 0 commission when Sin Vendedor', () => {
  const breakdown = calculateFourLayerMatrix(25, 6.5, 1, 'Sin Vendedor');
  assert.equal(breakdown.layer2Commission, 0);
  assert.equal(breakdown.netProfit, 18.5);
  assert.equal(breakdown.layer3OperatingFund, 1.85);
  assert.equal(breakdown.remainingNetProfit, 16.65);

  const totalAllocated = round2(
    breakdown.layer1CostRecovery +
      breakdown.layer2Commission +
      breakdown.layer3OperatingFund +
      breakdown.layer4GrowthReinvestment +
      breakdown.layer4TotalDividends,
  );
  assert.equal(totalAllocated, 25);
});

test('registerSale updates inventory, cash/receivables, and 4-layer funds', () => {
  const initial = createInitialState();
  const sku = initial.inventory[0];

  const resCash = registerSale(initial, {
    skuId: sku.id,
    quantity: 2,
    finalPrice: 50,
    customerName: 'María Rodríguez',
    seller: 'Josué',
    paymentStatus: 'Cobrado',
  });

  assert.equal(resCash.ok, true);
  assert.equal(getTotalUnits(resCash.state), 174);
  assert.equal(resCash.state.cashOnHand, 170.19);
  assert.equal(resCash.state.funds.replacement, 13.0);
  assert.equal(resCash.state.funds.commissions, 2.0);
  assert.equal(resCash.state.funds.commissionsBySeller.Josué, 2.0);
  assert.equal(resCash.state.sales[0].customerName, 'María Rodríguez');

  const resCredit = registerSale(resCash.state, {
    skuId: sku.id,
    quantity: 1,
    finalPrice: 25,
    customerName: 'Carlos Pérez',
    seller: 'Sin Vendedor',
    paymentStatus: 'Pendiente',
    debtorName: 'Carlos Pérez',
  });

  assert.equal(resCredit.ok, true);
  assert.equal(getTotalUnits(resCredit.state), 173);
  assert.equal(resCredit.state.cashOnHand, 170.19);
  assert.equal(getTotalReceivables(resCredit.state), 288.5);

  const resFail = registerSale(resCredit.state, {
    skuId: sku.id,
    quantity: 99,
    finalPrice: 1000,
    customerName: 'Pedro',
    seller: 'Jesús',
    paymentStatus: 'Cobrado',
  });
  assert.equal(resFail.ok, false);
  assert.equal(getTotalUnits(resFail.state), 173);
});

test('registerPurchase creates a new FIFO batch layer and deducts cash', () => {
  const initial = createInitialState();
  const res = registerPurchase(initial, {
    team: 'Barcelona',
    model: 'Barcelona Local 25/26',
    version: 'Player',
    size: 'M',
    quantity: 10,
    unitCostWithFreight: 7.5,
  });

  assert.equal(res.ok, true);
  assert.equal(getTotalUnits(res.state), 186);
  assert.equal(res.state.cashOnHand, 45.19);
  const updatedSku = res.state.inventory.find((i) => i.id === 'sku-fcb-1');
  assert.equal(updatedSku?.stock, 20);
  assert.equal(updatedSku?.fifoBatches.length, 2);
  assert.equal(updatedSku?.cogs, 6.5);

  const resInsufficient = registerPurchase(res.state, {
    team: 'PSG',
    model: 'PSG Nuevo Modelo',
    version: 'Fan',
    size: 'M',
    quantity: 10,
    unitCostWithFreight: 6.0,
  });
  assert.equal(resInsufficient.ok, false);
});

test('collectReceivable and reinvestPartnerDividends settle balances accurately', () => {
  let state = createInitialState();
  const saleRes = registerSale(state, {
    skuId: 'sku-fcb-1',
    quantity: 2,
    finalPrice: 50,
    customerName: 'Andrés',
    seller: 'Jesús',
    paymentStatus: 'Cobrado',
  });
  state = saleRes.state;
  const jesusDiv = state.funds.dividendsByPartner.Jesús;
  const growthBefore = state.funds.growthReinvestment;
  assert.ok(jesusDiv > 0);

  const reinvestRes = reinvestPartnerDividends(state, 'Jesús');
  assert.equal(reinvestRes.ok, true);
  state = reinvestRes.state;
  assert.equal(state.funds.dividendsByPartner.Jesús, 0);
  assert.equal(
    state.funds.growthReinvestment,
    round2(growthBefore + jesusDiv),
  );

  const cashBefore = state.cashOnHand;
  const collectRes = collectReceivable(state, 'rec-3');
  assert.equal(collectRes.ok, true);
  state = collectRes.state;
  assert.equal(state.cashOnHand, round2(cashBefore + 8.5));
  assert.equal(getTotalReceivables(state), 255.0);

  const rateRes = updateExchangeRates(state, 47.2, 55.0, 'api');
  assert.equal(rateRes.ok, true);
  assert.equal(rateRes.state.exchangeRates.bcv, 47.2);
  assert.equal(rateRes.state.exchangeRates.usdt, 55.0);
  assert.equal(rateRes.state.exchangeRates.source, 'api');
});

test('registerMultiItemSale deducts multiple SKUs, consolidates COGS & 4-layer matrix, and prevents duplicate over-sell', () => {
  const initial = createInitialState();
  const sku1 = initial.inventory[0];
  const sku2 = initial.inventory[5];

  const res = registerMultiItemSale(initial, {
    items: [
      { skuId: sku1.id, quantity: 2, unitPrice: 25 },
      { skuId: sku2.id, quantity: 1, unitPrice: 30 },
    ],
    customerName: 'Diego Morales',
    seller: 'Jesús',
    paymentStatus: 'Cobrado',
  });

  assert.equal(res.ok, true);
  assert.equal(getTotalUnits(res.state), 173);
  assert.equal(res.state.cashOnHand, 200.19);
  assert.equal(res.state.inventory.find((i) => i.id === sku1.id)?.stock, 8);
  assert.equal(res.state.inventory.find((i) => i.id === sku2.id)?.stock, 10);

  assert.equal(res.state.funds.replacement, 19.6);
  assert.equal(res.state.funds.commissions, 3.2);
  assert.equal(res.state.funds.operatingAndAds, 5.72);
  assert.equal(res.state.funds.growthReinvestment, 41.18);
  const totalDivs = round2(
    res.state.funds.dividendsByPartner.Jesús +
      res.state.funds.dividendsByPartner.Josué +
      res.state.funds.dividendsByPartner.Gabriel,
  );
  assert.equal(totalDivs, 10.3);

  assert.equal(res.state.sales.length, 1);
  assert.equal(res.state.sales[0].customerName, 'Diego Morales');
  assert.equal(res.state.sales[0].items?.length, 2);
  assert.equal(res.state.sales[0].quantity, 3);
  assert.equal(res.state.sales[0].finalPrice, 80);

  const overSell = registerMultiItemSale(res.state, {
    items: [
      { skuId: sku1.id, quantity: 5, unitPrice: 25 },
      { skuId: sku1.id, quantity: 4, unitPrice: 25 },
    ],
    customerName: 'Luis',
    seller: 'Sin Vendedor',
    paymentStatus: 'Pendiente',
    debtorName: 'Luis',
  });
  assert.equal(overSell.ok, false);
  assert.equal(getTotalUnits(overSell.state), 173);
});

test('two-stage import order creates EN TRÁNSITO batch without adding stock, then receiveImportBatch ingests FIFO', () => {
  let state = createInitialState();

  const colRes = collectReceivable(state, 'rec-6', 'Pago Móvil / Bs');
  assert.equal(colRes.ok, true);
  state = colRes.state;
  assert.equal(state.cashOnHand, 270.19);

  // Stage 1: Create EN TRÁNSITO order (10 uds, factory $56 + freight est $30 = $86)
  const batchRes = createImportOrder(state, {
    entryDate: '2026-11-14',
    referenceName: 'Aéreo Noviembre',
    shippingType: 'Aéreo',
    totalFreightCost: 30,
    items: [
      {
        team: 'Barcelona',
        model: 'Barcelona Retro 08/09',
        version: 'Player',
        size: 'XL',
        quantity: 4,
        factoryUnitCost: 5.0,
      },
      {
        team: 'Otro',
        model: 'Milan Retro 94',
        version: 'Retro',
        size: 'L',
        quantity: 6,
        factoryUnitCost: 6.0,
      },
    ],
  });

  assert.equal(batchRes.ok, true);
  state = batchRes.state;
  assert.equal(state.cashOnHand, round2(270.19 - 86.0));
  assert.equal(getTotalUnits(state), 176); // Stock MUST NOT increase while EN TRÁNSITO
  assert.equal(state.purchaseBatches.length, 1);
  assert.equal(state.purchaseBatches[0].status, 'EN TRÁNSITO');

  const transitSummary = getTransitCapitalSummary(state);
  assert.equal(transitSummary.transitCount, 1);
  assert.equal(transitSummary.transitUnits, 10);
  assert.equal(transitSummary.transitCapital, 86.0);

  // Stage 2: Receive batch into warehouse with exact freight & quantities
  const receiveRes = receiveImportBatch(state, {
    batchId: state.purchaseBatches[0].id,
    receivedDate: '2026-11-18',
    actualFreightCost: 30,
    receivedItems: [
      { itemIndex: 0, receivedQuantity: 4 },
      { itemIndex: 1, receivedQuantity: 6 },
    ],
  });
  assert.equal(receiveRes.ok, true);
  state = receiveRes.state;
  assert.equal(getTotalUnits(state), 186);
  assert.equal(state.purchaseBatches[0].status, 'RECIBIDO EN BODEGA');
  assert.equal(state.purchaseBatches[0].receivedDate, '2026-11-18');
  assert.equal(state.purchaseBatches[0].freightPerUnit, 3.0);
  assert.equal(state.purchaseBatches[0].items[0].landedUnitCost, 8.0);
  assert.equal(state.purchaseBatches[0].items[1].landedUnitCost, 9.0);
  assert.equal(getTransitCapitalSummary(state).transitCount, 0);

  // Sell 3 units of Barcelona Retro 08/09 (had 2 @ 6.80 + 4 @ 8.00 -> FIFO COGS = 2*6.80 + 1*8.00 = 21.60)
  const saleRes = registerMultiItemSale(state, {
    items: [{ skuId: 'sku-fcb-5', quantity: 3, unitPrice: 30 }],
    customerName: 'Ricardo Gómez',
    seller: 'Gabriel',
    paymentStatus: 'Cobrado',
    paymentMethod: 'Pago Móvil / Bs',
  });

  assert.equal(saleRes.ok, true);
  state = saleRes.state;
  assert.equal(state.funds.replacement, 21.6);
  assert.equal(state.sales[0].paymentMethod, 'Pago Móvil / Bs');
  assert.equal(state.sales[0].bcvEquivalent, round2(90 * state.exchangeRates.bcv));

  const retroSku = state.inventory.find((i) => i.id === 'sku-fcb-5');
  assert.equal(retroSku?.stock, 3);
  assert.equal(retroSku?.cogs, 8.0);
});

test('parseDolarApiPayload extracts official BCV and parallel USDT rates cleanly', () => {
  const sample = [
    {
      fuente: 'oficial',
      nombre: 'Dólar',
      promedio: 911.6243,
      fechaActualizacion: '2026-11-13T00:00:00-04:00',
    },
    {
      fuente: 'paralelo',
      nombre: 'Paralelo',
      promedio: 1074.348869,
      fechaActualizacion: '2026-11-15T04:02:17.647Z',
    },
  ];
  const parsed = parseDolarApiPayload(sample);
  assert.deepEqual(parsed, {
    bcv: 911.62,
    usdt: 1074.35,
    updatedAt: '2026-11-15T04:02:17.647Z',
  });
  assert.equal(parseDolarApiPayload({ invalid: true }), null);
});

test('customerName is required and quick pricing buttons calculate Al Mayor & Descuento accurately', () => {
  const initial = createInitialState();
  const missingCustomer = registerMultiItemSale(initial, {
    items: [{ skuId: 'sku-fcb-1', quantity: 1, unitPrice: 30 }],
    customerName: '   ',
    seller: 'Jesús',
    paymentStatus: 'Cobrado',
  });
  assert.equal(missingCustomer.ok, false);

  const wholesale = calculateDiscountedUnitPrice(30, 'wholesale');
  assert.equal(wholesale.unitPrice, 24);
  assert.equal(wholesale.discountLabel, 'Al Mayor (-20%)');

  const pctDiscount = calculateDiscountedUnitPrice(25, 'discount_pct', 10);
  assert.equal(pctDiscount.unitPrice, 22.5);

  const usdDiscount = calculateDiscountedUnitPrice(32, 'discount_usd', 4.5);
  assert.equal(usdDiscount.unitPrice, 27.5);
});

test('Pago Mixto validates exact split sum and computes BCV conversion for Pago Móvil leg', () => {
  const initial = createInitialState();

  // Mismatched split sum rejected
  const mismatch = registerMultiItemSale(initial, {
    items: [{ skuId: 'sku-fcb-1', quantity: 2, unitPrice: 30 }], // $60
    customerName: 'Valeria Silva',
    seller: 'Jesús',
    paymentStatus: 'Cobrado',
    paymentMethod: 'Pago Mixto',
    paymentSplits: [
      { method: 'Efectivo ($)', amountUsd: 30 },
      { method: 'Pago Móvil / Bs', amountUsd: 20 }, // 50 != 60
    ],
  });
  assert.equal(mismatch.ok, false);

  // Exact split sum accepted
  const valid = registerMultiItemSale(initial, {
    items: [{ skuId: 'sku-fcb-1', quantity: 2, unitPrice: 30 }], // $60
    customerName: 'Valeria Silva',
    seller: 'Jesús',
    paymentStatus: 'Cobrado',
    paymentMethod: 'Pago Mixto',
    paymentSplits: [
      { method: 'Efectivo ($)', amountUsd: 40 },
      { method: 'Pago Móvil / Bs', amountUsd: 20 },
    ],
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.state.sales[0].paymentMethod, 'Pago Mixto');
  assert.equal(valid.state.sales[0].paymentSplits?.length, 2);
  assert.equal(
    valid.state.sales[0].bcvEquivalent,
    round2(20 * valid.state.exchangeRates.bcv),
  );
  assert.equal(valid.state.cashOnHand, round2(120.19 + 60));
});

test('registerOperatingExpense (Caja Chica) deducts cash/operating fund and prevents overdraft', () => {
  let state = createInitialState();
  // First sell 2x $30 so operatingAndAds > 0 ($60 - $13 COGS - $2.40 comm = $44.60 net -> 10% = $4.46)
  const sale = registerMultiItemSale(state, {
    items: [{ skuId: 'sku-fcb-1', quantity: 2, unitPrice: 30 }],
    customerName: 'Cliente A',
    seller: 'Jesús',
    paymentStatus: 'Cobrado',
  });
  state = sale.state;
  const opBefore = state.funds.operatingAndAds; // 4.46
  const cashBefore = state.cashOnHand;

  const overOp = registerOperatingExpense(state, {
    concept: 'Publicidad IG',
    amount: 10,
    source: 'operatingFund',
  });
  assert.equal(overOp.ok, false);

  const okOp = registerOperatingExpense(state, {
    concept: 'Bolsas y empaque',
    amount: 3.5,
    source: 'operatingFund',
    paymentMethod: 'Efectivo ($)',
  });
  assert.equal(okOp.ok, true);
  assert.equal(okOp.state.funds.operatingAndAds, round2(opBefore - 3.5));
  assert.equal(okOp.state.cashOnHand, round2(cashBefore - 3.5));
  assert.equal(okOp.state.operatingExpenses.length, 1);
});

test('adjustInventoryPhysicalCount adjusts stock and keeps FIFO batch totals synchronized', () => {
  let state = createInitialState();

  // Shortage on sku-fcb-1 (10 -> 8)
  const shrink = adjustInventoryPhysicalCount(state, {
    skuId: 'sku-fcb-1',
    newStock: 8,
    reason: 'Conteo físico semanal',
  });
  assert.equal(shrink.ok, true);
  state = shrink.state;
  const skuAfterShrink = state.inventory.find((i) => i.id === 'sku-fcb-1');
  assert.equal(skuAfterShrink?.stock, 8);
  assert.equal(
    skuAfterShrink?.fifoBatches.reduce((s, b) => s + b.remainingQuantity, 0),
    8,
  );

  // Surplus on sku-fcb-1 (8 -> 11)
  const surplus = adjustInventoryPhysicalCount(state, {
    skuId: 'sku-fcb-1',
    newStock: 11,
    reason: 'Camisetas halladas en depósito',
  });
  assert.equal(surplus.ok, true);
  state = surplus.state;
  const skuAfterSurplus = state.inventory.find((i) => i.id === 'sku-fcb-1');
  assert.equal(skuAfterSurplus?.stock, 11);
  assert.equal(
    skuAfterSurplus?.fifoBatches.reduce((s, b) => s + b.remainingQuantity, 0),
    11,
  );
  assert.equal(state.inventoryAdjustments.length, 2);
});

test('receiveImportBatch adjusts freight variance on cash/growthReinvestment and prorates across actual arrived units', () => {
  let state = createInitialState();
  // Sell 5 Player shirts at $30 ($150) so growthReinvestment builds up (~$80.28)
  const sale = registerMultiItemSale(state, {
    items: [{ skuId: 'sku-fcb-1', quantity: 5, unitPrice: 30 }],
    customerName: 'Cliente Frecuente',
    seller: 'Jesús',
    paymentStatus: 'Cobrado',
  });
  state = sale.state;
  const growthBefore = state.funds.growthReinvestment; // ~80.28
  const cashBefore = state.cashOnHand; // 270.19

  // Stage 1: Order 10 units @ $5 factory + $10 estimated freight ($60 total) funded from growthReinvestment
  const orderRes = createImportOrder(state, {
    entryDate: '2026-11-15',
    referenceName: 'Marítimo Dic',
    shippingType: 'Marítimo',
    totalFreightCost: 10,
    fundingSource: 'growthReinvestment',
    items: [
      {
        team: 'Otro',
        model: 'Arsenal Retro 02',
        version: 'Retro',
        size: 'M',
        quantity: 10,
        factoryUnitCost: 5.0,
      },
    ],
  });
  assert.equal(orderRes.ok, true);
  state = orderRes.state;
  assert.equal(state.cashOnHand, round2(cashBefore - 60));
  assert.equal(state.funds.growthReinvestment, round2(growthBefore - 60));
  // Not in inventory yet
  assert.equal(
    state.inventory.find((i) => i.model === 'Arsenal Retro 02'),
    undefined,
  );

  // Stage 2: Only 8 units arrive, and actual courier freight was $16 (+$6 higher than $10 est)
  const recHigher = receiveImportBatch(state, {
    batchId: state.purchaseBatches[0].id,
    receivedDate: '2026-11-25',
    actualFreightCost: 16,
    receivedItems: [{ itemIndex: 0, receivedQuantity: 8 }],
  });
  assert.equal(recHigher.ok, true);
  state = recHigher.state;

  // Extra $6 deducted from BOTH cashOnHand and growthReinvestment
  assert.equal(state.cashOnHand, round2(cashBefore - 66));
  assert.equal(state.funds.growthReinvestment, round2(growthBefore - 66));
  // Real landed cost = $5 factory + ($16 / 8 arrived = $2.00) = $7.00/ud
  assert.equal(state.purchaseBatches[0].freightAdjustment, 6);
  assert.equal(state.purchaseBatches[0].freightPerUnit, 2.0);
  assert.equal(state.purchaseBatches[0].items[0].landedUnitCost, 7.0);
  const arsenalSku = state.inventory.find((i) => i.model === 'Arsenal Retro 02');
  assert.equal(arsenalSku?.stock, 8);
  assert.equal(arsenalSku?.cogs, 7.0);
  assert.equal(arsenalSku?.fifoBatches[0].entryDate, '2026-11-25');

  // Test freight refund (< estimated): another order with $20 est freight, actual freight $14 -> +$6 refunded to cash
  const cashNow = state.cashOnHand;
  const order2 = createImportOrder(state, {
    entryDate: '2026-11-26',
    referenceName: 'Aéreo Express',
    shippingType: 'Aéreo',
    totalFreightCost: 20,
    fundingSource: 'cashOnHand',
    items: [
      {
        team: 'Barcelona',
        model: 'Barcelona Local 25/26',
        version: 'Player',
        size: 'M',
        quantity: 2,
        factoryUnitCost: 6.0,
      },
    ],
  });
  assert.equal(order2.ok, true);
  state = order2.state;
  assert.equal(state.cashOnHand, round2(cashNow - 32));

  const recLower = receiveImportBatch(state, {
    batchId: state.purchaseBatches[0].id,
    receivedDate: '2026-11-28',
    actualFreightCost: 14,
    receivedItems: [{ itemIndex: 0, receivedQuantity: 2 }],
  });
  assert.equal(recLower.ok, true);
  state = recLower.state;
  assert.equal(state.cashOnHand, round2(cashNow - 26)); // $6 refunded!
  assert.equal(state.purchaseBatches[0].freightAdjustment, -6);
});

test('getInventoryCascadeGroups groups SKUs by Model + Version and sums all sizes', () => {
  const state = createInitialState();
  const groups = getInventoryCascadeGroups(state.inventory);

  // Barcelona Local 25/26 Player has M(10) + L(8) = 18 uds
  const fcbPlayer = groups.find(
    (g) => g.model === 'Barcelona Local 25/26' && g.version === 'Player',
  );
  assert.ok(fcbPlayer);
  assert.equal(fcbPlayer.expectedStock, 18);
  assert.deepEqual(
    fcbPlayer.items.map((i) => i.size),
    ['M', 'L'],
  );

  // Total across all groups matches 176 units
  const totalGrouped = groups.reduce((s, g) => s + g.expectedStock, 0);
  assert.equal(totalGrouped, 176);
});

test('applyAuditAdjustments consumes oldest FIFO layer on shortages, records fifoLossCost, and adjusts surpluses', () => {
  let state = createInitialState();

  // Add a second newer FIFO batch to sku-fcb-1 (had 10 @ $6.50 on 2026-11-01) -> add 5 @ $8.00 on 2026-11-20
  const order = createImportOrder(state, {
    entryDate: '2026-11-18',
    referenceName: 'Reposición FCB',
    shippingType: 'Aéreo',
    totalFreightCost: 5,
    items: [
      {
        team: 'Barcelona',
        model: 'Barcelona Local 25/26',
        version: 'Player',
        size: 'M',
        quantity: 5,
        factoryUnitCost: 7.0,
      },
    ],
  });
  assert.equal(order.ok, true);
  state = receiveImportBatch(order.state, {
    batchId: order.state.purchaseBatches[0].id,
    receivedDate: '2026-11-20',
    actualFreightCost: 5,
    receivedItems: [{ itemIndex: 0, receivedQuantity: 5 }],
  }).state;
  // sku-fcb-1 now has 15 uds: 10 @ 6.50 + 5 @ 8.00

  // Audit: sku-fcb-1 shortage 15 -> 4 (-11 uds: consumes 10 @ 6.50 + 1 @ 8.00 = $73.00 FIFO loss)
  //        sku-fcb-2 surplus 8 -> 10 (+2 uds)
  const auditRes = applyAuditAdjustments(state, {
    items: [
      { skuId: 'sku-fcb-1', newStock: 4 },
      { skuId: 'sku-fcb-2', newStock: 10 },
    ],
    reason: '',
    auditMode: 'cascade',
  });
  assert.equal(auditRes.ok, true);
  state = auditRes.state;

  const sku1 = state.inventory.find((i) => i.id === 'sku-fcb-1');
  const sku2 = state.inventory.find((i) => i.id === 'sku-fcb-2');
  assert.equal(sku1?.stock, 4);
  assert.equal(sku1?.cogs, 8.0); // Oldest $6.50 layer fully consumed, remaining 4 are from $8.00 batch!
  assert.equal(sku2?.stock, 10);

  const recForSku1 = state.inventoryAdjustments.find((a) => a.skuId === 'sku-fcb-1');
  assert.equal(recForSku1?.delta, -11);
  assert.equal(recForSku1?.fifoLossCost, 73.0);
  assert.equal(recForSku1?.reason, 'Conteo físico de auditoría');
  assert.equal(recForSku1?.auditMode, 'cascade');
});

test('sanitizeForFirebase removes undefined fields and normalizeAppState preserves empty arrays from RTDB', () => {
  let state = createInitialState();
  // Collect all initial receivables so receivables becomes []
  for (const rec of [...state.receivables]) {
    state = collectReceivable(state, rec.id, 'Efectivo ($)').state;
  }
  assert.equal(state.receivables.length, 0);

  // Add a sale with optional undefined properties
  const saleRes = registerMultiItemSale(state, {
    items: [{ skuId: 'sku-fcb-1', quantity: 1, unitPrice: 30 }],
    customerName: 'Cliente Cloud',
    seller: 'Sin Vendedor',
    paymentStatus: 'Cobrado',
  });
  state = saleRes.state;

  const sanitized = sanitizeForFirebase(state);
  assert.equal(
    JSON.stringify(sanitized).includes('undefined'),
    false,
  );
  assert.equal('debtorName' in sanitized.sales[0], false);

  // Simulate RTDB dropping empty arrays and turning inventory into an indexed object map
  const rtdbSnapshot = {
    ...sanitized,
    receivables: undefined,
    purchaseBatches: undefined,
    inventory: { '0': sanitized.inventory[0] },
  };
  const hydrated = normalizeAppState(rtdbSnapshot);
  assert.equal(hydrated.receivables.length, 0); // Must NOT resurrect initial seed receivables!
  assert.equal(hydrated.purchaseBatches.length, 0);
  assert.equal(hydrated.inventory.length, 1);
  assert.equal(hydrated.sales.length, 1);
});

test('collectReceivable supports partial abonos and updates linked SaleRecord.paymentStatus when settled', () => {
  let state = createInitialState();

  // Credit sale of $30.00 creates receivable linked by saleId
  const creditSale = registerMultiItemSale(state, {
    items: [{ skuId: 'sku-fcb-1', quantity: 1, unitPrice: 30 }],
    customerName: 'Andrea Mendoza',
    seller: 'Jesús',
    paymentStatus: 'Pendiente',
    debtorName: 'Andrea Mendoza',
  });
  assert.equal(creditSale.ok, true);
  state = creditSale.state;

  const createdSale = state.sales[0];
  assert.equal(createdSale.paymentStatus, 'Pendiente');
  const linkedRec = state.receivables.find((r) => r.saleId === createdSale.id);
  assert.ok(linkedRec);
  assert.equal(linkedRec.amount, 30);

  // Overpayment rejected
  const overpay = collectReceivable(state, linkedRec.id, 'Efectivo ($)', 35);
  assert.equal(overpay.ok, false);

  // Partial abono $10.00 -> remaining $20.00, sale stays Pendiente, collectedReceivablesCount stays 0
  const abono1 = collectReceivable(state, linkedRec.id, 'Zelle', 10);
  assert.equal(abono1.ok, true);
  state = abono1.state;
  assert.equal(state.cashOnHand, round2(120.19 + 10));
  assert.equal(state.collectedReceivablesCount, 0);
  const recAfterAbono1 = state.receivables.find((r) => r.id === linkedRec.id);
  assert.ok(recAfterAbono1);
  assert.equal(recAfterAbono1.amount, 20);
  assert.equal(recAfterAbono1.originalAmount, 30);
  assert.equal(recAfterAbono1.paidAmount, 10);
  assert.equal(recAfterAbono1.installments?.length, 1);
  assert.equal(
    state.sales.find((s) => s.id === createdSale.id)?.paymentStatus,
    'Pendiente',
  );

  // Final abono $20.00 -> liquidated, removed from receivables, linked sale becomes Cobrado
  const abono2 = collectReceivable(state, linkedRec.id, 'Efectivo ($)', 20);
  assert.equal(abono2.ok, true);
  state = abono2.state;
  assert.equal(state.cashOnHand, round2(120.19 + 30));
  assert.equal(state.collectedReceivablesCount, 1);
  assert.equal(
    state.receivables.find((r) => r.id === linkedRec.id),
    undefined,
  );
  assert.equal(
    state.sales.find((s) => s.id === createdSale.id)?.paymentStatus,
    'Cobrado',
  );
});

test('registerCapitalInjection and reconcileCashOnHand update liquidity without modifying FIFO inventory cost', () => {
  let state = createInitialState();
  const unitsBefore = getTotalUnits(state);
  const cogsValueBefore = getTotalInventoryCostValue(state);
  const batchesSnapshotBefore = JSON.stringify(
    state.inventory.map((i) => i.fifoBatches),
  );

  // Reject invalid injection
  const badInj = registerCapitalInjection(state, {
    contributor: '   ',
    concept: 'Aporte',
    amount: 50,
  });
  assert.equal(badInj.ok, false);

  // Valid capital injection earmarked to growthReinvestment
  const injRes = registerCapitalInjection(state, {
    contributor: 'Jesús',
    concept: 'Liquidez para lote navideño',
    amount: 100,
    paymentMethod: 'Binance USDT',
    destination: 'growthReinvestment',
  });
  assert.equal(injRes.ok, true);
  state = injRes.state;
  assert.equal(state.cashOnHand, round2(120.19 + 100));
  assert.equal(state.funds.growthReinvestment, 100);
  assert.equal(state.capitalInjections.length, 1);
  assert.equal(state.movements[0].type, 'capital_injection');

  // Reconcile cash exact count ($225.00)
  const sameCash = reconcileCashOnHand(state, { countedCash: 220.19 });
  assert.equal(sameCash.ok, false);

  const recRes = reconcileCashOnHand(state, {
    countedCash: 225.0,
    reason: 'Arqueo de cierre',
  });
  assert.equal(recRes.ok, true);
  state = recRes.state;
  assert.equal(state.cashOnHand, 225.0);
  assert.equal(state.movements[0].type, 'reconciliation');
  assert.equal(state.movements[0].amount, 4.81);

  // Inventory units, total COGS value, and FIFO batches MUST remain 100% untouched
  assert.equal(getTotalUnits(state), unitsBefore);
  assert.equal(getTotalInventoryCostValue(state), cogsValueBefore);
  assert.equal(
    JSON.stringify(state.inventory.map((i) => i.fifoBatches)),
    batchesSnapshotBefore,
  );

  // Verify sanitizeForFirebase & normalizeAppState roundtrip with capitalInjections & installments
  const abonoState = collectReceivable(state, 'rec-3', 'Efectivo ($)', 3.5).state;
  const sanitized = sanitizeForFirebase(abonoState);
  const hydrated = normalizeAppState({
    ...sanitized,
    capitalInjections: { '0': sanitized.capitalInjections[0] },
    receivables: sanitized.receivables.map((r) =>
      r.id === 'rec-3' && r.installments
        ? { ...r, installments: { '0': r.installments[0] } }
        : r,
    ),
  });
  assert.equal(hydrated.capitalInjections.length, 1);
  assert.equal(
    hydrated.receivables.find((r) => r.id === 'rec-3')?.installments?.length,
    1,
  );
});

