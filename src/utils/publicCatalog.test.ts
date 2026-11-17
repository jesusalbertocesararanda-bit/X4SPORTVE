import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSeedState, createEmptyCleanState } from '../data/initialState';
import { normalizeAppState, registerMultiItemSale } from './finance';
import {
  advanceWhatsAppTurnIndex,
  buildCatalogWhatsAppHref,
  buildPublicCatalogGroups,
  buildShareableCatalogUrl,
  buildUpcomingTransitCards,
  calculateCatalogBsPrice,
  CATALOG_WHATSAPP_ADVISORS,
  computeTransitDaysRemaining,
  convertGoogleDriveUrlToDirect,
  extractGoogleDriveFileId,
  filterPublicCatalogGroups,
  filterUpcomingTransitCards,
  getCurrentWhatsAppTurnIndex,
  isPublicCatalogModeFromLocation,
  isRateValid,
  normalizeCatalogImageUrl,
  normalizeCatalogModelKey,
} from './publicCatalog';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

test('buildPublicCatalogGroups reads real FIFO stock and hides 0-stock sizes/models automatically', () => {
  const state = createDemoSeedState();
  // Drain sku-psg-4 (PSG Tercera Edición, only 1 in stock) to 0 via real sale
  const soldOutRes = registerMultiItemSale(state, {
    items: [{ skuId: 'sku-psg-4', quantity: 1, unitPrice: 25 }],
    customerName: 'Cliente Test',
    seller: 'Jesús',
    paymentStatus: 'Cobrado',
    paymentMethod: 'Efectivo ($)',
  });
  assert.equal(soldOutRes.ok, true);

  const groups = buildPublicCatalogGroups(soldOutRes.state);
  const psgGroup = groups.find((g) => g.team === 'PSG');
  assert.ok(psgGroup);
  assert.equal(
    psgGroup.products.some((p) => p.model === 'PSG Tercera Edición'),
    false,
  );
  // Canonical ordering puts Barcelona first
  assert.equal(groups[0].team, 'Barcelona');
  const barcaLocalPlayer = groups[0].products.find(
    (p) => p.model === 'Barcelona Local 25/26' && p.version === 'Player',
  );
  assert.ok(barcaLocalPlayer);
  assert.deepEqual(
    barcaLocalPlayer.sizes.map((s) => s.size),
    ['M', 'L'],
  );
  assert.equal(barcaLocalPlayer.totalStock, 18);
});

test('filterPublicCatalogGroups filters in real time by player names, sizes, versions, and custom keywords', () => {
  const base = createDemoSeedState();
  const key = normalizeCatalogModelKey('Barcelona Retro 08/09', 'Player');
  base.catalogKeywords = { [key]: 'Ronaldinho Puyol 2009' };

  const groups = buildPublicCatalogGroups(base);

  // Player alias search: Lamine Yamal -> Barcelona (+ Selección España)
  const yamalRes = filterPublicCatalogGroups(groups, 'Lamine Yamal');
  assert.ok(yamalRes.some((g) => g.team === 'Barcelona'));
  const seleccionesYamal = yamalRes.find((g) => g.team === 'Selecciones');
  if (seleccionesYamal) {
    assert.ok(
      seleccionesYamal.products.every((p) => p.model.includes('España')),
    );
  }

  // Player alias search with accent normalization: Mbappé / Bellingham -> Real Madrid
  const bellinghamRes = filterPublicCatalogGroups(groups, 'Bellingham');
  assert.equal(bellinghamRes.length, 1);
  assert.equal(bellinghamRes[0].team, 'Real Madrid');

  const mbappeRes = filterPublicCatalogGroups(groups, 'Mbappé');
  assert.equal(mbappeRes.length, 1);
  assert.equal(mbappeRes[0].team, 'Real Madrid');

  // Size filter by text token XL
  const xlRes = filterPublicCatalogGroups(groups, 'XL');
  assert.ok(xlRes.length >= 3);
  for (const g of xlRes) {
    for (const p of g.products) {
      assert.ok(p.sizes.some((s) => s.size === 'XL'));
    }
  }

  // Version filter: Fan -> matches Fans
  const fanRes = filterPublicCatalogGroups(groups, 'Fan');
  assert.ok(fanRes.length >= 4);
  for (const g of fanRes) {
    for (const p of g.products) {
      assert.equal(p.version, 'Fans');
    }
  }

  // Custom keyword filter
  const customRes = filterPublicCatalogGroups(groups, 'Ronaldinho');
  assert.equal(customRes.length, 1);
  assert.equal(customRes[0].products[0].model, 'Barcelona Retro 08/09');
});

test('buildUpcomingTransitCards exposes only EN TRÁNSITO batches and filters properly', () => {
  const state = createEmptyCleanState();
  state.purchaseBatches = [
    {
      id: 'batch-transit-1',
      status: 'EN TRÁNSITO',
      fundingSource: 'cashOnHand',
      entryDate: '2026-11-15',
      estimatedArrivalDate: '2026-12-02',
      referenceName: 'Aéreo Diciembre #1',
      shippingType: 'Aéreo',
      orderedTotalUnits: 12,
      totalUnits: 12,
      totalFactoryCost: 72,
      estimatedFreightCost: 24,
      totalFreightCost: 24,
      freightPerUnit: 2,
      totalLandedCost: 96,
      createdAt: '2026-11-15T10:00:00.000Z',
      items: [
        {
          team: 'Real Madrid',
          model: 'Real Madrid Local 25/26',
          version: 'Player',
          size: 'M',
          orderedQuantity: 6,
          quantity: 6,
          salePrice: 30,
          factoryUnitCost: 6,
          proratedFreightPerUnit: 2,
          landedUnitCost: 8,
          lineFactoryTotal: 36,
          lineLandedTotal: 48,
        },
        {
          team: 'Real Madrid',
          model: 'Real Madrid Local 25/26',
          version: 'Player',
          size: 'L',
          orderedQuantity: 6,
          quantity: 6,
          salePrice: 30,
          factoryUnitCost: 6,
          proratedFreightPerUnit: 2,
          landedUnitCost: 8,
          lineFactoryTotal: 36,
          lineLandedTotal: 48,
        },
      ],
    },
    {
      id: 'batch-received-1',
      status: 'RECIBIDO EN BODEGA',
      fundingSource: 'cashOnHand',
      entryDate: '2026-11-01',
      receivedDate: '2026-11-10',
      referenceName: 'Lote Ya En Bodega',
      shippingType: 'Aéreo',
      orderedTotalUnits: 4,
      totalUnits: 4,
      totalFactoryCost: 24,
      estimatedFreightCost: 8,
      totalFreightCost: 8,
      freightPerUnit: 2,
      totalLandedCost: 32,
      createdAt: '2026-11-01T10:00:00.000Z',
      items: [
        {
          team: 'PSG',
          model: 'PSG Local 25/26',
          version: 'Fans',
          size: 'S',
          orderedQuantity: 4,
          quantity: 4,
          factoryUnitCost: 6,
          proratedFreightPerUnit: 2,
          landedUnitCost: 8,
          lineFactoryTotal: 24,
          lineLandedTotal: 32,
        },
      ],
    },
  ];

  const transitCards = buildUpcomingTransitCards(state, '2026-11-15');
  assert.equal(transitCards.length, 1);
  assert.equal(transitCards[0].model, 'Real Madrid Local 25/26');
  assert.equal(transitCards[0].totalIncomingUnits, 12);
  assert.equal(transitCards[0].estimatedArrivalDate, '2026-12-02');
  assert.equal(transitCards[0].estimatedDaysRemaining, 17);
  assert.equal(transitCards[0].estimatedArrivalLabel, 'Llega en ~17 días');
  assert.deepEqual(
    transitCards[0].sizes.map((s) => s.size),
    ['M', 'L'],
  );

  assert.equal(filterUpcomingTransitCards(transitCards, 'Bellingham').length, 1);
  assert.equal(filterUpcomingTransitCards(transitCards, 'PSG').length, 0);
});

test('calculateCatalogBsPrice converts USD prices strictly with USDT/Paralelo rate and computeTransitDaysRemaining handles explicit & SLA ETAs', () => {
  // 30 USD at 54.20 USDT = 1626.00 Bs
  assert.equal(calculateCatalogBsPrice(30, 54.2), 1626);
  assert.equal(calculateCatalogBsPrice(25.5, 53.75), 1370.63);
  // Protege márgenes si la tasa es inválida, 0, nula o negativa
  assert.equal(calculateCatalogBsPrice(-10, 54.2), null);
  assert.equal(calculateCatalogBsPrice(25, Number.NaN), null);
  assert.equal(calculateCatalogBsPrice(25, 0), null);
  assert.equal(calculateCatalogBsPrice(25, -5), null);
  assert.equal(calculateCatalogBsPrice(25, null as unknown as number), null);
  assert.equal(calculateCatalogBsPrice(25, undefined), null);
  assert.equal(isRateValid(54.2), true);
  assert.equal(isRateValid(0), false);
  assert.equal(isRateValid(null), false);
  assert.equal(isRateValid(Number.NaN), false);

  // Explicit estimated arrival date
  assert.deepEqual(
    computeTransitDaysRemaining(
      {
        entryDate: '2026-11-01',
        estimatedArrivalDate: '2026-11-22',
        shippingType: 'Aéreo',
      },
      '2026-11-15',
    ),
    { daysRemaining: 7, label: 'Llega en ~7 días' },
  );

  // Tomorrow & Today
  assert.deepEqual(
    computeTransitDaysRemaining(
      { estimatedArrivalDate: '2026-11-16', shippingType: 'Aéreo' },
      '2026-11-15',
    ),
    { daysRemaining: 1, label: 'Llega mañana (~1 día)' },
  );
  assert.deepEqual(
    computeTransitDaysRemaining(
      { estimatedArrivalDate: '2026-11-15', shippingType: 'Aéreo' },
      '2026-11-15',
    ),
    { daysRemaining: 0, label: 'Llegada estimada hoy' },
  );

  // Overdue / arriving this week
  assert.deepEqual(
    computeTransitDaysRemaining(
      { estimatedArrivalDate: '2026-11-12', shippingType: 'Aéreo' },
      '2026-11-15',
    ),
    { daysRemaining: -3, label: 'Por arribar esta semana' },
  );

  // Fallback to SLA (15d Aéreo, 80d Marítimo) when estimatedArrivalDate is omitted
  assert.deepEqual(
    computeTransitDaysRemaining(
      { entryDate: '2026-11-10', shippingType: 'Aéreo' },
      '2026-11-15',
    ),
    { daysRemaining: 10, label: 'Llega en ~10 días' },
  );
  assert.deepEqual(
    computeTransitDaysRemaining(
      { entryDate: '2026-11-01', shippingType: 'Marítimo' },
      '2026-11-15',
    ),
    { daysRemaining: 66, label: 'Llega en ~66 días' },
  );
});

test('WhatsApp rotation alternates strictly between Jesús César and Josué Ojeda with exact message', () => {
  const storage = createMemoryStorage();
  assert.equal(getCurrentWhatsAppTurnIndex(storage), 0);

  const first = buildCatalogWhatsAppHref(getCurrentWhatsAppTurnIndex(storage), {
    model: 'Barcelona Local 25/26',
    version: 'Player',
    size: 'M',
  });
  assert.equal(first.advisor.name, 'Jesús César');
  assert.equal(first.advisor.waNumber, '584124612132');
  assert.ok(first.href.startsWith('https://wa.me/584124612132?text='));
  assert.equal(
    first.message,
    '¡Hola! 👋 Me interesa la franela Barcelona Local 25/26, Versión Player, Talla M que vi en el catálogo de X4SPORT. ¿Está disponible?',
  );

  const nextIdx = advanceWhatsAppTurnIndex(storage);
  assert.equal(nextIdx, 1);
  const second = buildCatalogWhatsAppHref(getCurrentWhatsAppTurnIndex(storage), {
    model: 'Real Madrid Local 25/26',
    version: 'Fans',
    size: 'L',
  });
  assert.equal(second.advisor.name, 'Josué Ojeda');
  assert.equal(second.advisor.waNumber, '584124588754');
  assert.ok(second.href.startsWith('https://wa.me/584124588754?text='));

  const backToZero = advanceWhatsAppTurnIndex(storage);
  assert.equal(backToZero, 0);
  assert.equal(CATALOG_WHATSAPP_ADVISORS.length, 2);
});

test('normalizeCatalogImageUrl converts Google Drive links to direct lh3 format and preserves direct/data URLs', () => {
  assert.equal(
    normalizeCatalogImageUrl('https://drive.google.com/file/d/1AbCDefGhIjkLMNOP/view?usp=sharing'),
    'https://lh3.googleusercontent.com/d/1AbCDefGhIjkLMNOP',
  );
  assert.equal(
    normalizeCatalogImageUrl('https://drive.google.com/open?id=999xyz_123'),
    'https://lh3.googleusercontent.com/d/999xyz_123',
  );
  assert.equal(
    convertGoogleDriveUrlToDirect('https://drive.google.com/file/d/sample_file_id_456/edit'),
    'https://lh3.googleusercontent.com/d/sample_file_id_456',
  );
  assert.equal(
    extractGoogleDriveFileId('https://lh3.googleusercontent.com/d/existing_lh3_id'),
    'existing_lh3_id',
  );
  assert.equal(
    normalizeCatalogImageUrl('https://cdn.example.com/kit.jpg'),
    'https://cdn.example.com/kit.jpg',
  );
  assert.equal(
    normalizeCatalogImageUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='),
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
  );
});

test('shareable catalog route detection and normalizeAppState preserve catalog settings without touching 4-layer matrix', () => {
  assert.equal(isPublicCatalogModeFromLocation({ search: '?catalogo=1' }), true);
  assert.equal(isPublicCatalogModeFromLocation({ hash: '#catalogo' }), true);
  assert.equal(isPublicCatalogModeFromLocation({ pathname: '/catalogo' }), true);
  assert.equal(isPublicCatalogModeFromLocation({ search: '', hash: '', pathname: '/' }), false);
  assert.equal(
    buildShareableCatalogUrl({ protocol: 'https:', origin: 'https://x4sport.app', pathname: '/' }),
    'https://x4sport.app/?catalogo=1',
  );

  const seed = createDemoSeedState();
  seed.catalogEnabled = false;
  seed.catalogPhotos = { 'barcelona local 25/26::Player': 'https://cdn.example.com/barca.jpg' };
  const normalized = normalizeAppState(JSON.parse(JSON.stringify(seed)));
  assert.equal(normalized.catalogEnabled, false);
  assert.equal(
    normalized.catalogPhotos?.['barcelona local 25/26::Player'],
    'https://cdn.example.com/barca.jpg',
  );
  assert.equal(normalized.cashOnHand, seed.cashOnHand);
  assert.equal(normalized.funds.growthReinvestment, seed.funds.growthReinvestment);
});
