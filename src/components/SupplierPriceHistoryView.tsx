import { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Truck,
  Building2,
} from 'lucide-react';
import type { AppState } from '../types/erp';
import { formatUSD } from '../utils/finance';

interface SupplierPriceHistoryViewProps {
  state: AppState;
}

interface PriceHistoryEntry {
  model: string;
  version: string;
  size: string;
  batchName: string;
  entryDate: string;
  unitCost: number;
  usdtRate?: number;
  supplier: string;
}

export function SupplierPriceHistoryView({ state }: SupplierPriceHistoryViewProps) {
  // Aggregate purchase history by model from purchaseBatches and inventory FIFO batches
  const priceHistoryList = useMemo(() => {
    const map = new Map<string, PriceHistoryEntry[]>();
    const purchaseBatches = state.purchaseBatches || [];

    for (const pb of purchaseBatches) {
      for (const it of pb.items) {
        const key = `${it.model} (${it.version})`;
        const list = map.get(key) || [];
        list.push({
          model: it.model,
          version: it.version,
          size: it.size,
          batchName: pb.referenceName,
          entryDate: pb.entryDate,
          unitCost: it.landedUnitCost,
          usdtRate: pb.usdtRate,
          supplier: pb.referenceName.toLowerCase().includes('alibaba') ? 'Alibaba (1688)' : 'Orinoco International (Flete)',
        });
        map.set(key, list);
      }
    }

    // Also include active inventory items with their fifo batches
    for (const item of state.inventory || []) {
      const key = `${item.model} (${item.version})`;
      const list = map.get(key) || [];
      for (const b of item.fifoBatches || []) {
        if (!list.some((existing) => existing.batchName === b.batchName)) {
          list.push({
            model: item.model,
            version: item.version,
            size: item.size,
            batchName: b.batchName,
            entryDate: b.entryDate,
            unitCost: b.unitCost,
            supplier: b.batchName.toLowerCase().includes('alibaba') ? 'Alibaba (1688)' : 'Orinoco International (Flete)',
          });
        }
      }
      map.set(key, list);
    }

    return map;
  }, [state.purchaseBatches, state.inventory]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-[#0D1526] p-5 shadow-xl">
        <h1 className="font-display text-xl font-bold text-white sm:text-2xl">
          Historial de Precios por Proveedor y Análisis de Márgenes
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Evolución del costo de importación (compras 1688/Alibaba y fletes Orinoco International) para evaluar márgenes antes de reordenar.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-[#080E1C] p-5 space-y-3 shadow-lg">
          <div className="flex items-center gap-2.5 text-blue-400">
            <Building2 className="h-5 w-5" aria-hidden="true" />
            <h2 className="text-sm font-bold text-white">Proveedores de Origen (1688 / Alibaba)</h2>
          </div>
          <p className="text-xs text-slate-400">
            Control de costos de adquisición de indumentaria deportiva en fábrica por lote y fluctuación cambiaria.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#080E1C] p-5 space-y-3 shadow-lg">
          <div className="flex items-center gap-2.5 text-emerald-400">
            <Truck className="h-5 w-5" aria-hidden="true" />
            <h2 className="text-sm font-bold text-white">Logística y Fletes (Orinoco International)</h2>
          </div>
          <p className="text-xs text-slate-400">
            Asignación de costos de envío aéreo y marítimo prorrateados por unidad para calcular el costo landed (COGS).
          </p>
        </div>
      </div>

      {/* Historial detallado por modelo */}
      <div className="space-y-4">
        {Array.from(priceHistoryList.entries()).map(([modelKey, entries]) => {
          // Sort entries by date ascending
          const sorted = [...entries].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
          const firstCost = sorted[0]?.unitCost || 0;
          const lastCost = sorted[sorted.length - 1]?.unitCost || 0;
          const diff = lastCost - firstCost;
          const percent = firstCost > 0 ? (diff / firstCost) * 100 : 0;

          return (
            <div key={modelKey} className="rounded-2xl border border-slate-800 bg-[#0D1526] p-5 space-y-4 shadow-xl">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-white">{modelKey}</h3>
                  <p className="text-xs text-slate-400">{sorted.length} registros históricos de lotes de compra</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-300">Costo inicial: <strong className="font-mono text-white">{formatUSD(firstCost)}</strong></span>
                  <span className="text-xs text-slate-300">Costo actual: <strong className="font-mono text-emerald-400">{formatUSD(lastCost)}</strong></span>
                  <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    diff > 0 ? 'bg-red-500/10 text-red-400 border border-red-500/30' : diff < 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {diff > 0 ? <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> : diff < 0 ? <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" /> : <Minus className="h-3.5 w-3.5" aria-hidden="true" />}
                    <span>{percent.toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sorted.map((entry, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-800 bg-[#080E1C] p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-blue-400">{entry.batchName}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{entry.entryDate}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                      <span className="text-xs text-slate-300">Costo Unitario:</span>
                      <span className="font-mono font-bold text-white">{formatUSD(entry.unitCost)} USDT</span>
                    </div>
                    {entry.usdtRate && (
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Tasa USDT:</span>
                        <span className="font-mono">{entry.usdtRate.toFixed(2)} Bs</span>
                      </div>
                    )}
                    <div className="text-[10px] text-slate-500 italic">Proveedor: {entry.supplier}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
