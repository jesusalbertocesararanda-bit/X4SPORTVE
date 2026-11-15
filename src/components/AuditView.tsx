import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Search,
  X,
} from 'lucide-react';
import type { AppState, InventoryItem, TeamCategory } from '../types/erp';
import type { ApplyAuditAdjustmentsInput } from '../utils/finance';
import {
  formatUSD,
  getInventoryCascadeGroups,
  getTotalUnits,
  previewFifoConsumption,
  round2,
} from '../utils/finance';

interface AuditViewProps {
  state: AppState;
  onApplyAuditAdjustments: (
    input: ApplyAuditAdjustmentsInput,
  ) => { ok: boolean; error?: string };
}

type AuditMode = 'cascade' | 'sku';

const TEAM_FILTERS: Array<'Todos' | TeamCategory> = [
  'Todos',
  'Barcelona',
  'Real Madrid',
  'Manchester City',
  'PSG',
  'Selecciones',
  'Otro',
];

const REASON_PRESETS = [
  'Conteo físico mensual',
  'Merma',
  'Error de despacho',
];

interface PendingSkuChange {
  item: InventoryItem;
  newStock: number;
  delta: number;
  fifoLossCost: number;
}

export function AuditView({
  state,
  onApplyAuditAdjustments,
}: AuditViewProps) {
  const [auditMode, setAuditMode] = useState<AuditMode>('cascade');
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState<'Todos' | TeamCategory>('Todos');

  // Modo 1 (Cascada): group physical total inputs keyed by group.key
  const [groupCounts, setGroupCounts] = useState<Record<string, string>>({});
  // Per-SKU physical count inputs (shared or specific per mode)
  const [cascadeSkuCounts, setCascadeSkuCounts] = useState<
    Record<string, string>
  >({});
  const [detailedSkuCounts, setDetailedSkuCounts] = useState<
    Record<string, string>
  >({});

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [reasonInput, setReasonInput] = useState('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!showConfirmModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowConfirmModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showConfirmModal]);

  const allGroups = useMemo(
    () => getInventoryCascadeGroups(state.inventory),
    [state.inventory],
  );

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allGroups.filter((g) => {
      if (teamFilter !== 'Todos' && g.team !== teamFilter) return false;
      if (!q) return true;
      return (
        g.model.toLowerCase().includes(q) ||
        g.team.toLowerCase().includes(q) ||
        g.version.toLowerCase().includes(q)
      );
    });
  }, [allGroups, searchQuery, teamFilter]);

  const filteredSkus = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return state.inventory
      .filter((item) => {
        if (teamFilter !== 'Todos' && item.team !== teamFilter) return false;
        if (!q) return true;
        return (
          item.model.toLowerCase().includes(q) ||
          item.team.toLowerCase().includes(q) ||
          item.version.toLowerCase().includes(q) ||
          item.size.toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          a.team.localeCompare(b.team) ||
          a.model.localeCompare(b.model) ||
          a.version.localeCompare(b.version) ||
          a.size.localeCompare(b.size),
      );
  }, [searchQuery, state.inventory, teamFilter]);

  // Evaluate Modo 1 group status & stats
  const cascadeStats = useMemo(() => {
    let squaredCount = 0;
    let mismatchCount = 0;
    let unresolvedMismatchGroups = 0;

    for (const group of allGroups) {
      const raw = groupCounts[group.key];
      if (raw === undefined || raw.trim() === '') continue;
      const parsed = Math.floor(Number(raw));
      if (!Number.isFinite(parsed) || parsed < 0) continue;

      if (parsed === group.expectedStock) {
        squaredCount += 1;
      } else {
        mismatchCount += 1;
        const sizeSum = group.items.reduce((sum, item) => {
          const skuRaw = cascadeSkuCounts[item.id];
          const val =
            skuRaw !== undefined && skuRaw.trim() !== ''
              ? Math.max(0, Math.floor(Number(skuRaw) || 0))
              : item.stock;
          return sum + val;
        }, 0);
        const hasAnySkuDelta = group.items.some((item) => {
          const skuRaw = cascadeSkuCounts[item.id];
          if (skuRaw === undefined || skuRaw.trim() === '') return false;
          const val = Math.floor(Number(skuRaw));
          return Number.isFinite(val) && val >= 0 && val !== item.stock;
        });
        if (!hasAnySkuDelta || sizeSum !== parsed) {
          unresolvedMismatchGroups += 1;
        }
      }
    }

    return { squaredCount, mismatchCount, unresolvedMismatchGroups };
  }, [allGroups, cascadeSkuCounts, groupCounts]);

  // Pending SKU adjustments for active mode
  const pendingChanges: PendingSkuChange[] = useMemo(() => {
    const changes: PendingSkuChange[] = [];

    if (auditMode === 'cascade') {
      for (const group of allGroups) {
        const raw = groupCounts[group.key];
        if (raw === undefined || raw.trim() === '') continue;
        const parsedGroup = Math.floor(Number(raw));
        if (!Number.isFinite(parsedGroup) || parsedGroup < 0) continue;
        if (parsedGroup === group.expectedStock) continue;

        for (const item of group.items) {
          const skuRaw = cascadeSkuCounts[item.id];
          if (skuRaw === undefined || skuRaw.trim() === '') continue;
          const newStock = Math.floor(Number(skuRaw));
          if (!Number.isFinite(newStock) || newStock < 0) continue;
          const delta = newStock - item.stock;
          if (delta === 0) continue;

          const fifoLossCost =
            delta < 0
              ? previewFifoConsumption(item, Math.abs(delta)).totalCost
              : 0;
          changes.push({ item, newStock, delta, fifoLossCost });
        }
      }
    } else {
      for (const item of state.inventory) {
        const skuRaw = detailedSkuCounts[item.id];
        if (skuRaw === undefined || skuRaw.trim() === '') continue;
        const newStock = Math.floor(Number(skuRaw));
        if (!Number.isFinite(newStock) || newStock < 0) continue;
        const delta = newStock - item.stock;
        if (delta === 0) continue;

        const fifoLossCost =
          delta < 0
            ? previewFifoConsumption(item, Math.abs(delta)).totalCost
            : 0;
        changes.push({ item, newStock, delta, fifoLossCost });
      }
    }

    return changes;
  }, [
    allGroups,
    auditMode,
    cascadeSkuCounts,
    detailedSkuCounts,
    groupCounts,
    state.inventory,
  ]);

  const pendingSummary = useMemo(() => {
    let shortageUnits = 0;
    let surplusUnits = 0;
    let totalFifoLoss = 0;
    for (const c of pendingChanges) {
      if (c.delta < 0) {
        shortageUnits += Math.abs(c.delta);
        totalFifoLoss = round2(totalFifoLoss + c.fifoLossCost);
      } else {
        surplusUnits += c.delta;
      }
    }
    return {
      shortageUnits,
      surplusUnits,
      netDelta: surplusUnits - shortageUnits,
      totalFifoLoss,
    };
  }, [pendingChanges]);

  const handleGroupCountChange = (
    groupKey: string,
    expectedStock: number,
    items: InventoryItem[],
    rawValue: string,
  ) => {
    setFeedback(null);
    setGroupCounts((prev) => ({ ...prev, [groupKey]: rawValue }));

    if (rawValue.trim() === '') return;
    const parsed = Math.floor(Number(rawValue));
    if (!Number.isFinite(parsed) || parsed < 0) return;

    if (parsed !== expectedStock) {
      setCascadeSkuCounts((prev) => {
        const next = { ...prev };
        if (items.length === 1) {
          // Single-size group: auto-sync exact count to the SKU
          next[items[0].id] = String(parsed);
        } else {
          // Multi-size group: initialize blank size fields with system stock for effortless editing
          for (const item of items) {
            if (next[item.id] === undefined || next[item.id] === '') {
              next[item.id] = String(item.stock);
            }
          }
        }
        return next;
      });
    }
  };

  const handleOpenApplyConfirm = () => {
    setFeedback(null);
    if (auditMode === 'cascade' && cascadeStats.mismatchCount > 0) {
      const hasUneditedMismatch = pendingChanges.length === 0;
      if (hasUneditedMismatch) {
        setFeedback({
          type: 'error',
          text: 'Hay grupos con descuadre abierto: ajusta las cantidades reales en el desglose por talla (S, M, L, XL) para localizar exactamente dónde está la diferencia antes de aplicar.',
        });
        return;
      }
    }

    if (pendingChanges.length === 0) {
      setFeedback({
        type: 'error',
        text: 'No hay diferencias registradas para aplicar. Ingresa un conteo físico distinto al stock en sistema.',
      });
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmApply = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const res = onApplyAuditAdjustments({
      items: pendingChanges.map((c) => ({
        skuId: c.item.id,
        newStock: c.newStock,
      })),
      reason: reasonInput,
      auditMode,
    });

    if (!res.ok) {
      setFeedback({
        type: 'error',
        text: res.error ?? 'No se pudieron aplicar los ajustes de auditoría.',
      });
      setShowConfirmModal(false);
      return;
    }

    const appliedCount = pendingChanges.length;
    const lossMsg =
      pendingSummary.totalFifoLoss > 0
        ? ` · Merma FIFO registrada: ${formatUSD(pendingSummary.totalFifoLoss)}`
        : '';

    setShowConfirmModal(false);
    setReasonInput('');
    if (auditMode === 'cascade') {
      setGroupCounts({});
      setCascadeSkuCounts({});
    } else {
      setDetailedSkuCounts({});
    }

    setFeedback({
      type: 'success',
      text: `Auditoría aplicada: ${appliedCount} ${
        appliedCount === 1 ? 'SKU actualizado' : 'SKUs actualizados'
      } en inventario y cola FIFO${lossMsg}.`,
    });
  };

  const totalUnits = getTotalUnits(state);
  const adjustmentsHistory = state.inventoryAdjustments ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl text-balance">
            Auditoría de Inventario
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Conteo rápido en cascada por Modelo/Versión o verificación SKU por SKU con descuento FIFO automático en mermas.
          </p>
        </div>

        <button
          type="button"
          data-testid="btn-apply-audit"
          onClick={handleOpenApplyConfirm}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:scale-[0.99] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <ClipboardCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          Aplicar Ajustes de Auditoría
          {pendingChanges.length > 0 ? ` (${pendingChanges.length})` : ''}
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-slate-800 bg-[#0D1526] p-5">
          <p className="text-xs font-medium text-slate-400">
            Inventario esperado en sistema
          </p>
          <p
            data-testid="audit-system-units"
            className="font-mono-num mt-2 text-2xl font-bold text-white"
          >
            {totalUnits} uds
          </p>
          <p className="mt-1.5 text-xs text-slate-400">
            {allGroups.length} grupos modelo/versión · {state.inventory.length} SKUs
          </p>
        </article>

        <article className="rounded-xl border border-slate-800 bg-[#0D1526] p-5">
          <p className="text-xs font-medium text-slate-400">
            Estado del conteo actual
          </p>
          <p className="font-mono-num mt-2 text-2xl font-bold text-emerald-400">
            {auditMode === 'cascade'
              ? `${cascadeStats.squaredCount} cuadrados`
              : `${pendingChanges.length} con diferencia`}
          </p>
          <p className="mt-1.5 text-xs text-slate-400">
            {auditMode === 'cascade'
              ? `${cascadeStats.mismatchCount} ${
                  cascadeStats.mismatchCount === 1
                    ? 'grupo con descuadre'
                    : 'grupos con descuadre'
                }`
              : 'Modo detallado por talla y modelo'}
          </p>
        </article>

        <article className="rounded-xl border border-slate-800 bg-[#0D1526] p-5">
          <p className="text-xs font-medium text-slate-400">
            Impacto pendiente por aplicar
          </p>
          <p
            data-testid="audit-pending-delta"
            className={`font-mono-num mt-2 text-2xl font-bold ${
              pendingSummary.netDelta < 0
                ? 'text-red-400'
                : pendingSummary.netDelta > 0
                  ? 'text-amber-300'
                  : 'text-slate-200'
            }`}
          >
            {pendingSummary.netDelta > 0
              ? `+${pendingSummary.netDelta}`
              : pendingSummary.netDelta}{' '}
            uds
          </p>
          <p className="mt-1.5 text-xs text-slate-400">
            Merma FIFO:{' '}
            <span className="font-mono-num text-red-300">
              {formatUSD(pendingSummary.totalFifoLoss)}
            </span>{' '}
            · Sobrante: +{pendingSummary.surplusUnits} uds
          </p>
        </article>
      </div>

      {/* Mode Switcher + Search & Filter */}
      <section className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 sm:p-5 space-y-4">
        <div
          role="tablist"
          aria-label="Modalidad de auditoría"
          className="flex w-full flex-col gap-1 rounded-lg border border-slate-800 bg-[#080E1C] p-1 sm:inline-flex sm:w-auto sm:flex-row sm:items-center"
        >
          <button
            type="button"
            role="tab"
            aria-selected={auditMode === 'cascade'}
            onClick={() => {
              setAuditMode('cascade');
              setFeedback(null);
            }}
            className={`w-full sm:w-auto min-h-[42px] rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              auditMode === 'cascade'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Conteo Rápido por Grupo (Cascada)
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={auditMode === 'sku'}
            onClick={() => {
              setAuditMode('sku');
              setFeedback(null);
            }}
            className={`w-full sm:w-auto min-h-[42px] rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              auditMode === 'sku'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Conteo Detallado por SKU
          </button>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <label htmlFor="audit-search" className="sr-only">
              Buscar modelo o equipo en auditoría
            </label>
            <input
              id="audit-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar modelo, equipo o versión (ej. Barcelona, Real Madrid, Player)..."
              className="w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] pl-10 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
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
        </div>
      </section>

      {feedback && (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-xl px-4 py-3 text-xs font-medium ${
            feedback.type === 'error'
              ? 'border border-red-500/30 bg-red-500/10 text-red-300'
              : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
          ) : (
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* MODO 1: CONTEO RÁPIDO POR GRUPO / MODELO (AUDITORÍA EN CASCADA) */}
      {auditMode === 'cascade' && (
        <section
          aria-labelledby="cascade-audit-heading"
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2
              id="cascade-audit-heading"
              className="font-display text-lg font-semibold text-white"
            >
              Conteo Rápido por Modelo y Versión
            </h2>
            <span className="font-mono-num text-xs text-slate-400">
              {filteredGroups.length} grupos
            </span>
          </div>

          {filteredGroups.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-8 text-center text-sm text-slate-400">
              No se encontraron modelos con ese filtro.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredGroups.map((group) => {
                const rawGroup = groupCounts[group.key] ?? '';
                const hasGroupInput = rawGroup.trim() !== '';
                const parsedGroup = hasGroupInput
                  ? Math.floor(Number(rawGroup))
                  : null;
                const isValidNumber =
                  parsedGroup !== null &&
                  Number.isFinite(parsedGroup) &&
                  parsedGroup >= 0;

                const isSquared =
                  isValidNumber && parsedGroup === group.expectedStock;
                const isMismatch =
                  isValidNumber && parsedGroup !== group.expectedStock;
                const groupDelta =
                  isValidNumber && parsedGroup !== null
                    ? parsedGroup - group.expectedStock
                    : 0;

                const sizeBreakdownSum = group.items.reduce((sum, item) => {
                  const sRaw = cascadeSkuCounts[item.id];
                  const val =
                    sRaw !== undefined && sRaw.trim() !== ''
                      ? Math.max(0, Math.floor(Number(sRaw) || 0))
                      : item.stock;
                  return sum + val;
                }, 0);

                return (
                  <article
                    key={group.key}
                    data-testid={`cascade-group-${group.key}`}
                    className={`rounded-xl border bg-[#0D1526] p-4 sm:p-5 transition-colors ${
                      isSquared
                        ? 'border-emerald-500/50'
                        : isMismatch
                          ? groupDelta < 0
                            ? 'border-red-500/50'
                            : 'border-amber-500/50'
                          : 'border-slate-800'
                    }`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          <span className="font-medium text-blue-300">
                            {group.team}
                          </span>
                          <span aria-hidden="true" className="text-slate-600">
                            ·
                          </span>
                          <span className="text-slate-300">
                            Versión {group.version}
                          </span>
                          <span aria-hidden="true" className="text-slate-600">
                            ·
                          </span>
                          <span className="text-slate-400">
                            Tallas:{' '}
                            {group.items.map((i) => i.size).join(', ')}
                          </span>
                        </div>

                        <h3 className="text-base font-semibold text-white">
                          {group.model}
                        </h3>

                        <p className="text-xs text-slate-400">
                          Deberían haber:{' '}
                          <strong className="font-mono-num text-sm text-white">
                            {group.expectedStock} uds
                          </strong>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 sm:justify-end shrink-0">
                        <div className="min-w-[140px]">
                          {isSquared ? (
                            <span
                              data-testid={`group-status-${group.key}`}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400"
                            >
                              <CheckCircle2
                                className="h-4 w-4 shrink-0"
                                aria-hidden="true"
                              />
                              Cuadrado ✓
                            </span>
                          ) : isMismatch ? (
                            <span
                              data-testid={`group-status-${group.key}`}
                              className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                                groupDelta < 0
                                  ? 'text-red-400'
                                  : 'text-amber-300'
                              }`}
                            >
                              <AlertTriangle
                                className="h-4 w-4 shrink-0"
                                aria-hidden="true"
                              />
                              {groupDelta < 0
                                ? `Faltante (${groupDelta} uds)`
                                : `Sobrante (+${groupDelta} uds)`}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500">
                              Sin contar
                            </span>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor={`audit-group-${group.key}`}
                            className="block text-[11px] font-medium text-slate-400 sm:text-right"
                          >
                            Conteo Físico Total
                          </label>
                          <input
                            id={`audit-group-${group.key}`}
                            type="number"
                            min="0"
                            step="1"
                            placeholder={String(group.expectedStock)}
                            value={rawGroup}
                            onChange={(e) =>
                              handleGroupCountChange(
                                group.key,
                                group.expectedStock,
                                group.items,
                                e.target.value,
                              )
                            }
                            className="font-mono-num mt-1 min-h-[44px] w-28 rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-right text-sm font-semibold text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Desglose automático por talla al detectar diferencia */}
                    {isMismatch && (
                      <div
                        data-testid={`cascade-breakdown-${group.key}`}
                        className="mt-4 border-t border-slate-800 pt-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-amber-200">
                            Desglose automático por talla — Localiza dónde está el descuadre:
                          </span>
                          <span
                            className={`font-mono-num font-semibold ${
                              sizeBreakdownSum === parsedGroup
                                ? 'text-emerald-400'
                                : 'text-amber-300'
                            }`}
                          >
                            Suma por tallas: {sizeBreakdownSum} / {parsedGroup} uds contadas
                          </span>
                        </div>

                        <div className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-[#080E1C] px-3.5">
                          {group.items.map((item) => {
                            const skuRaw =
                              cascadeSkuCounts[item.id] ?? String(item.stock);
                            const skuVal = Math.max(
                              0,
                              Math.floor(Number(skuRaw) || 0),
                            );
                            const skuDelta =
                              skuRaw.trim() === '' ? 0 : skuVal - item.stock;
                            const lossUsd =
                              skuDelta < 0
                                ? previewFifoConsumption(
                                    item,
                                    Math.abs(skuDelta),
                                  ).totalCost
                                : 0;

                            return (
                              <div
                                key={item.id}
                                className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="font-mono-num font-bold text-white w-14">
                                    Talla {item.size}
                                  </span>
                                  <span className="text-slate-400">
                                    Sistema:{' '}
                                    <strong className="font-mono-num text-slate-200">
                                      {item.stock} uds
                                    </strong>
                                  </span>
                                  {skuDelta !== 0 && (
                                    <span
                                      className={`font-mono-num font-semibold ${
                                        skuDelta < 0
                                          ? 'text-red-400'
                                          : 'text-amber-300'
                                      }`}
                                    >
                                      {skuDelta > 0 ? `+${skuDelta}` : skuDelta}{' '}
                                      {Math.abs(skuDelta) === 1 ? 'ud' : 'uds'}
                                      {lossUsd > 0
                                        ? ` · Merma FIFO ${formatUSD(lossUsd)}`
                                        : ''}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  <label
                                    htmlFor={`cascade-sku-${item.id}`}
                                    className="text-slate-400"
                                  >
                                    Físico:
                                  </label>
                                  <input
                                    id={`cascade-sku-${item.id}`}
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={skuRaw}
                                    onChange={(e) => {
                                      setCascadeSkuCounts((prev) => ({
                                        ...prev,
                                        [item.id]: e.target.value,
                                      }));
                                      setFeedback(null);
                                    }}
                                    className="font-mono-num min-h-[40px] w-24 rounded-lg border border-slate-700 bg-[#070D19] px-2.5 py-1 text-right text-sm font-semibold text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* MODO 2: CONTEO DETALLADO POR TALLA Y MODELO (SKU POR SKU) */}
      {auditMode === 'sku' && (
        <section
          aria-labelledby="sku-audit-heading"
          className="rounded-xl border border-slate-800 bg-[#0D1526] overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
            <h2
              id="sku-audit-heading"
              className="font-display text-lg font-semibold text-white"
            >
              Conteo Detallado por SKU (Modelo · Versión · Talla)
            </h2>
            <span className="font-mono-num text-xs text-slate-400">
              {filteredSkus.length} SKUs
            </span>
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-[#080E1C] text-xs font-medium text-slate-400">
                <tr>
                  <th className="px-5 py-3">Equipo</th>
                  <th className="px-5 py-3">Modelo</th>
                  <th className="px-5 py-3">Versión</th>
                  <th className="px-5 py-3">Talla</th>
                  <th className="px-5 py-3 text-right">Stock Sistema</th>
                  <th className="px-5 py-3 text-right">Conteo Físico</th>
                  <th className="px-5 py-3 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredSkus.map((item) => {
                  const raw = detailedSkuCounts[item.id] ?? '';
                  const hasInput = raw.trim() !== '';
                  const parsed = hasInput ? Math.floor(Number(raw)) : null;
                  const delta =
                    parsed !== null && Number.isFinite(parsed) && parsed >= 0
                      ? parsed - item.stock
                      : 0;

                  return (
                    <tr key={item.id} className="hover:bg-slate-800/30">
                      <td className="px-5 py-3 text-xs font-medium text-blue-300">
                        {item.team}
                      </td>
                      <td className="px-5 py-3 font-medium text-white">
                        {item.model}
                      </td>
                      <td className="px-5 py-3 text-slate-300">
                        {item.version}
                      </td>
                      <td className="px-5 py-3 font-mono-num text-slate-300">
                        {item.size}
                      </td>
                      <td className="px-5 py-3 text-right font-mono-num font-semibold text-slate-200">
                        {item.stock}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <label htmlFor={`audit-sku-${item.id}`} className="sr-only">
                          Conteo físico de {item.model} {item.version} talla {item.size}
                        </label>
                        <input
                          id={`audit-sku-${item.id}`}
                          type="number"
                          min="0"
                          step="1"
                          placeholder={String(item.stock)}
                          value={raw}
                          onChange={(e) => {
                            setDetailedSkuCounts((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }));
                            setFeedback(null);
                          }}
                          className="font-mono-num min-h-[40px] w-24 rounded-lg border border-slate-700 bg-[#070D19] px-2.5 py-1 text-right text-sm font-semibold text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td
                        data-testid={`sku-diff-${item.id}`}
                        className={`px-5 py-3 text-right font-mono-num font-semibold ${
                          !hasInput
                            ? 'text-slate-500'
                            : delta === 0
                              ? 'text-emerald-400'
                              : delta < 0
                                ? 'text-red-400'
                                : 'text-amber-300'
                        }`}
                      >
                        {!hasInput
                          ? '—'
                          : delta === 0
                            ? '0 ✓'
                            : delta > 0
                              ? `+${delta}`
                              : delta}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-800/80 md:hidden">
            {filteredSkus.map((item) => {
              const raw = detailedSkuCounts[item.id] ?? '';
              const hasInput = raw.trim() !== '';
              const parsed = hasInput ? Math.floor(Number(raw)) : null;
              const delta =
                parsed !== null && Number.isFinite(parsed) && parsed >= 0
                  ? parsed - item.stock
                  : 0;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-blue-300">
                      {item.team}
                    </p>
                    <p className="truncate text-sm font-semibold text-white">
                      {item.model}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {item.version} · Talla {item.size} · Sistema:{' '}
                      <span className="font-mono-num text-slate-200">
                        {item.stock} uds
                      </span>
                    </p>
                    {hasInput && (
                      <p
                        className={`font-mono-num mt-0.5 text-xs font-semibold ${
                          delta === 0
                            ? 'text-emerald-400'
                            : delta < 0
                              ? 'text-red-400'
                              : 'text-amber-300'
                        }`}
                      >
                        Diferencia:{' '}
                        {delta === 0
                          ? '0 ✓'
                          : delta > 0
                            ? `+${delta}`
                            : delta}
                      </p>
                    )}
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    aria-label={`Conteo físico de ${item.model} talla ${item.size}`}
                    placeholder={String(item.stock)}
                    value={raw}
                    onChange={(e) => {
                      setDetailedSkuCounts((prev) => ({
                        ...prev,
                        [item.id]: e.target.value,
                      }));
                      setFeedback(null);
                    }}
                    className="font-mono-num min-h-[44px] w-20 rounded-lg border border-slate-700 bg-[#070D19] px-2.5 py-1.5 text-right text-sm font-semibold text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shrink-0"
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* BITÁCORA: HISTORIAL DE AUDITORÍAS Y AJUSTES */}
      <section
        aria-labelledby="audit-history-heading"
        className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6 overflow-hidden"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2
              id="audit-history-heading"
              className="font-display text-lg font-semibold text-white"
            >
              Historial de Auditorías y Ajustes
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Bitácora cronológica de conteos físicos, mermas descontadas por FIFO y ajustes de sobrantes.
            </p>
          </div>
          <span className="font-mono-num text-xs text-slate-400 shrink-0">
            {adjustmentsHistory.length}{' '}
            {adjustmentsHistory.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        {adjustmentsHistory.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">
            Aún no se han aplicado ajustes de auditoría física en bodega.
          </p>
        ) : (
          <>
            <div className="mt-4 hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-800 bg-[#080E1C] text-xs font-medium text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Fecha y Hora</th>
                    <th className="px-4 py-3">Modelo / Versión / Talla</th>
                    <th className="px-4 py-3 text-right">Stock Anterior</th>
                    <th className="px-4 py-3 text-right">Conteo Físico</th>
                    <th className="px-4 py-3 text-right">Diferencia</th>
                    <th className="px-4 py-3">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {adjustmentsHistory.map((adj) => (
                    <tr key={adj.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-mono-num text-xs text-slate-300 whitespace-nowrap">
                        {new Date(adj.createdAt).toLocaleString('es-VE', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">
                          {adj.modelLabel}
                        </p>
                        <p className="text-xs text-slate-400">
                          {adj.version} · Talla {adj.size}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num text-slate-300">
                        {adj.previousStock} uds
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num font-semibold text-white">
                        {adj.newStock} uds
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num">
                        <span
                          className={`font-bold ${
                            adj.delta < 0 ? 'text-red-400' : 'text-amber-300'
                          }`}
                        >
                          {adj.delta > 0 ? `+${adj.delta}` : adj.delta} uds
                        </span>
                        {adj.fifoLossCost !== undefined &&
                          adj.fifoLossCost > 0 && (
                            <span className="block text-[11px] text-red-300">
                              Merma FIFO: {formatUSD(adj.fifoLossCost)}
                            </span>
                          )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">
                        {adj.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 divide-y divide-slate-800/80 md:hidden">
              {adjustmentsHistory.map((adj) => (
                <div key={adj.id} className="py-3 space-y-1 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">
                        {adj.modelLabel} ({adj.version} · {adj.size})
                      </p>
                      <p className="text-slate-400">
                        {new Date(adj.createdAt).toLocaleString('es-VE', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}{' '}
                        · {adj.reason}
                      </p>
                    </div>
                    <span
                      className={`font-mono-num font-bold shrink-0 ${
                        adj.delta < 0 ? 'text-red-400' : 'text-amber-300'
                      }`}
                    >
                      {adj.delta > 0 ? `+${adj.delta}` : adj.delta} uds
                    </span>
                  </div>
                  <p className="font-mono-num text-slate-300">
                    {adj.previousStock} → {adj.newStock} uds
                    {adj.fifoLossCost !== undefined && adj.fifoLossCost > 0
                      ? ` · Merma FIFO ${formatUSD(adj.fifoLossCost)}`
                      : ''}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Modal de Confirmación para Aplicar Ajustes de Auditoría */}
      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-audit-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-700 bg-[#0D1526] p-5 sm:p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2
                  id="confirm-audit-title"
                  className="font-display text-lg font-bold text-white"
                >
                  Confirmar Ajustes de Auditoría
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Las mermas se descontarán automáticamente en orden FIFO (lotes más antiguos primero).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                aria-label="Cerrar confirmación de auditoría"
                className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-700 bg-[#080E1C] text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleConfirmApply} className="mt-4 space-y-4">
              <div className="max-h-56 overflow-y-auto divide-y divide-slate-800 rounded-lg border border-slate-800 bg-[#080E1C] px-3.5">
                {pendingChanges.map((c) => (
                  <div
                    key={c.item.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">
                        {c.item.model} ({c.item.version} · {c.item.size})
                      </p>
                      <p className="font-mono-num text-slate-400">
                        {c.item.stock} → {c.newStock} uds
                        {c.fifoLossCost > 0
                          ? ` · Costo Merma FIFO ${formatUSD(c.fifoLossCost)}`
                          : ''}
                      </p>
                    </div>
                    <span
                      className={`font-mono-num font-bold shrink-0 ${
                        c.delta < 0 ? 'text-red-400' : 'text-amber-300'
                      }`}
                    >
                      {c.delta > 0 ? `+${c.delta}` : c.delta} uds
                    </span>
                  </div>
                ))}
              </div>

              <div>
                <label
                  htmlFor="audit-reason-input"
                  className="block text-xs font-medium text-slate-300"
                >
                  Motivo (opcional)
                </label>
                <input
                  id="audit-reason-input"
                  type="text"
                  placeholder="Ej. Conteo físico mensual"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {REASON_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setReasonInput(preset)}
                      className="min-h-[32px] rounded-md border border-slate-700 bg-[#080E1C] px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2.5 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="min-h-[44px] rounded-lg border border-slate-700 bg-[#080E1C] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                  Confirmar y Aplicar Ajustes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
