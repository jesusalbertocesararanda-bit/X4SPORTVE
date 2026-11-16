import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Globe, RefreshCw } from 'lucide-react';
import type { RateSyncInfo } from '../App';
import type { AppState, TabId } from '../types/erp';
import {
  formatUSD,
  formatUSDT,
  formatVES,
  getLowStockItems,
  getTotalInventoryCostValue,
  getTotalReceivables,
  getTotalUnits,
  round2,
} from '../utils/finance';

interface DashboardViewProps {
  state: AppState;
  rateSync: RateSyncInfo;
  onSyncRatesFromApi: () => Promise<{ ok: boolean; error?: string }>;
  onUpdateRates: (bcv: number, usdt: number) => { ok: boolean; error?: string };
  onNavigate: (tab: TabId) => void;
}

export function DashboardView({
  state,
  rateSync,
  onSyncRatesFromApi,
  onUpdateRates,
  onNavigate,
}: DashboardViewProps) {
  const [bcvInput, setBcvInput] = useState(state.exchangeRates.bcv.toFixed(2));
  const [usdtInput, setUsdtInput] = useState(state.exchangeRates.usdt.toFixed(2));
  const [rateFeedback, setRateFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [vesCalcAmount, setVesCalcAmount] = useState('25');

  useEffect(() => {
    setBcvInput(state.exchangeRates.bcv.toFixed(2));
    setUsdtInput(state.exchangeRates.usdt.toFixed(2));
  }, [state.exchangeRates.bcv, state.exchangeRates.usdt]);

  const totalReceivables = getTotalReceivables(state);
  const totalUnits = getTotalUnits(state);
  const inventoryValue = getTotalInventoryCostValue(state);
  const lowStockItems = getLowStockItems(state, 2);

  const spreadPct =
    state.exchangeRates.bcv > 0
      ? round2(
          ((state.exchangeRates.usdt - state.exchangeRates.bcv) /
            state.exchangeRates.bcv) *
            100,
        )
      : 0;

  const parsedCalcUsd = Math.max(0, Number(vesCalcAmount) || 0);

  const handleRatesSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = onUpdateRates(Number(bcvInput), Number(usdtInput));
    if (!res.ok) {
      setRateFeedback({
        type: 'error',
        text: res.error ?? 'Error al actualizar tasas.',
      });
      return;
    }
    setRateFeedback({
      type: 'success',
      text: 'Tasas del día guardadas manualmente.',
    });
  };

  const handleSyncApiClick = async () => {
    setRateFeedback(null);
    const res = await onSyncRatesFromApi();
    if (res.ok) {
      setRateFeedback({
        type: 'success',
        text: 'Tasas actualizadas automáticamente en tiempo real.',
      });
    } else {
      setRateFeedback({
        type: 'error',
        text: res.error ?? 'No se pudo consultar la API de tasas.',
      });
    }
  };

  const rateSourceLabel =
    state.exchangeRates.source === 'excel'
      ? 'Importada de Excel'
      : state.exchangeRates.source === 'api'
        ? 'API DolarAPI VE'
        : state.exchangeRates.source === 'manual'
          ? 'Ajuste manual'
          : 'Referencia inicial';

  return (
    <div className="space-y-8">
      <section aria-labelledby="dashboard-heading">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1
              id="dashboard-heading"
              className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl text-balance"
            >
              Panel Operativo y Liquidez
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Resumen en tiempo real de caja física, cuentas por cobrar y bodega X4SPORT.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
            <div>
              <span>Ganancia neta histórica: </span>
              <span
                data-testid="kpi-historical-profit"
                className="font-mono-num font-semibold text-emerald-400"
              >
                {formatUSDT(state.historicalNetProfit ?? 317.37)}
              </span>
            </div>
            <div>
              <span>Patrimonio líquido + bodega: </span>
              <span className="font-mono-num font-semibold text-slate-200">
                {formatUSDT(state.cashOnHand + totalReceivables + inventoryValue)}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6">
            <p className="text-xs font-medium text-slate-400">
              Efectivo físico en caja (USDT)
            </p>
            <p
              data-testid="kpi-cash"
              className="font-mono-num mt-2 text-3xl font-bold tracking-tight text-white"
            >
              {formatUSDT(state.cashOnHand)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
              <span>Disponible inmediato</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num text-emerald-400">
                {formatVES(state.cashOnHand * state.exchangeRates.usdt)} USDT
              </span>
            </div>
          </article>

          <article className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6">
            <p className="text-xs font-medium text-slate-400">
              Cuentas por cobrar (USDT)
            </p>
            <p
              data-testid="kpi-receivables"
              className="font-mono-num mt-2 text-3xl font-bold tracking-tight text-white"
            >
              {formatUSDT(totalReceivables)}
            </p>
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-400">
              <span>
                {state.receivables.length}{' '}
                {state.receivables.length === 1
                  ? 'deudor pendiente'
                  : 'deudores pendientes'}
              </span>
              <button
                type="button"
                onClick={() => onNavigate('finanzas')}
                className="inline-flex items-center gap-1 font-medium text-blue-400 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
              >
                Cobrar
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </article>

          <article className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6">
            <p className="text-xs font-medium text-slate-400">
              Inventario total en bodega
            </p>
            <p
              data-testid="kpi-inventory"
              className="font-mono-num mt-2 text-3xl font-bold tracking-tight text-white"
            >
              {totalUnits} <span className="text-lg font-medium text-slate-300">unidades</span>
            </p>
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-400">
              <span>
                Valor COGS:{' '}
                <span className="font-mono-num text-slate-200">
                  {formatUSDT(inventoryValue)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onNavigate('inventario')}
                className="inline-flex items-center gap-1 font-medium text-blue-400 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
              >
                Ver catálogo
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </article>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section
          aria-labelledby="rates-heading"
          className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6 lg:col-span-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="rates-heading"
                className="font-display text-lg font-semibold text-white"
              >
                Monitoreo de Tasas del Día
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Sincronización automática BCV / USDT con ajuste manual editable.
              </p>
            </div>
            <span className="font-mono-num text-xs font-medium text-blue-300 whitespace-nowrap shrink-0">
              Brecha {spreadPct >= 0 ? `+${spreadPct}%` : `${spreadPct}%`}
            </span>
          </div>

          <div
            data-testid="rate-sync-meta"
            className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400"
          >
            <span>
              {rateSync.status === 'loading'
                ? 'Sincronizando tasas en tiempo real...'
                : `Fuente: ${rateSourceLabel}`}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num">
              {new Date(state.exchangeRates.updatedAt).toLocaleString('es-VE', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </span>
          </div>

          <form onSubmit={handleRatesSubmit} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="rate-bcv"
                  className="block text-xs font-medium text-slate-300"
                >
                  Tasa BCV (Bs/USD)
                </label>
                <input
                  id="rate-bcv"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={bcvInput}
                  onChange={(e) => {
                    setBcvInput(e.target.value);
                    setRateFeedback(null);
                  }}
                  className="font-mono-num mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="rate-usdt"
                  className="block text-xs font-medium text-slate-300"
                >
                  Tasa USDT / Paralelo (Bs/USDT)
                </label>
                <input
                  id="rate-usdt"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={usdtInput}
                  onChange={(e) => {
                    setUsdtInput(e.target.value);
                    setRateFeedback(null);
                  }}
                  className="font-mono-num mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {rateFeedback && (
              <p
                role="status"
                className={`text-xs font-medium ${
                  rateFeedback.type === 'error'
                    ? 'text-amber-300'
                    : 'text-emerald-400'
                }`}
              >
                {rateFeedback.text}
              </p>
            )}

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleSyncApiClick}
                disabled={rateSync.status === 'loading'}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-[#080E1C] px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-60 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
                {rateSync.status === 'loading' ? 'Sincronizando...' : 'Sincronizar API'}
              </button>

              <button
                type="submit"
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
                Guardar Ajuste
              </button>
            </div>
          </form>

          <div className="mt-6 border-t border-slate-800 pt-5">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="quick-usd-ves"
                className="text-xs font-medium text-slate-300"
              >
                Calculadora rápida de cobro (USDT)
              </label>
              <input
                id="quick-usd-ves"
                type="number"
                step="0.50"
                min="0"
                value={vesCalcAmount}
                onChange={(e) => setVesCalcAmount(e.target.value)}
                className="font-mono-num w-28 min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-right text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-[#080E1C] px-3 py-2.5">
                <span className="block text-slate-400">Equivalente BCV</span>
                <span className="font-mono-num mt-0.5 block text-sm font-semibold text-white">
                  {formatVES(parsedCalcUsd * state.exchangeRates.bcv)}
                </span>
              </div>
              <div className="rounded-lg bg-[#080E1C] px-3 py-2.5">
                <span className="block text-slate-400">Equivalente USDT</span>
                <span className="font-mono-num mt-0.5 block text-sm font-semibold text-blue-300">
                  {formatVES(parsedCalcUsd * state.exchangeRates.usdt)}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="alerts-heading"
          className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6 lg:col-span-7"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2
                id="alerts-heading"
                className="font-display text-lg font-semibold text-white"
              >
                Alertas Automáticas de Stock Bajo
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                SKUs con inventario igual o menor a 2 unidades que requieren reposición.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('compras')}
              className="min-h-[40px] self-start rounded-lg border border-slate-700 bg-slate-800/70 px-3.5 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Registrar Importación
            </button>
          </div>

          {lowStockItems.length === 0 ? (
            <div className="mt-6 rounded-lg border border-slate-800/80 bg-[#080E1C] p-6 text-center">
              <p className="text-sm font-medium text-emerald-400">
                Bodega saludable
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Todos los modelos tienen más de 2 unidades disponibles.
              </p>
            </div>
          ) : (
            <div className="mt-5 divide-y divide-slate-800/80">
              {lowStockItems.map((item) => {
                const isOut = item.stock === 0;
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <AlertTriangle
                          className={`h-4 w-4 shrink-0 ${
                            isOut ? 'text-red-400' : 'text-amber-400'
                          }`}
                          aria-hidden="true"
                        />
                        <p className="truncate text-sm font-medium text-white">
                          {item.model}
                        </p>
                      </div>
                      <p className="mt-0.5 pl-6 text-xs text-slate-400">
                        {item.team} · Versión {item.version} · Talla {item.size} · COGS{' '}
                        <span className="font-mono-num text-slate-300">
                          {formatUSD(item.cogs)}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-4 pl-6 sm:pl-0">
                      <span
                        className={`font-mono-num text-xs font-semibold ${
                          isOut ? 'text-red-400' : 'text-amber-400'
                        }`}
                      >
                        {isOut
                          ? 'AGOTADO (0 uds)'
                          : `STOCK BAJO (${item.stock} ${
                              item.stock === 1 ? 'ud' : 'uds'
                            })`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
