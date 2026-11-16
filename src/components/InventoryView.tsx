import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Search } from 'lucide-react';
import type { AppState, TeamCategory } from '../types/erp';
import type { AdjustInventoryCountInput } from '../utils/finance';
import {
  formatUSD,
  getNextFifoUnitCost,
  getTotalInventoryCostValue,
  getTotalUnits,
} from '../utils/finance';

interface InventoryViewProps {
  state: AppState;
  onAdjustInventoryCount: (
    input: AdjustInventoryCountInput,
  ) => { ok: boolean; error?: string };
}

const TEAM_FILTERS: Array<'Todos' | TeamCategory> = [
  'Todos',
  'Barcelona',
  'Real Madrid',
  'Manchester City',
  'PSG',
  'Selecciones',
  'Otro',
];

export function InventoryView({
  state,
  onAdjustInventoryCount,
}: InventoryViewProps) {
  const [query, setQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState<'Todos' | TeamCategory>('Todos');
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  const [showAdjustPanel, setShowAdjustPanel] = useState(false);
  const [adjustSkuId, setAdjustSkuId] = useState<string>(
    state.inventory[0]?.id ?? '',
  );
  const [physicalCountInput, setPhysicalCountInput] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [adjustFeedback, setAdjustFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const effectiveAdjustSku =
    state.inventory.find((i) => i.id === adjustSkuId) ??
    state.inventory[0] ??
    null;

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.inventory.filter((item) => {
      if (teamFilter !== 'Todos' && item.team !== teamFilter) return false;
      if (onlyLowStock && item.stock > 2) return false;
      if (!q) return true;
      return (
        item.model.toLowerCase().includes(q) ||
        item.team.toLowerCase().includes(q) ||
        item.version.toLowerCase().includes(q) ||
        item.size.toLowerCase().includes(q)
      );
    });
  }, [onlyLowStock, query, state.inventory, teamFilter]);

  const totalUnits = getTotalUnits(state);
  const totalValue = getTotalInventoryCostValue(state);
  const filteredUnits = filteredItems.reduce((sum, i) => sum + i.stock, 0);

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustFeedback(null);
    if (!effectiveAdjustSku) return;

    const parsedNewStock = Math.floor(Number(physicalCountInput));
    if (!Number.isFinite(parsedNewStock) || physicalCountInput.trim() === '') {
      setAdjustFeedback({
        type: 'error',
        text: 'Ingresa la cantidad física contada en bodega.',
      });
      return;
    }

    const res = onAdjustInventoryCount({
      skuId: effectiveAdjustSku.id,
      newStock: parsedNewStock,
      reason: adjustReason,
    });

    if (!res.ok) {
      setAdjustFeedback({
        type: 'error',
        text: res.error ?? 'No se pudo registrar el ajuste físico.',
      });
      return;
    }

    setPhysicalCountInput('');
    setAdjustReason('');
    setAdjustFeedback({
      type: 'success',
      text: `Conteo físico aplicado a ${effectiveAdjustSku.model} (${effectiveAdjustSku.version} · ${effectiveAdjustSku.size}): nuevo stock ${parsedNewStock} uds.`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Catálogo e Inventario FIFO
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Control cronológico por lotes (First-In, First-Out), PVP en USDT y ajustes por conteo físico.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
          <span>
            Total Bodega:{' '}
            <strong className="font-mono-num text-white">{totalUnits} uds</strong>
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span>
            Capital en Costo FIFO:{' '}
            <strong className="font-mono-num text-blue-300">
              {formatUSD(totalValue)}
            </strong>
          </span>
          <button
            type="button"
            onClick={() => {
              setShowAdjustPanel((prev) => !prev);
              setAdjustFeedback(null);
            }}
            aria-expanded={showAdjustPanel}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-600/20 px-3.5 py-2 text-xs font-semibold text-blue-200 transition-colors hover:bg-blue-600/30 hover:text-white whitespace-nowrap shrink-0"
          >
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            {showAdjustPanel ? 'Ocultar Conteo Físico' : 'Ajuste Conteo Físico'}
          </button>
        </div>
      </div>

      {showAdjustPanel && (
        <section
          aria-labelledby="physical-adjust-heading"
          className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6 space-y-5"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2
                id="physical-adjust-heading"
                className="font-display text-lg font-semibold text-white"
              >
                Ajuste por Conteo Físico de Bodega
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Sincroniza el stock y las capas FIFO ante mermas, extravíos o sobrantes físicos.
              </p>
            </div>
            {effectiveAdjustSku && (
              <span className="font-mono-num text-xs text-slate-300">
                Stock sistema:{' '}
                <strong className="text-white">
                  {effectiveAdjustSku.stock} uds
                </strong>
              </span>
            )}
          </div>

          <form
            onSubmit={handleAdjustSubmit}
            className="grid grid-cols-1 gap-4 sm:grid-cols-12 sm:items-end"
          >
            <div className="sm:col-span-5">
              <label
                htmlFor="adjust-sku"
                className="block text-xs font-medium text-slate-300"
              >
                SKU a ajustar
              </label>
              <select
                id="adjust-sku"
                value={effectiveAdjustSku?.id ?? ''}
                onChange={(e) => {
                  setAdjustSkuId(e.target.value);
                  setAdjustFeedback(null);
                }}
                className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {state.inventory.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.model} ({item.version} · {item.size}) — Sistema:{' '}
                    {item.stock} uds
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="adjust-new-stock"
                className="block text-xs font-medium text-slate-300"
              >
                Conteo Físico
              </label>
              <input
                id="adjust-new-stock"
                type="number"
                min="0"
                step="1"
                required
                placeholder={
                  effectiveAdjustSku ? String(effectiveAdjustSku.stock) : '0'
                }
                value={physicalCountInput}
                onChange={(e) => {
                  setPhysicalCountInput(e.target.value);
                  setAdjustFeedback(null);
                }}
                className="font-mono-num mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-3">
              <label
                htmlFor="adjust-reason"
                className="block text-xs font-medium text-slate-300"
              >
                Motivo del ajuste *
              </label>
              <input
                id="adjust-reason"
                type="text"
                required
                placeholder="Ej. Conteo físico semanal"
                value={adjustReason}
                onChange={(e) => {
                  setAdjustReason(e.target.value);
                  setAdjustFeedback(null);
                }}
                className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                Aplicar Ajuste
              </button>
            </div>
          </form>

          {adjustFeedback && (
            <div
              role="status"
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-medium ${
                adjustFeedback.type === 'error'
                  ? 'border border-red-500/30 bg-red-500/10 text-red-300'
                  : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              }`}
            >
              {adjustFeedback.type === 'success' && (
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span>{adjustFeedback.text}</span>
            </div>
          )}

          {(state.inventoryAdjustments ?? []).length > 0 && (
            <div className="border-t border-slate-800 pt-4">
              <h3 className="text-xs font-semibold text-slate-300">
                Últimos Ajustes Físicos
              </h3>
              <ul className="mt-2 divide-y divide-slate-800/70 text-xs">
                {(state.inventoryAdjustments ?? []).slice(0, 5).map((adj) => (
                  <li
                    key={adj.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span className="text-slate-300">
                      <strong className="text-white">{adj.modelLabel}</strong> (
                      {adj.version} · {adj.size}) — {adj.reason}
                    </span>
                    <span className="font-mono-num text-slate-200">
                      {adj.previousStock} → {adj.newStock} uds (
                      <strong
                        className={
                          adj.delta > 0 ? 'text-emerald-400' : 'text-amber-300'
                        }
                      >
                        {adj.delta > 0 ? `+${adj.delta}` : adj.delta}
                      </strong>
                      )
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <label htmlFor="inventory-search" className="sr-only">
              Buscar por equipo o modelo
            </label>
            <input
              id="inventory-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por equipo o modelo (ej. Barcelona, Madrid, Vinotinto)..."
              className="w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] pl-10 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={() => setOnlyLowStock((prev) => !prev)}
            aria-pressed={onlyLowStock}
            className={`min-h-[44px] rounded-lg border px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              onlyLowStock
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                : 'border-slate-700 bg-[#070D19] text-slate-300 hover:bg-slate-800'
            }`}
          >
            {onlyLowStock ? 'Mostrando Stock Bajo (≤ 2)' : 'Filtrar Stock Bajo (≤ 2)'}
          </button>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {TEAM_FILTERS.map((team) => {
            const active = teamFilter === team;
            return (
              <button
                key={team}
                type="button"
                onClick={() => setTeamFilter(team)}
                className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#080E1C] text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {team}
              </button>
            );
          })}
        </div>
      </section>

      {filteredItems.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-8 text-center">
          <p className="text-sm font-medium text-white">
            No se encontraron modelos con ese criterio
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Prueba limpiando la búsqueda o seleccionando otra categoría.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setTeamFilter('Todos');
              setOnlyLowStock(false);
            }}
            className="mt-4 min-h-[40px] rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <section className="rounded-xl border border-slate-800 bg-[#0D1526] overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3 text-xs text-slate-400">
            <span>
              Mostrando{' '}
              <strong className="font-mono-num text-slate-200">
                {filteredItems.length}
              </strong>{' '}
              SKUs
            </span>
            <span>
              Unidades filtradas:{' '}
              <strong className="font-mono-num text-white">
                {filteredUnits}
              </strong>
            </span>
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-[#080E1C] text-xs font-medium text-slate-400">
                <tr>
                  <th scope="col" className="px-5 py-3">Equipo</th>
                  <th scope="col" className="px-5 py-3">Modelo y Capas FIFO</th>
                  <th scope="col" className="px-5 py-3">Versión</th>
                  <th scope="col" className="px-5 py-3">Talla</th>
                  <th scope="col" className="px-5 py-3 text-right">Stock</th>
                  <th scope="col" className="px-5 py-3 text-right">COGS FIFO</th>
                  <th scope="col" className="px-5 py-3 text-right">PVP (USDT)</th>
                  <th scope="col" className="px-5 py-3 text-right">Valor Lotes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredItems.map((item) => {
                  const low = item.stock <= 2;
                  const activeBatches = (item.fifoBatches ?? []).filter(
                    (b) => b.remainingQuantity > 0,
                  );
                  const nextFifoCost = getNextFifoUnitCost(item);
                  const skuTotalValue =
                    activeBatches.length > 0
                      ? activeBatches.reduce(
                          (s, b) => s + b.remainingQuantity * b.unitCost,
                          0,
                        )
                      : item.stock * item.cogs;

                  return (
                    <tr
                      key={item.id}
                      className="transition-colors hover:bg-slate-800/35"
                    >
                      <td className="px-5 py-3 text-xs font-medium text-blue-300">
                        {item.team}
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-white">{item.model}</p>
                        {activeBatches.length > 1 && (
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            Capas FIFO:{' '}
                            {activeBatches
                              .map(
                                (b) =>
                                  `${b.remainingQuantity} uds @ ${formatUSD(b.unitCost)} (${b.entryDate})`,
                              )
                              .join(' → ')}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-300">
                        {item.version}
                      </td>
                      <td className="px-5 py-3 font-mono-num text-slate-300">
                        {item.size}
                      </td>
                      <td
                        className={`px-5 py-3 text-right font-mono-num font-semibold ${
                          item.stock === 0
                            ? 'text-red-400'
                            : low
                              ? 'text-amber-400'
                              : 'text-white'
                        }`}
                      >
                        {item.stock}
                      </td>
                      <td className="px-5 py-3 text-right font-mono-num text-slate-300">
                        {formatUSD(nextFifoCost)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono-num text-emerald-300">
                        {formatUSD(item.salePrice)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono-num font-medium text-slate-200">
                        {formatUSD(skuTotalValue)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-800/80 md:hidden">
            {filteredItems.map((item) => {
              const low = item.stock <= 2;
              const nextFifoCost = getNextFifoUnitCost(item);
              const activeBatches = (item.fifoBatches ?? []).filter(
                (b) => b.remainingQuantity > 0,
              );
              return (
                <div
                  key={item.id}
                  className="p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-blue-300">
                      {item.team}
                    </p>
                    <p className="truncate text-sm font-semibold text-white">
                      {item.model}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {item.version} · Talla {item.size} · PVP{' '}
                      <span className="font-mono-num text-emerald-300">
                        {formatUSD(item.salePrice)}
                      </span>{' '}
                      · FIFO{' '}
                      <span className="font-mono-num text-slate-300">
                        {formatUSD(nextFifoCost)}
                      </span>
                      {activeBatches.length > 1
                        ? ` (${activeBatches.length} lotes)`
                        : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`font-mono-num block text-base font-bold ${
                        item.stock === 0
                          ? 'text-red-400'
                          : low
                            ? 'text-amber-400'
                            : 'text-white'
                      }`}
                    >
                      {item.stock} uds
                    </span>
                    <span className="font-mono-num text-[11px] text-slate-400">
                      {formatUSD(item.stock * nextFifoCost)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
