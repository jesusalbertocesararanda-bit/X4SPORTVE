import test from 'node:test';
import assert from 'node:assert/strict';
import { buildErpStateFromSheets } from './excelImport';
import { getTotalInventoryCostValue, getTotalReceivables, getTotalUnits, round2 } from './finance';

test('buildErpStateFromSheets auto-maps Spanish headers, preserves exact model names, and runs FIFO replay across Compras + Ventas + Finanzas', () => {
  const sheets = {
    Compras: [
      ['REPORTE OFICIAL DE COMPRAS X4SPORT'],
      [],
      [
        'Fecha',
        'Modelo',
        'Versión',
        'Talla',
        'Cantidad',
        'Costo Unitario ($)',
        'Precio de Venta ($)',
        'Tasa BCV',
      ],
      ['2026-10-15', 'Barcelona Local 25/26', 'Player', 'M', 4, 6.0, 30, 46.5],
      ['2026-11-01', 'Barcelona Local 25/26', 'Player', 'M', 6, 7.5, 30, 48.2],
      ['2026-11-02', 'Selección Venezuela Vinotinto', 'Fan', 'L', 5, 5.5, 25, 48.2],
    ],
    Ventas: [
      ['Fecha', 'Modelo', 'Talla', 'Cantidad', 'Comprador', 'Vendedor', 'Total ($)', 'Estado'],
      // Sell 5 units -> consumes 4 @ $6.00 + 1 @ $7.50 = $31.50 FIFO COGS!
      ['2026-11-10', 'Barcelona Local 25/26', 'M', 5, 'Carlos Mendoza', 'Jesús', 150, 'Cobrado'],
      // Sell 2 units of Vinotinto -> 2 @ $5.50 = $11.00 FIFO COGS
      ['2026-11-12', 'Selección Venezuela Vinotinto', 'L', 2, 'Ana Torres', 'Josué', 50, 'Cobrado'],
    ],
    'Finanzas / Resumen': [
      ['Indicador Contable', 'Monto'],
      ['Efectivo físico en caja', 120.19],
      ['Cuentas por cobrar', 263.5],
      ['Tasa BCV', 48.2],
      ['Tasa USDT', 55.4],
      [],
      ['Aportante', 'Concepto', 'Monto ($)', 'Método', 'Fecha'],
      ['Jesús', 'Aporte liquidez noviembre', 100, 'Binance USDT', '2026-11-05'],
      [],
      ['Concepto Gasto Operativo', 'Monto ($)', 'Método', 'Fecha'],
      ['Bolsas y etiquetas', 12.5, 'Efectivo ($)', '2026-11-08'],
    ],
  };

  const result = buildErpStateFromSheets(sheets);
  assert.equal(result.ok, true);
  assert.ok(result.state);
  assert.ok(result.preview);

  const state = result.state;
  const preview = result.preview;

  // Exact original model names & versions preserved without alteration
  const fcbSku = state.inventory.find(
    (i) => i.model === 'Barcelona Local 25/26' && i.version === 'Player' && i.size === 'M',
  );
  assert.ok(fcbSku);
  assert.equal(fcbSku.stock, 5); // 4 + 6 - 5 = 5 remaining
  assert.equal(fcbSku.cogs, 7.5); // Oldest $6.00 batch fully consumed; active FIFO batch is $7.50

  const vzlaSku = state.inventory.find(
    (i) => i.model === 'Selección Venezuela Vinotinto' && i.version === 'Fan' && i.size === 'L',
  );
  assert.ok(vzlaSku);
  assert.equal(vzlaSku.stock, 3); // 5 - 2 = 3

  assert.equal(getTotalUnits(state), 8);
  assert.equal(preview.ventasFifoCogsTotal, 42.5); // $31.50 + $11.00
  assert.equal(state.funds.replacement, 42.5);
  assert.equal(state.funds.commissions, round2(150 * 0.04 + 50 * 0.04)); // $6 + $2 = $8
  assert.equal(state.funds.commissionsBySeller.Jesús, 6.0);
  assert.equal(state.funds.commissionsBySeller.Josué, 2.0);

  // Net profit: ($150 - $31.50 - $6.00 = $112.50) + ($50 - $11.00 - $2.00 = $37.00) = $149.50
  assert.equal(preview.ventasNetProfitTotal, 149.5);

  // Finanzas / Resumen values
  assert.equal(state.cashOnHand, 120.19);
  assert.equal(getTotalReceivables(state), 263.5);
  assert.equal(state.capitalInjections.length, 1);
  assert.equal(state.capitalInjections[0].amount, 100);
  assert.equal(state.operatingExpenses.length, 1);
  assert.equal(state.operatingExpenses[0].amount, 12.5);
  assert.equal(state.exchangeRates.bcv, 48.2);
  assert.equal(state.exchangeRates.usdt, 55.4);
  assert.equal(state.exchangeRates.source, 'excel');
});

test('buildErpStateFromSheets initializes fixed itemized USDT balances when Finanzas omits explicit totals', () => {
  const result = buildErpStateFromSheets({
    Compras: [
      ['Modelo', 'Version', 'Talla', 'Cantidad', 'Costo', 'Precio Venta'],
      ['PSG Local 25/26', 'Player', 'M', 3, 6.55, 30],
    ],
    Ventas: [
      ['Modelo', 'Talla', 'Cantidad', 'Comprador', 'Vendedor', 'Fecha'],
      ['PSG Local 25/26', 'M', 1, 'Luis', 'Gabriel', 46000],
    ],
  });

  assert.equal(result.ok, true);
  assert.ok(result.state);
  assert.equal(result.state.cashOnHand, 135.19);
  assert.equal(getTotalReceivables(result.state), 263.5);
  assert.equal(result.state.receivables.length, 7);
  assert.equal(result.state.capitalInjections[0].amount, 1912.35);
  assert.equal(result.state.operatingExpenses[0].amount, 624.0);
  assert.equal(result.state.historicalNetProfit, 317.37);
  assert.equal(getTotalUnits(result.state), 2);
  // Excel serial date 46000 parsed cleanly to YYYY-MM-DD
  assert.match(result.state.sales[0].createdAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('buildErpStateFromSheets reads Costo Unitario (USDT) and real per-batch Tasa USDT without arbitrary defaults and reconciles 87+166-77=176 FIFO stock', () => {
  // 87 * 6.00 (Lote Agosto) + 166 * 6.4455421687 (Lote Noviembre):
  // 77 sold from Lote Agosto @ 6.00 -> remaining: 10 @ 6.00 (60.00) + 166 @ 6.4455421687 (~1069.96) + ajuste exacto para $1,134.46 USDT
  // Let's use clean prices summing exactly to $1,134.46 USDT:
  // Remaining 10 * $6.45 = $64.50 + 166 * $6.4455421687 -> or 10 * $6.45 + 166 * $6.4455...
  // Even simpler: 10 * 6.45 ($64.50) + 100 * 6.45 ($645.00) + 66 * 6.4388 ($424.96) = 1134.46!
  const result = buildErpStateFromSheets(
    {
      Compras: [
        [
          'Fecha',
          'Modelo',
          'Versión',
          'Talla',
          'Cantidad',
          'Costo Unitario (USDT)',
          'Precio de Venta (USDT)',
          'Tasa USDT',
          'Referencia',
        ],
        ['2026-08-10', 'Barcelona Local 25/26', 'Player', 'M', 77, 6.0, 30, 58.9, 'Lote Agosto 87'],
        ['2026-08-10', 'Barcelona Local 25/26', 'Player', 'L', 10, 6.45, 30, 58.9, 'Lote Agosto 87'],
        ['2026-11-05', 'Real Madrid Local 25/26', 'Player', 'M', 100, 6.45, 30, 63.8, 'Lote Noviembre 166'],
        ['2026-11-05', 'Real Madrid Local 25/26', 'Fan', 'L', 66, 6.4388, 25, 63.8, 'Lote Noviembre 166'],
      ],
      Ventas: [
        ['Fecha', 'Modelo', 'Talla', 'Cantidad', 'Comprador', 'Vendedor', 'Total (USDT)'],
        ['2026-09-12', 'Barcelona Local 25/26', 'M', 77, 'Clientes Históricos', 'Jesús', 2310],
      ],
      'Finanzas - Resumen': [
        ['Concepto', 'Valor'],
        ['Efectivo físico en caja', 120.19],
        ['Cuentas por cobrar', 263.5],
        ['Capital inyectado total', 1912.35],
        ['Gastos operativos totales', 624.0],
        ['Ganancia neta histórica', 317.37],
      ],
    },
    { currentBcv: 46.5, currentUsdt: 54.2 },
  );

  assert.equal(result.ok, true);
  assert.ok(result.state);
  assert.ok(result.preview);

  const state = result.state;
  const preview = result.preview;

  // Verify columns mapped accurately (Costo Unitario (USDT) did NOT collide with Tasa USDT)
  assert.equal(preview.mappedColumns.compras.unitCost, 'Costo Unitario (USDT)');
  assert.equal(preview.mappedColumns.compras.usdtRate, 'Tasa USDT');

  // Verify 253 bought - 77 sold = 176 exact remaining units valued at $1,134.46 USDT
  assert.equal(preview.comprasUnitsTotal, 253);
  assert.equal(preview.ventasUnitsSold, 77);
  assert.equal(getTotalUnits(state), 176);
  assert.equal(round2(getTotalInventoryCostValue(state)), 1134.46);

  // Verify historical purchases & sales did NOT deduct cashOnHand
  assert.equal(state.cashOnHand, 120.19);
  assert.equal(getTotalReceivables(state), 263.5);
  assert.equal(state.receivables.length, 7);
  assert.equal(state.capitalInjections[0].amount, 1912.35);
  assert.equal(state.operatingExpenses[0].amount, 624.0);
  assert.equal(state.historicalNetProfit, 317.37);

  // Verify Tasa USDT came directly from Excel (63.80), NOT arbitrary 52 or 54.2
  assert.equal(state.exchangeRates.usdt, 63.8);
  assert.equal(state.exchangeRates.source, 'excel');

  // Verify each batch kept its own Tasa USDT
  const fcbSkuL = state.inventory.find(
    (i) => i.model === 'Barcelona Local 25/26' && i.size === 'L',
  );
  const rmaSkuM = state.inventory.find(
    (i) => i.model === 'Real Madrid Local 25/26' && i.size === 'M',
  );
  assert.equal(fcbSkuL?.fifoBatches[0].usdtRate, 58.9);
  assert.equal(rmaSkuM?.fifoBatches[0].usdtRate, 63.8);
});
