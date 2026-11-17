import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  LayoutGrid,
  List,
  Search,
} from 'lucide-react';
import type { AppState, TeamCategory } from '../types/erp';
import {
  ALL_JERSEY_SIZES,
  formatUSD,
  getInventorySizeMatrix,
  getNextFifoUnitCost,
  getTotalInventoryCostValue,
  getTotalUnits,
  normalizeVersionDisplay,
} from '../utils/finance';

interface InventoryViewProps {
  state: AppState;
}

type InventoryDisplayMode = 'matrix' | 'sku';

const DEFAULT_TEAM_ORDER = [
  'Barcelona',
  'Real Madrid',
  'Manchester City',
  'PSG',
  'Selecciones',
  'Otro',
];

export function InventoryView({ state }: InventoryViewProps) {
  const [displayMode, setDisplayMode] = useState<InventoryDisplayMode>('matrix');
  const [query, setQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState<'Todos' | TeamCategory>('Todos');
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  const teamFilters = useMemo(() => {
    const present = new Set(state.inventory.map((i) => i.team));
    const orderedCanonical = DEFAULT_TEAM_ORDER.filter((t) => present.has(t));
    const customTeams = Array.from(present)
      .filter((t) => !DEFAULT_TEAM_ORDER.includes(t))
      .sort();
    return ['Todos', ...orderedCanonical, ...customTeams];
  }, [state.inventory]);

  const matrixRows = useMemo(
    () => getInventorySizeMatrix(state.inventory, 5),
    [state.inventory],
  );

  const filteredMatrixRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return matrixRows.filter((row) => {
      if (teamFilter !== 'Todos' && row.team !== teamFilter) return false;
      if (onlyLowStock && !row.isLowStock) return false;
      if (!q) return true;
      return (
        row.model.toLowerCase().includes(q) ||
        row.team.toLowerCase().includes(q) ||
        row.version.toLowerCase().includes(q)
      );
    });
  }, [matrixRows, onlyLowStock, query, teamFilter]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.inventory.filter((item) => {
      if (teamFilter !== 'Todos' && item.team !== teamFilter) return false;
      if (onlyLowStock && item.stock >= 5) return false;
      if (!q) return true;
      return (
        item.model.toLowerCase().includes(q) ||
        item.team.toLowerCase().includes(q) ||
        normalizeVersionDisplay(item.version).toLowerCase().includes(q) ||
        item.size.toLowerCase().includes(q)
      );
    });
  }, [onlyLowStock, query, state.inventory, teamFilter]);

  const totalUnits = getTotalUnits(state);
  const totalValue = getTotalInventoryCostValue(state);
  const lowStockModelsCount = matrixRows.filter((r) => r.isLowStock).length;
  const filteredUnits =
    displayMode === 'matrix'
      ? filteredMatrixRows.reduce((sum, r) => sum + r.totalStock, 0)
      : filteredItems.reduce((sum, i) => sum + i.stock, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Inventario y Stock Base (Matriz S–XXL)
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Sumatoria en tiempo real por Modelo, Versión y Talla con alertas rojas en stock menor a 5 unidades.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
          <span>
            Total Bodega:{' '}
            <strong
              data-testid="inventory-total-units"
              className="font-mono-num text-white"
            >
              {totalUnits} uds
            </strong>
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span>
            Capital FIFO:{' '}
            <strong className="font-mono-num text-blue-300">
              {formatUSD(totalValue)}
            </strong>
          </span>
          {lowStockModelsCount > 0 && (
            <>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-red-400">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {lowStockModelsCount} con stock &lt; 5
              </span>
            </>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
              placeholder="Buscar por equipo o modelo (ej. Barcelona, Real Madrid, Liverpool)..."
              className="w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] pl-10 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="tablist"
              aria-label="Modo de visualización de inventario"
              className="inline-flex rounded-lg border border-slate-700 bg-[#070D19] p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={displayMode === 'matrix'}
                data-testid="btn-inventory-matrix-view"
                onClick={() => setDisplayMode('matrix')}
                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  displayMode === 'matrix'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                Matriz Tallas
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={displayMode === 'sku'}
                data-testid="btn-inventory-sku-view"
                onClick={() => setDisplayMode('sku')}
                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  displayMode === 'sku'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <List className="h-3.5 w-3.5" aria-hidden="true" />
                Detalle FIFO
              </button>
            </div>

            <button
              type="button"
              data-testid="btn-filter-low-stock"
              onClick={() => setOnlyLowStock((prev) => !prev)}
              aria-pressed={onlyLowStock}
              className={`min-h-[42px] rounded-lg border px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
                onlyLowStock
                  ? 'border-red-500/50 bg-red-500/15 text-red-300'
                  : 'border-slate-700 bg-[#070D19] text-slate-300 hover:bg-slate-800'
              }`}
            >
              {onlyLowStock
                ? 'Mostrando Stock Bajo (< 5)'
                : 'Filtrar Stock Bajo (< 5)'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {teamFilters.map((team) => {
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

      {state.inventory.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-[#0D1526] p-8 text-center">
          <p className="text-sm font-semibold text-white">
            Bodega sin mercancía ingresada
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Registra una orden en Compras y recíbela en bodega o sincroniza un respaldo Excel desde Configuración.
          </p>
        </div>
      ) : (displayMode === 'matrix'
          ? filteredMatrixRows.length === 0
          : filteredItems.length === 0) ? (
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
      ) : displayMode === 'matrix' ? (
        <section className="rounded-xl border border-slate-800 bg-[#0D1526] overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3 text-xs text-slate-400">
            <span>
              Mostrando{' '}
              <strong className="font-mono-num text-slate-200">
                {filteredMatrixRows.length}
              </strong>{' '}
              modelos (sumatoria S–XXL)
            </span>
            <span>
              Unidades filtradas:{' '}
              <strong className="font-mono-num text-white">
                {filteredUnits}
              </strong>
            </span>
          </div>

          {/* Tabla dinámica Desktop: Modelo × Versión × Tallas (S, M, L, XL, XXL) */}
          <div className="hidden md:block overflow-x-auto">
            <table
              data-testid="inventory-matrix-table"
              className="w-full text-left text-sm"
            >
              <thead className="border-b border-slate-800 bg-[#080E1C] text-xs font-medium text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3">Categoría</th>
                  <th scope="col" className="px-4 py-3">Modelo</th>
                  <th scope="col" className="px-4 py-3">Versión</th>
                  {ALL_JERSEY_SIZES.map((sz) => (
                    <th key={sz} scope="col" className="px-3 py-3 text-center">
                      {sz}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-3 text-right">Total</th>
                  <th scope="col" className="px-4 py-3 text-right">PVP ($)</th>
                  <th scope="col" className="px-4 py-3 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredMatrixRows.map((row) => (
                  <tr
                    key={row.key}
                    data-testid={`matrix-row-${row.key}`}
                    className={`transition-colors ${
                      row.isLowStock
                        ? 'bg-red-500/10 hover:bg-red-500/15'
                        : 'hover:bg-slate-800/35'
                    }`}
                  >
                    <td className="px-4 py-3 text-xs font-medium text-blue-300 whitespace-nowrap">
                      {row.team}
                    </td>
                    <td className="px-4 py-3 font-medium text-white">
                      {row.model}
                    </td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                      {row.version}
                    </td>
                    {ALL_JERSEY_SIZES.map((sz) => {
                      const qty = row.sizes[sz];
                      const isTracked = row.trackedSizes[sz];
                      const isSizeLow = isTracked && qty < 5;
                      return (
                        <td
                          key={sz}
                          className={`px-3 py-3 text-center font-mono-num text-sm ${
                            isSizeLow
                              ? 'font-bold text-red-400 bg-red-500/10'
                              : qty > 0
                                ? 'font-semibold text-white'
                                : 'text-slate-600'
                          }`}
                        >
                          {isTracked ? qty : '0'}
                        </td>
                      );
                    })}
                    <td
                      data-testid={`matrix-total-${row.key}`}
                      className={`px-4 py-3 text-right font-mono-num text-base font-bold ${
                        row.isLowStock ? 'text-red-400' : 'text-white'
                      }`}
                    >
                      {row.totalStock}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num text-emerald-300 whitespace-nowrap">
                      {formatUSD(row.salePrice)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {row.isLowStock ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-300">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          Stock Bajo (&lt; 5)
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-emerald-400">
                          Disponible
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tarjetas responsive móvil */}
          <div className="divide-y divide-slate-800/80 md:hidden">
            {filteredMatrixRows.map((row) => (
              <div
                key={row.key}
                className={`p-4 space-y-3 ${row.isLowStock ? 'bg-red-500/10' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-blue-300">
                      {row.team} · {row.version}
                    </p>
                    <p className="truncate text-sm font-semibold text-white">
                      {row.model}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      PVP{' '}
                      <span className="font-mono-num text-emerald-300">
                        {formatUSD(row.salePrice)}
                      </span>{' '}
                      · Costo prom.{' '}
                      <span className="font-mono-num text-slate-300">
                        {formatUSD(row.avgCogs)}
                      </span>
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`font-mono-num block text-base font-bold ${
                        row.isLowStock ? 'text-red-400' : 'text-white'
                      }`}
                    >
                      {row.totalStock} uds
                    </span>
                    {row.isLowStock ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-400">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        Stock Bajo
                      </span>
                    ) : (
                      <span className="text-[11px] text-emerald-400">
                        Disponible
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-1.5 text-center">
                  {ALL_JERSEY_SIZES.map((sz) => {
                    const qty = row.sizes[sz];
                    const isSizeLow = row.trackedSizes[sz] && qty < 5;
                    return (
                      <div
                        key={sz}
                        className={`rounded-lg border px-1.5 py-1.5 ${
                          isSizeLow
                            ? 'border-red-500/40 bg-red-500/15 text-red-300'
                            : 'border-slate-800 bg-[#080E1C] text-slate-300'
                        }`}
                      >
                        <span className="block text-[10px] font-medium text-slate-400">
                          {sz}
                        </span>
                        <span
                          className={`font-mono-num text-xs font-bold ${
                            isSizeLow
                              ? 'text-red-300'
                              : qty > 0
                                ? 'text-white'
                                : 'text-slate-600'
                          }`}
                        >
                          {qty}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
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
                  const low = item.stock < 5;
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
                      className={`transition-colors ${
                        low
                          ? 'bg-red-500/10 hover:bg-red-500/15'
                          : 'hover:bg-slate-800/35'
                      }`}
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
                        {normalizeVersionDisplay(item.version)}
                      </td>
                      <td className="px-5 py-3 font-mono-num text-slate-300">
                        {item.size}
                      </td>
                      <td
                        className={`px-5 py-3 text-right font-mono-num font-bold ${
                          low ? 'text-red-400' : 'text-white'
                        }`}
                      >
                        {item.stock}
                        {low && (
                          <span className="ml-1.5 text-[10px] font-semibold text-red-300">
                            (&lt; 5)
                          </span>
                        )}
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
              const low = item.stock < 5;
              const nextFifoCost = getNextFifoUnitCost(item);
              const activeBatches = (item.fifoBatches ?? []).filter(
                (b) => b.remainingQuantity > 0,
              );
              return (
                <div
                  key={item.id}
                  className={`p-4 flex items-center justify-between gap-3 ${
                    low ? 'bg-red-500/10' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-blue-300">
                      {item.team}
                    </p>
                    <p className="truncate text-sm font-semibold text-white">
                      {item.model}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {normalizeVersionDisplay(item.version)} · Talla {item.size} · PVP{' '}
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
                        low ? 'text-red-400' : 'text-white'
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
