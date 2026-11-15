import test from 'node:test';
import assert from 'node:assert/strict';
import { buildErpStateFromSheets } from './excelImport';
import { getTotalReceivables, getTotalUnits, round2 } from './finance';

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
});

test('buildErpStateFromSheets initializes $120.19 cash and $263.50 receivables when Finanzas / Resumen omits explicit totals', () => {
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
  assert.equal(result.state.cashOnHand, 120.19);
  assert.equal(getTotalReceivables(result.state), 263.5);
  assert.equal(getTotalUnits(result.state), 2);
  // Excel serial date 46000 parsed cleanly to YYYY-MM-DD
  assert.match(result.state.sales[0].createdAt, /^\d{4}-\d{2}-\d{2}T/);
});
