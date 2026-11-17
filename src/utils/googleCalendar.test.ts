import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyCleanState } from '../data/initialState';
import type { InventoryItem, PurchaseBatchRecord, SaleRecord } from '../types/erp';
import { createImportOrder, registerMultiItemSale } from './finance';
import {
  addDaysToIsoDate,
  buildPurchaseArrivalCalendarEvent,
  buildSaleCalendarEvent,
  createGoogleCalendarEvent,
  GOOGLE_CALENDAR_SCOPES,
  isValidIsoDate,
  shouldSchedulePurchaseCalendarEvent,
  shouldScheduleSaleCalendarEvent,
  X4SPORT_TIMEZONE,
} from './googleCalendar';

function makeSeedStateWithInventory() {
  const base = createEmptyCleanState();
  const sku: InventoryItem = {
    id: 'sku-rm-local-l',
    team: 'Real Madrid',
    model: 'Real Madrid Local 25/26',
    version: 'Fans',
    size: 'L',
    stock: 10,
    cogs: 8.5,
    salePrice: 30,
    fifoBatches: [
      {
        batchId: 'batch-seed-1',
        batchName: 'Lote Seed',
        entryDate: '2026-11-01',
        initialQuantity: 10,
        remainingQuantity: 10,
        unitCost: 8.5,
      },
    ],
  };
  return {
    ...base,
    cashOnHand: 500,
    inventory: [sku],
  };
}

test('GOOGLE_CALENDAR_SCOPES includes all 17 configured Calendar scopes', () => {
  assert.equal(GOOGLE_CALENDAR_SCOPES.length, 17);
  assert.ok(GOOGLE_CALENDAR_SCOPES.includes('https://www.googleapis.com/auth/calendar'));
  assert.ok(GOOGLE_CALENDAR_SCOPES.includes('https://www.googleapis.com/auth/calendar.events'));
  assert.ok(GOOGLE_CALENDAR_SCOPES.includes('https://www.googleapis.com/auth/calendar.settings.readonly'));
});

test('isValidIsoDate and addDaysToIsoDate handle calendar dates accurately', () => {
  assert.equal(isValidIsoDate('2026-12-01'), true);
  assert.equal(isValidIsoDate('2026-02-30'), false);
  assert.equal(isValidIsoDate(''), false);
  assert.equal(addDaysToIsoDate('2026-11-30', 1), '2026-12-01');
  assert.equal(addDaysToIsoDate('2026-12-31', 1), '2027-01-01');
});

test('shouldSchedulePurchaseCalendarEvent triggers only with valid estimatedArrivalDate', () => {
  assert.equal(shouldSchedulePurchaseCalendarEvent({ estimatedArrivalDate: '2026-12-10' }), true);
  assert.equal(shouldSchedulePurchaseCalendarEvent({ estimatedArrivalDate: '' }), false);
  assert.equal(shouldSchedulePurchaseCalendarEvent({}), false);
});

test('shouldScheduleSaleCalendarEvent triggers for pending sales or sales with deliveryDate', () => {
  assert.equal(
    shouldScheduleSaleCalendarEvent({ paymentStatus: 'Pendiente' }),
    true,
  );
  assert.equal(
    shouldScheduleSaleCalendarEvent({
      paymentStatus: 'Cobrado',
      deliveryDate: '2026-11-28',
    }),
    true,
  );
  assert.equal(
    shouldScheduleSaleCalendarEvent({
      paymentStatus: 'Cobrado',
      deliveryDate: undefined,
    }),
    false,
  );
});

test('createImportOrder preserves estimatedArrivalDate and returns createdBatch', () => {
  const state = makeSeedStateWithInventory();
  const res = createImportOrder(state, {
    entryDate: '2026-11-17',
    estimatedArrivalDate: '2026-12-05',
    referenceName: 'Aéreo Diciembre #1',
    shippingType: 'Aéreo',
    totalFreightCost: 20,
    items: [
      {
        team: 'Real Madrid',
        model: 'Real Madrid Local 25/26',
        version: 'Player',
        size: 'M',
        quantity: 10,
        factoryUnitCost: 7.5,
        salePrice: 35,
      },
    ],
  });

  assert.equal(res.ok, true);
  assert.ok(res.createdBatch);
  assert.equal(res.createdBatch?.estimatedArrivalDate, '2026-12-05');

  const event = buildPurchaseArrivalCalendarEvent(
    res.createdBatch as PurchaseBatchRecord,
  );
  assert.equal(event.summary, '📦 Llegada de Lote: Aéreo Diciembre #1');
  assert.equal(event.start.dateTime, '2026-12-05T09:00:00-04:00');
  assert.equal(event.start.timeZone, X4SPORT_TIMEZONE);
  assert.ok(event.description.includes('Unidades totales: 10 unidades'));
  assert.ok(event.description.includes('10x Real Madrid Local 25/26'));
  assert.ok(event.description.includes('Costo total (Fábrica + Flete): $95.00 USDT'));
  assert.equal(event.reminders.overrides.length, 2);
});

test('registerMultiItemSale preserves deliveryDate, 4-layer math, and builds exact reminder', () => {
  const state = makeSeedStateWithInventory();
  const res = registerMultiItemSale(state, {
    items: [{ skuId: 'sku-rm-local-l', quantity: 2, unitPrice: 30 }],
    customerName: 'Carlos Mendoza',
    customerPhone: '0414-5559988',
    customerCity: 'Guacara',
    customerSocial: '@cmendoza',
    customerIdDoc: 'V-24.111.222',
    seller: 'Jesús',
    paymentStatus: 'Pendiente',
    paymentMethod: 'Binance USDT',
    deliveryDate: '2026-11-22',
  });

  assert.equal(res.ok, true);
  assert.ok(res.createdSale);
  assert.equal(res.createdSale?.deliveryDate, '2026-11-22');
  // Verify 4-layer financial math remains untouched for pending sales (no premature cash injection)
  assert.equal(res.state.cashOnHand, state.cashOnHand);
  assert.equal(res.state.receivables.length, state.receivables.length + 1);
  assert.equal(res.state.receivables[0].amount, 60);

  const event = buildSaleCalendarEvent(res.createdSale as SaleRecord);
  assert.equal(event.summary, '⚽ Cobro / Entrega: Carlos Mendoza');
  assert.equal(event.start.dateTime, '2026-11-22T09:00:00-04:00');
  assert.ok(event.description.includes('Monto pendiente: $60.00 USDT'));
  assert.ok(event.description.includes('Modelos de las camisetas:'));
  assert.ok(event.description.includes('0414-5559988'));
  assert.ok(event.description.includes('Guacara'));
  assert.ok(event.description.includes('@cmendoza'));
  assert.ok(event.description.includes('V-24.111.222'));
  assert.ok(event.description.includes('2x Real Madrid Local 25/26 (Fans · Talla L)'));
});

test('buildSaleCalendarEvent defaults pending sale without deliveryDate to next day and cobrado shows $0.00 pending', () => {
  const state = makeSeedStateWithInventory();
  const resPending = registerMultiItemSale(state, {
    items: [{ skuId: 'sku-rm-local-l', quantity: 1, unitPrice: 30 }],
    customerName: 'Ana Pérez',
    seller: 'Josué',
    paymentStatus: 'Pendiente',
  });

  assert.equal(resPending.ok, true);
  const sale = resPending.createdSale!;
  const expectedDate = addDaysToIsoDate(sale.createdAt.slice(0, 10), 1);
  const eventPending = buildSaleCalendarEvent(sale);
  assert.equal(eventPending.start.dateTime, `${expectedDate}T09:00:00-04:00`);
  assert.equal(eventPending.summary, '⚽ Cobro / Entrega: Ana Pérez');
  assert.ok(eventPending.description.includes('Monto pendiente: $30.00 USDT'));

  const resPaidDelivery = registerMultiItemSale(state, {
    items: [{ skuId: 'sku-rm-local-l', quantity: 1, unitPrice: 30 }],
    customerName: 'Luis Rojas',
    seller: 'Jesús',
    paymentStatus: 'Cobrado',
    deliveryDate: '2026-11-29',
  });
  assert.equal(resPaidDelivery.ok, true);
  // Paid sale credits 4-layer funds and cashOnHand normally
  assert.equal(resPaidDelivery.state.cashOnHand, state.cashOnHand + 30);
  const eventPaid = buildSaleCalendarEvent(resPaidDelivery.createdSale!);
  assert.equal(eventPaid.summary, '⚽ Cobro / Entrega: Luis Rojas');
  assert.ok(eventPaid.description.includes('Monto pendiente: $0.00 USDT'));
  assert.ok(eventPaid.description.includes('Monto total: $30.00 USDT'));
});

test('createGoogleCalendarEvent handles missing token and posts to Calendar v3 API with token', async () => {
  const noAuthRes = await createGoogleCalendarEvent(
    buildPurchaseArrivalCalendarEvent({
      id: 'b1',
      status: 'EN TRÁNSITO',
      fundingSource: 'cashOnHand',
      entryDate: '2026-11-17',
      estimatedArrivalDate: '2026-12-01',
      referenceName: 'Test Batch',
      shippingType: 'Aéreo',
      orderedTotalUnits: 5,
      totalUnits: 5,
      totalFactoryCost: 25,
      estimatedFreightCost: 10,
      totalFreightCost: 10,
      freightPerUnit: 2,
      totalLandedCost: 35,
      items: [],
      createdAt: '2026-11-17T12:00:00.000Z',
    }),
    null,
  );
  assert.equal(noAuthRes.ok, false);
  assert.equal(noAuthRes.needsAuth, true);

  const originalFetch = globalThis.fetch;
  let calledUrl = '';
  let calledAuth = '';
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calledUrl = String(input);
      calledAuth = String((init?.headers as Record<string, string>)?.Authorization ?? '');
      return new Response(
        JSON.stringify({
          id: 'evt-123',
          htmlLink: 'https://calendar.google.com/event?eid=evt-123',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    const okRes = await createGoogleCalendarEvent(
      buildPurchaseArrivalCalendarEvent({
        id: 'b1',
        status: 'EN TRÁNSITO',
        fundingSource: 'cashOnHand',
        entryDate: '2026-11-17',
        estimatedArrivalDate: '2026-12-01',
        referenceName: 'Test Batch',
        shippingType: 'Aéreo',
        orderedTotalUnits: 5,
        totalUnits: 5,
        totalFactoryCost: 25,
        estimatedFreightCost: 10,
        totalFreightCost: 10,
        freightPerUnit: 2,
        totalLandedCost: 35,
        items: [],
        createdAt: '2026-11-17T12:00:00.000Z',
      }),
      'mock-oauth-token',
    );
    assert.equal(okRes.ok, true);
    assert.equal(okRes.eventId, 'evt-123');
    assert.equal(
      calledUrl,
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    );
    assert.equal(calledAuth, 'Bearer mock-oauth-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
