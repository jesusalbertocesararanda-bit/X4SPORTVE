import { useEffect, useMemo, useRef } from 'react';
import Chart from 'chart.js/auto';
import type { AppState, PartnerName, TeamCategory } from '../types/erp';
import {
  formatUSD,
  getTotalInventoryCostValue,
  getTotalReceivables,
  getTotalUnits,
  round2,
} from '../utils/finance';

interface StatsViewProps {
  state: AppState;
}

const CHART_TEAMS: TeamCategory[] = [
  'Barcelona',
  'Real Madrid',
  'Manchester City',
  'PSG',
  'Selecciones',
  'Otro',
];

const SELLERS: PartnerName[] = ['Jesús', 'Josué', 'Gabriel'];

export function StatsView({ state }: StatsViewProps) {
  const inventoryCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const matrixCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const receivablesCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const totalUnits = getTotalUnits(state);
  const totalInvCost = getTotalInventoryCostValue(state);
  const totalReceivables = getTotalReceivables(state);
  const totalSalesRevenue = round2(
    state.sales.reduce((sum, s) => sum + s.finalPrice, 0),
  );

  const sellerStats = useMemo(() => {
    return SELLERS.map((seller) => {
      const sellerSales = state.sales.filter((s) => s.seller === seller);
      const totalSold = round2(
        sellerSales.reduce((sum, s) => sum + s.finalPrice, 0),
      );
      const unitsSold = sellerSales.reduce((sum, s) => sum + s.quantity, 0);
      const commissionEarned = round2(state.funds.commissionsBySeller[seller]);
      return {
        seller,
        salesCount: sellerSales.length,
        unitsSold,
        totalSold,
        commissionEarned,
      };
    });
  }, [state.funds.commissionsBySeller, state.sales]);

  // Chart 1: Inventory distribution by team (units)
  useEffect(() => {
    const canvas = inventoryCanvasRef.current;
    if (!canvas) return;

    const dynamicTeams = Array.from(
      new Set([
        ...CHART_TEAMS,
        ...state.inventory.map((i) => i.team).filter(Boolean),
      ]),
    );

    const activePairs = dynamicTeams
      .map((label) => ({
        label,
        value: state.inventory
          .filter((item) => item.team === label)
          .reduce((sum, item) => sum + item.stock, 0),
      }))
      .filter((p) => p.value > 0);

    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: activePairs.map((p) => p.label),
        datasets: [
          {
            data: activePairs.map((p) => p.value),
            backgroundColor: [
              '#2563EB',
              '#F8FAFC',
              '#38BDF8',
              '#6366F1',
              '#10B981',
              '#94A3B8',
            ],
            borderColor: '#0D1526',
            borderWidth: 2,
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#CBD5E1',
              padding: 14,
              font: { family: 'Plus Jakarta Sans', size: 12 },
            },
          },
        },
      },
    });

    return () => chart.destroy();
  }, [state.inventory]);

  // Chart 2: 4-Layer Matrix Accumulated Funds + Partner Dividends
  useEffect(() => {
    const canvas = matrixCanvasRef.current;
    if (!canvas) return;

    const dividendsTotal = round2(
      state.funds.dividendsByPartner.Jesús +
        state.funds.dividendsByPartner.Josué +
        state.funds.dividendsByPartner.Gabriel,
    );

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: [
          'Reposición',
          'Comisiones',
          'Operativo',
          'Reinversión',
          'Dividendos',
        ],
        datasets: [
          {
            label: 'Acumulado (USDT)',
            data: [
              state.funds.replacement,
              state.funds.commissions,
              state.funds.operatingAndAds,
              state.funds.growthReinvestment,
              dividendsTotal,
            ],
            backgroundColor: [
              '#3B82F6',
              '#60A5FA',
              '#93C5FD',
              '#10B981',
              '#F59E0B',
            ],
            borderRadius: 6,
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: { color: '#CBD5E1', font: { size: 11 } },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: '#94A3B8',
              callback: (val) => `$${val}`,
            },
            grid: { color: 'rgba(148, 163, 184, 0.1)' },
          },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });

    return () => chart.destroy();
  }, [state.funds]);

  // Chart 3: Receivables breakdown OR Sales by Seller
  useEffect(() => {
    const canvas = receivablesCanvasRef.current;
    if (!canvas) return;

    const salesBySeller = SELLERS.map((seller) =>
      round2(
        state.sales
          .filter((s) => s.seller === seller)
          .reduce((sum, s) => sum + s.finalPrice, 0),
      ),
    );
    const noSellerSales = round2(
      state.sales
        .filter((s) => s.seller === 'Sin Vendedor')
        .reduce((sum, s) => sum + s.finalPrice, 0),
    );

    const hasSales = state.sales.length > 0;

    const labels = hasSales
      ? ['Jesús', 'Josué', 'Gabriel', 'Sin Vendedor']
      : state.receivables.map((r) => r.debtor);

    const values = hasSales
      ? [...salesBySeller, noSellerSales]
      : state.receivables.map((r) => r.amount);

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: hasSales ? 'Ventas (USDT)' : 'Por Cobrar (USDT)',
            data: values,
            backgroundColor: hasSales ? '#2563EB' : '#F59E0B',
            borderRadius: 6,
          },
        ],
      },
      options: {
        animation: false,
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              color: '#94A3B8',
              callback: (val) => `$${val}`,
            },
            grid: { color: 'rgba(148, 163, 184, 0.1)' },
          },
          y: {
            ticks: { color: '#E2E8F0', font: { size: 11 } },
            grid: { display: false },
          },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });

    return () => chart.destroy();
  }, [state.receivables, state.sales]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Estadísticas y Comisiones
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Distribución de inventario por categoría, flujo de la matriz financiera de 4 capas y comisiones acumuladas por vendedor.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4">
          <span className="text-xs text-slate-400">Unidades en Bodega</span>
          <p className="font-mono-num mt-1 text-xl font-bold text-white">
            {totalUnits}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4">
          <span className="text-xs text-slate-400">Valor COGS FIFO</span>
          <p className="font-mono-num mt-1 text-xl font-bold text-white">
            {formatUSD(totalInvCost)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4">
          <span className="text-xs text-slate-400">Ingresos por Ventas</span>
          <p className="font-mono-num mt-1 text-xl font-bold text-blue-300">
            {formatUSD(totalSalesRevenue)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4">
          <span className="text-xs text-slate-400">Cartera por Cobrar</span>
          <p className="font-mono-num mt-1 text-xl font-bold text-amber-400">
            {formatUSD(totalReceivables)}
          </p>
        </div>
      </div>

      <section
        aria-labelledby="seller-commissions-heading"
        className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              id="seller-commissions-heading"
              className="font-display text-lg font-semibold text-white"
            >
              Rendimiento y Comisiones por Vendedor (4%)
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Total vendido por cada vendedor y monto acumulado correspondiente a la Capa 2.
            </p>
          </div>
          <span className="font-mono-num text-xs text-slate-300">
            Total Comisiones: <strong className="text-emerald-400">{formatUSD(state.funds.commissions)}</strong>
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {sellerStats.map((row) => (
            <article
              key={row.seller}
              data-testid={`seller-card-${row.seller}`}
              className="rounded-lg border border-slate-800 bg-[#080E1C] p-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-semibold text-white">
                  {row.seller}
                </h3>
                <span className="font-mono-num text-xs text-slate-400">
                  {row.salesCount} {row.salesCount === 1 ? 'venta' : 'ventas'} · {row.unitsSold} uds
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between border-t border-slate-800/80 pt-3">
                <div>
                  <span className="block text-[11px] text-slate-400">Total Vendido</span>
                  <span className="font-mono-num text-lg font-bold text-white">
                    {formatUSD(row.totalSold)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block text-[11px] text-slate-400">Comisión 4%</span>
                  <span className="font-mono-num text-lg font-bold text-emerald-400">
                    {formatUSD(row.commissionEarned)}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold text-white">
            Distribución de Inventario por Equipo (Unidades)
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Participación actual de modelos en bodega.
          </p>
          <div className="relative mt-4 h-72 w-full">
            <canvas
              ref={inventoryCanvasRef}
              data-testid="chart-inventory"
              aria-label="Gráfico de distribución de inventario por equipo"
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold text-white">
            Acumulado de la Matriz de 4 Capas (USDT)
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Distribución contable acumulada de las ventas registradas.
          </p>
          <div className="relative mt-4 h-72 w-full">
            <canvas
              ref={matrixCanvasRef}
              data-testid="chart-matrix"
              aria-label="Gráfico de acumulado de la matriz de 4 capas"
            />
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6">
        <h2 className="font-display text-base font-semibold text-white">
          {state.sales.length > 0
            ? 'Rendimiento Comercial por Vendedor (USDT)'
            : 'Distribución Actual de Cuentas por Cobrar (USDT)'}
        </h2>
        <p className="mt-0.5 text-xs text-slate-400">
          {state.sales.length > 0
            ? 'Volumen total vendido por cada responsable asignado.'
            : 'Al registrar ventas se mostrará el rendimiento por vendedor; actualmente refleja la cartera pendiente.'}
        </p>
        <div className="relative mt-4 h-56 w-full">
          <canvas
            ref={receivablesCanvasRef}
            data-testid="chart-performance"
            aria-label="Gráfico de rendimiento comercial y cuentas por cobrar"
          />
        </div>
      </section>
    </div>
  );
}
