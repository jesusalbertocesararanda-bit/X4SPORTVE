import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSeedState } from '../data/initialState';
import {
  buildCustomerDirectory,
  evaluateCustomerStatus,
  searchCustomerDirectory,
} from './customers';
import { registerMultiItemSale, upsertCustomerProfile } from './finance';
import {
  getUnseenAlertCount,
  markAllAlertsSeenIds,
  pruneSeenAlertIds,
  toggleAlertSeenId,
} from './notifications';

test('customer directory aggregates sales, ignores walk-in customers, and distinguishes new vs frequent', () => {
  let state = createDemoSeedState();

  // Register a walk-in sale (Cliente Mostrador) - must NOT appear as frequent customer
  const walkInRes = registerMultiItemSale(state, {
    items: [{ skuId: 'sku-fcb-1', quantity: 1, unitPrice: 30 }],
    customerName: 'Cliente Mostrador',
    seller: 'Jesús',
    paymentStatus: 'Cobrado',
  });
  assert.equal(walkInRes.ok, true);
  state = walkInRes.state;

  // Register 2 sales for María Rodríguez (one with accent, one without accent & matching phone)
  const sale1 = registerMultiItemSale(state, {
    items: [{ skuId: 'sku-fcb-1', quantity: 1, unitPrice: 30 }],
    customerName: 'María Rodríguez',
    customerPhone: '0414-5551234',
    customerCity: 'Guacara',
    customerSocial: '@maria_fut',
    customerIdDoc: 'V-24111222',
    seller: 'Jesús',
    paymentStatus: 'Cobrado',
  });
  assert.equal(sale1.ok, true);
  state = sale1.state;

  const sale2 = registerMultiItemSale(state, {
    items: [{ skuId: 'sku-rma-1', quantity: 2, unitPrice: 28 }],
    customerName: 'Maria Rodriguez',
    customerPhone: '04145551234',
    seller: 'Josué',
    paymentStatus: 'Cobrado',
  });
  assert.equal(sale2.ok, true);
  state = sale2.state;

  // Save a brand-new customer profile directly without any purchase yet
  const upsertRes = upsertCustomerProfile(state, {
    name: 'Carlos Mendoza',
    phone: '0412-9998877',
    city: 'Valencia',
    social: '@cmendoza',
    idDoc: 'V-20999888',
  });
  assert.equal(upsertRes.ok, true);
  state = upsertRes.state;

  const directory = buildCustomerDirectory(state.sales, state.customers);
  assert.equal(directory.length, 2);

  // Search by partial phone digits finds María
  const byPhone = searchCustomerDirectory(directory, '5551234');
  assert.equal(byPhone.length, 1);
  assert.equal(byPhone[0].purchaseCount, 2);
  assert.equal(byPhone[0].totalSpentUsd, 86);
  assert.equal(byPhone[0].social, '@maria_fut');
  assert.equal(byPhone[0].idDoc, 'V-24111222');

  // Search by social handle finds Carlos
  const bySocial = searchCustomerDirectory(directory, '@cmendoza');
  assert.equal(bySocial.length, 1);
  assert.equal(bySocial[0].name, 'Carlos Mendoza');
  assert.equal(bySocial[0].purchaseCount, 0);

  // Status evaluation: empty / walk-in -> anonymous
  assert.equal(evaluateCustomerStatus(directory, '').status, 'anonymous');
  assert.equal(
    evaluateCustomerStatus(directory, 'Cliente Mostrador').status,
    'anonymous',
  );

  // Status evaluation: saved profile with 0 sales -> new
  const statusSavedNew = evaluateCustomerStatus(
    directory,
    'Carlos Mendoza',
    '0412-9998877',
  );
  assert.equal(statusSavedNew.status, 'new');
  assert.equal(statusSavedNew.purchaseCount, 0);

  // Status evaluation: completely unseen customer -> new
  const statusBrandNew = evaluateCustomerStatus(directory, 'Lucía Fernández');
  assert.equal(statusBrandNew.status, 'new');
  assert.equal(statusBrandNew.matchedCustomer, null);

  // Status evaluation: frequent customer matched by name or phone
  const statusFreqByName = evaluateCustomerStatus(directory, 'maría rodríguez');
  assert.equal(statusFreqByName.status, 'frequent');
  assert.equal(statusFreqByName.purchaseCount, 2);
  assert.equal(statusFreqByName.totalSpentUsd, 86);

  const statusFreqByPhone = evaluateCustomerStatus(
    directory,
    '',
    '0414-555-1234',
  );
  assert.equal(statusFreqByPhone.status, 'frequent');
  assert.equal(statusFreqByPhone.purchaseCount, 2);
});

test('notification alert seen/strikethrough helpers track unseen count accurately', () => {
  const alerts = [
    {
      id: 'alert-stock-1',
      kind: 'low_stock' as const,
      severity: 'critical' as const,
      title: 'Stock bajo A',
      description: 'Solo 2 uds',
      targetTab: 'inventario' as const,
    },
    {
      id: 'alert-stock-2',
      kind: 'low_stock' as const,
      severity: 'critical' as const,
      title: 'Stock bajo B',
      description: 'Solo 1 ud',
      targetTab: 'inventario' as const,
    },
    {
      id: 'alert-transit-1',
      kind: 'transit_delay' as const,
      severity: 'critical' as const,
      title: 'Envío retrasado',
      description: '10 días',
      targetTab: 'compras' as const,
    },
  ];

  assert.equal(getUnseenAlertCount(alerts, []), 3);

  const afterOne = toggleAlertSeenId([], 'alert-stock-1');
  assert.deepEqual(afterOne, ['alert-stock-1']);
  assert.equal(getUnseenAlertCount(alerts, afterOne), 2);

  // Toggling again unmarks it
  const afterToggleBack = toggleAlertSeenId(afterOne, 'alert-stock-1');
  assert.deepEqual(afterToggleBack, []);
  assert.equal(getUnseenAlertCount(alerts, afterToggleBack), 3);

  // Mark all seen
  const allSeen = markAllAlertsSeenIds(['alert-stock-1'], alerts);
  assert.equal(getUnseenAlertCount(alerts, allSeen), 0);

  // Prune removes stale alert IDs that are no longer active
  const pruned = pruneSeenAlertIds([...allSeen, 'alert-resolved-old'], alerts);
  assert.equal(pruned.includes('alert-resolved-old'), false);
  assert.equal(pruned.length, 3);
});
