import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  PackageCheck,
  Plus,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AppState,
  JerseySize,
  JerseyVersion,
  PurchaseBatchRecord,
  PurchaseFundingSource,
  ShippingType,
  TeamCategory,
} from '../types/erp';
import type {
  ReceiveImportBatchInput,
  RegisterImportBatchInput,
} from '../utils/finance';
import {
  formatUSD,
  getTransitCapitalSummary,
  round2,
  round4,
} from '../utils/finance';

interface PurchasesViewProps {
  state: AppState;
  onRegisterImportBatch: (
    input: RegisterImportBatchInput,
  ) => { ok: boolean; error?: string };
  onReceiveImportBatch: (
    input: ReceiveImportBatchInput,
  ) => { ok: boolean; error?: string };
}

interface DraftBatchLine {
  lineId: string;
  team: TeamCategory;
  model: string;
  version: JerseyVersion;
  size: JerseySize;
  quantity: number;
  factoryUnitCost: number;
}

type PurchasesSubView = 'all' | 'create' | 'transit' | 'history';

const TEAMS: TeamCategory[] = [
  'Barcelona',
  'Real Madrid',
  'Manchester City',
  'PSG',
  'Selecciones',
  'Otro',
];
const VERSIONS: JerseyVersion[] = ['Player', 'Fan', 'Retro'];
const SIZES: JerseySize[] = ['S', 'M', 'L', 'XL'];
const SHIPPING_TYPES: ShippingType[] = ['Aéreo', 'Marítimo'];

export function PurchasesView({
  state,
  onRegisterImportBatch,
  onReceiveImportBatch,
}: PurchasesViewProps) {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [subView, setSubView] = useState<PurchasesSubView>('all');

  // Etapa 1: Batch header fields
  const [entryDate, setEntryDate] = useState(todayStr);
  const [referenceName, setReferenceName] = useState('Aéreo Noviembre');
  const [shippingType, setShippingType] = useState<ShippingType>('Aéreo');
  const [totalFreightCost, setTotalFreightCost] = useState('15.00');
  const [fundingSource, setFundingSource] =
    useState<PurchaseFundingSource>('cashOnHand');

  // Etapa 1: Batch item builder fields
  const [team, setTeam] = useState<TeamCategory>('Barcelona');
  const [model, setModel] = useState('Barcelona Local 25/26');
  const [version, setVersion] = useState<JerseyVersion>('Player');
  const [size, setSize] = useState<JerseySize>('M');
  const [quantity, setQuantity] = useState('5');
  const [factoryUnitCost, setFactoryUnitCost] = useState('5.50');

  const [draftItems, setDraftItems] = useState<DraftBatchLine[]>([]);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Etapa 2: Modal state for receiving an EN TRÁNSITO batch
  const [receivingBatch, setReceivingBatch] =
    useState<PurchaseBatchRecord | null>(null);
  const [receiveDate, setReceiveDate] = useState(todayStr);
  const [actualFreightInput, setActualFreightInput] = useState('');
  const [receivedQtys, setReceivedQtys] = useState<Record<number, string>>({});
  const [receiveError, setReceiveError] = useState<string | null>(null);

  useEffect(() => {
    if (!receivingBatch) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReceivingBatch(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [receivingBatch]);

  const uniqueModelNames = useMemo(
    () => Array.from(new Set(state.inventory.map((i) => i.model))).sort(),
    [state.inventory],
  );

  const parsedFreight = Math.max(0, round2(Number(totalFreightCost) || 0));

  const batchSummary = useMemo(() => {
    const totalUnits = draftItems.reduce((sum, l) => sum + l.quantity, 0);
    const totalFactory = round2(
      draftItems.reduce((sum, l) => sum + l.quantity * l.factoryUnitCost, 0),
    );
    const freightPerUnit = totalUnits > 0 ? parsedFreight / totalUnits : 0;
    const totalLanded = round2(totalFactory + parsedFreight);
    return {
      totalUnits,
      totalFactory,
      freightPerUnit: round2(freightPerUnit),
      freightPerUnitExact: freightPerUnit,
      totalLanded,
    };
  }, [draftItems, parsedFreight]);

  const {
    transitBatches,
    receivedBatches,
    transitCount,
    transitUnits,
    transitCapital,
  } = useMemo(() => getTransitCapitalSummary(state), [state]);

  const availableFundingBalance =
    fundingSource === 'growthReinvestment'
      ? Math.min(state.cashOnHand, state.funds.growthReinvestment)
      : state.cashOnHand;

  const handleAddLine = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const cleanModel = model.trim();
    if (!cleanModel) {
      setFeedback({
        type: 'error',
        text: 'Ingresa el nombre del modelo para agregar a la orden.',
      });
      return;
    }

    const qty = Math.floor(Number(quantity) || 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      setFeedback({
        type: 'error',
        text: 'La cantidad comprada debe ser mayor a 0.',
      });
      return;
    }

    const fCost = round2(Number(factoryUnitCost) || 0);
    if (!Number.isFinite(fCost) || fCost <= 0) {
      setFeedback({
        type: 'error',
        text: 'El precio unitario de fábrica debe ser mayor a $0.00.',
      });
      return;
    }

    setDraftItems((prev) => [
      ...prev,
      {
        lineId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        team,
        model: cleanModel,
        version,
        size,
        quantity: qty,
        factoryUnitCost: fCost,
      },
    ]);
    setQuantity('5');
  };

  const handleRemoveLine = (lineId: string) => {
    setDraftItems((prev) => prev.filter((l) => l.lineId !== lineId));
    setFeedback(null);
  };

  const handleSaveBatch = () => {
    setFeedback(null);

    if (draftItems.length === 0) {
      setFeedback({
        type: 'error',
        text: 'Agrega al menos un producto a la orden antes de confirmar.',
      });
      return;
    }

    const res = onRegisterImportBatch({
      entryDate,
      referenceName,
      shippingType,
      totalFreightCost: parsedFreight,
      fundingSource,
      items: draftItems.map((l) => ({
        team: l.team,
        model: l.model,
        version: l.version,
        size: l.size,
        quantity: l.quantity,
        factoryUnitCost: l.factoryUnitCost,
      })),
    });

    if (!res.ok) {
      setFeedback({
        type: 'error',
        text: res.error ?? 'No se pudo registrar la orden de importación.',
      });
      return;
    }

    const fundLabel =
      fundingSource === 'growthReinvestment'
        ? 'Fondo de Reinversión'
        : 'Caja General';

    setFeedback({
      type: 'success',
      text: `Orden "${referenceName.trim()}" (${batchSummary.totalUnits} uds) guardada EN TRÁNSITO. Descontados ${formatUSD(
        batchSummary.totalLanded,
      )} de ${fundLabel}; el inventario se sumará al recibir en bodega.`,
    });
    setDraftItems([]);
  };

  const openReceiveModal = (batch: PurchaseBatchRecord) => {
    const qtyMap: Record<number, string> = {};
    batch.items.forEach((item, idx) => {
      qtyMap[idx] = String(item.orderedQuantity ?? item.quantity);
    });
    setReceivingBatch(batch);
    setReceiveDate(new Date().toISOString().slice(0, 10));
    setActualFreightInput(
      (batch.estimatedFreightCost ?? batch.totalFreightCost).toFixed(2),
    );
    setReceivedQtys(qtyMap);
    setReceiveError(null);
    setFeedback(null);
  };

  const modalAuditPreview = useMemo(() => {
    if (!receivingBatch) return null;
    const parsedActualFreight = Math.max(
      0,
      round2(Number(actualFreightInput) || 0),
    );
    const totalReceivedUnits = receivingBatch.items.reduce((sum, _, idx) => {
      const q = Math.max(0, Math.floor(Number(receivedQtys[idx]) || 0));
      return sum + q;
    }, 0);
    const freightPerUnitExact =
      totalReceivedUnits > 0 ? parsedActualFreight / totalReceivedUnits : 0;
    const estimatedFreight =
      receivingBatch.estimatedFreightCost ?? receivingBatch.totalFreightCost;
    const freightDiff = round2(parsedActualFreight - estimatedFreight);
    return {
      parsedActualFreight,
      totalReceivedUnits,
      freightPerUnitExact,
      freightPerUnitDisplay: round2(freightPerUnitExact),
      estimatedFreight,
      freightDiff,
    };
  }, [actualFreightInput, receivedQtys, receivingBatch]);

  const handleConfirmReceive = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingBatch) return;
    setReceiveError(null);

    const parsedActualFreight = round2(Number(actualFreightInput));
    if (!Number.isFinite(parsedActualFreight) || parsedActualFreight < 0) {
      setReceiveError('El costo real del flete debe ser mayor o igual a $0.00.');
      return;
    }

    const receivedItems = receivingBatch.items.map((_, idx) => ({
      itemIndex: idx,
      receivedQuantity: Math.max(
        0,
        Math.floor(Number(receivedQtys[idx]) || 0),
      ),
    }));

    const res = onReceiveImportBatch({
      batchId: receivingBatch.id,
      receivedDate: receiveDate,
      actualFreightCost: parsedActualFreight,
      receivedItems,
    });

    if (!res.ok) {
      setReceiveError(
        res.error ?? 'No se pudo validar el ingreso del lote a bodega.',
      );
      return;
    }

    const arrivedCount = receivedItems.reduce(
      (sum, item) => sum + item.receivedQuantity,
      0,
    );
    const diff = modalAuditPreview?.freightDiff ?? 0;
    const diffMsg =
      diff === 0
        ? 'sin diferencia de flete'
        : diff > 0
          ? `ajuste adicional de +${formatUSD(diff)} descontado`
          : `reembolso de ${formatUSD(Math.abs(diff))} devuelto`;

    setFeedback({
      type: 'success',
      text: `Lote "${receivingBatch.referenceName}" recibido en bodega (${arrivedCount} uds ingresadas a cola FIFO · ${diffMsg}).`,
    });
    setReceivingBatch(null);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl text-balance">
            Compras, Importaciones y Mercancía en Tránsito
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Flujo en 2 etapas: primero registras la orden pagada EN TRÁNSITO y luego auditas cantidades y flete real al ingresar a bodega FIFO.
          </p>
        </div>
      </div>

      {/* KPI Strip: Capital en Tránsito y Estado de Importaciones */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-slate-800 bg-[#0D1526] p-5">
          <p className="text-xs font-medium text-slate-400">
            Capital invertido en tránsito
          </p>
          <p
            data-testid="transit-capital"
            className="font-mono-num mt-2 text-2xl font-bold text-amber-300"
          >
            {formatUSD(transitCapital)}
          </p>
          <p className="mt-1.5 text-xs text-slate-400">
            {transitCount}{' '}
            {transitCount === 1 ? 'orden en camino' : 'órdenes en camino'}
          </p>
        </article>

        <article className="rounded-xl border border-slate-800 bg-[#0D1526] p-5">
          <p className="text-xs font-medium text-slate-400">
            Unidades en camino (pendientes FIFO)
          </p>
          <p
            data-testid="transit-units"
            className="font-mono-num mt-2 text-2xl font-bold text-white"
          >
            {transitUnits} uds
          </p>
          <p className="mt-1.5 text-xs text-slate-400">
            No disponibles para venta hasta su recepción
          </p>
        </article>

        <article className="rounded-xl border border-slate-800 bg-[#0D1526] p-5">
          <p className="text-xs font-medium text-slate-400">
            Disponibilidad para compras
          </p>
          <p className="font-mono-num mt-2 text-2xl font-bold text-emerald-400">
            {formatUSD(state.cashOnHand)}
          </p>
          <p className="mt-1.5 text-xs text-slate-400">
            Fondo Reinversión:{' '}
            <span className="font-mono-num text-slate-200">
              {formatUSD(state.funds.growthReinvestment)}
            </span>{' '}
            · {receivedBatches.length} lotes en bodega
          </p>
        </article>
      </div>

      {/* Segmented Sub-Navigation */}
      <div
        role="tablist"
        aria-label="Secciones de compras"
        className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-slate-800 bg-[#0D1526] p-1.5"
      >
        {(
          [
            { id: 'all', label: 'Vista Completa' },
            { id: 'create', label: 'Etapa 1: Crear Orden' },
            {
              id: 'transit',
              label: `Pedidos en Tránsito (En Camino) (${transitCount})`,
            },
            {
              id: 'history',
              label: `Historial Recibido (${receivedBatches.length})`,
            },
          ] as Array<{ id: PurchasesSubView; label: string }>
        ).map((tab) => {
          const active = subView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSubView(tab.id)}
              className={`min-h-[40px] rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {feedback && (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-xl px-4 py-3 text-xs font-medium ${
            feedback.type === 'error'
              ? 'border border-red-500/30 bg-red-500/10 text-red-300'
              : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          }`}
        >
          {feedback.type === 'success' && (
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* ETAPA 1: CREAR ORDEN DE COMPRA (MERCANCÍA EN TRÁNSITO) */}
      {(subView === 'all' || subView === 'create') && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            <section
              aria-labelledby="batch-header-heading"
              className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h2
                  id="batch-header-heading"
                  className="font-display text-lg font-semibold text-white"
                >
                  1. Datos de la Orden de Compra (En Tránsito)
                </h2>
                <span className="text-xs text-slate-400">
                  Caja disponible:{' '}
                  <strong className="font-mono-num text-emerald-400">
                    {formatUSD(state.cashOnHand)}
                  </strong>
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <label
                    htmlFor="batch-date"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Fecha de orden
                  </label>
                  <input
                    id="batch-date"
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="font-mono-num mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="batch-ref"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Referencia del envío
                  </label>
                  <input
                    id="batch-ref"
                    type="text"
                    required
                    placeholder="Ej. Aéreo Noviembre"
                    value={referenceName}
                    onChange={(e) => {
                      setReferenceName(e.target.value);
                      setFeedback(null);
                    }}
                    className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="batch-shipping"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Tipo de envío
                  </label>
                  <select
                    id="batch-shipping"
                    value={shippingType}
                    onChange={(e) =>
                      setShippingType(e.target.value as ShippingType)
                    }
                    className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {SHIPPING_TYPES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="batch-freight"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Flete Estimado ($)
                  </label>
                  <input
                    id="batch-freight"
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalFreightCost}
                    onChange={(e) => {
                      setTotalFreightCost(e.target.value);
                      setFeedback(null);
                    }}
                    className="font-mono-num mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="batch-funding-source"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Descontar de
                  </label>
                  <select
                    id="batch-funding-source"
                    value={fundingSource}
                    onChange={(e) => {
                      setFundingSource(
                        e.target.value as PurchaseFundingSource,
                      );
                      setFeedback(null);
                    }}
                    className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="cashOnHand">Caja General</option>
                    <option value="growthReinvestment">
                      Fondo Reinversión ({formatUSD(state.funds.growthReinvestment)})
                    </option>
                  </select>
                </div>
              </div>
            </section>

            <section
              aria-labelledby="batch-items-builder-heading"
              className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6"
            >
              <h2
                id="batch-items-builder-heading"
                className="font-display text-lg font-semibold text-white"
              >
                2. Constructor de Ítems de la Orden
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Agrega cada modelo con su precio puro de fábrica; al confirmar la llegada podrás ajustar flete y cantidades reales recibidas.
              </p>

              <form onSubmit={handleAddLine} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="purchase-team"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Equipo / Categoría
                    </label>
                    <select
                      id="purchase-team"
                      value={team}
                      onChange={(e) => setTeam(e.target.value as TeamCategory)}
                      className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {TEAMS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="purchase-model"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Nombre del modelo
                    </label>
                    <input
                      id="purchase-model"
                      type="text"
                      list="existing-models-list"
                      required
                      value={model}
                      onChange={(e) => {
                        setModel(e.target.value);
                        setFeedback(null);
                      }}
                      placeholder="Ej. Barcelona Local 25/26"
                      className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <datalist id="existing-models-list">
                      {uniqueModelNames.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <label
                      htmlFor="purchase-version"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Versión
                    </label>
                    <select
                      id="purchase-version"
                      value={version}
                      onChange={(e) =>
                        setVersion(e.target.value as JerseyVersion)
                      }
                      className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {VERSIONS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="purchase-size"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Talla
                    </label>
                    <select
                      id="purchase-size"
                      value={size}
                      onChange={(e) => setSize(e.target.value as JerseySize)}
                      className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {SIZES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="purchase-qty"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Cantidad
                    </label>
                    <input
                      id="purchase-qty"
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={quantity}
                      onChange={(e) => {
                        setQuantity(e.target.value);
                        setFeedback(null);
                      }}
                      className="font-mono-num mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="purchase-factory-cost"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Precio Fábrica ($/ud)
                    </label>
                    <input
                      id="purchase-factory-cost"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={factoryUnitCost}
                      onChange={(e) => {
                        setFactoryUnitCost(e.target.value);
                        setFeedback(null);
                      }}
                      className="font-mono-num mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-blue-500/40 bg-blue-600/20 px-4 py-2 text-sm font-semibold text-blue-200 transition-colors hover:bg-blue-600/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Agregar Ítem al Lote
                  </button>
                </div>
              </form>

              {draftItems.length > 0 && (
                <div className="mt-6 border-t border-slate-800 pt-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-white">
                      Prendas incluidas en la Orden
                    </h3>
                    <span className="font-mono-num text-xs text-slate-400">
                      {batchSummary.totalUnits} prendas · Flete est. prorrateado:{' '}
                      {formatUSD(batchSummary.freightPerUnit)}/ud
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead className="border-b border-slate-800 text-xs text-slate-400">
                        <tr>
                          <th className="pb-2">Modelo</th>
                          <th className="pb-2 text-right">Cant.</th>
                          <th className="pb-2 text-right">Fábrica</th>
                          <th className="pb-2 text-right">Est. Puesto</th>
                          <th className="pb-2 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {draftItems.map((line) => {
                          const landed = round2(
                            round4(
                              line.factoryUnitCost +
                                batchSummary.freightPerUnitExact,
                            ),
                          );
                          return (
                            <tr key={line.lineId}>
                              <td className="py-2.5 pr-2">
                                <span className="font-medium text-white">
                                  {line.model}
                                </span>
                                <span className="block text-xs text-slate-400">
                                  {line.version} · Talla {line.size}
                                </span>
                              </td>
                              <td className="py-2.5 text-right font-mono-num font-semibold text-white">
                                {line.quantity}
                              </td>
                              <td className="py-2.5 text-right font-mono-num text-slate-300">
                                {formatUSD(line.factoryUnitCost)}
                              </td>
                              <td className="py-2.5 text-right font-mono-num font-semibold text-blue-300">
                                {formatUSD(landed)}
                              </td>
                              <td className="py-2.5 pl-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(line.lineId)}
                                  aria-label={`Eliminar ${line.model} del lote`}
                                  className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-500/20"
                                >
                                  <Trash2
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                  Eliminar
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </div>

          <section
            aria-labelledby="batch-impact-heading"
            className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6 lg:col-span-4 h-fit"
          >
            <h2
              id="batch-impact-heading"
              className="font-display text-lg font-semibold text-white"
            >
              3. Resumen y Desembolso (Etapa 1)
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Se descontará el monto de{' '}
              {fundingSource === 'growthReinvestment'
                ? 'Fondo de Reinversión'
                : 'Caja General'}{' '}
              y la orden quedará EN TRÁNSITO sin sumar inventario todavía.
            </p>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="text-slate-300">Total prendas ordenadas</span>
                <span className="font-mono-num font-semibold text-white">
                  {batchSummary.totalUnits} uds
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="text-slate-300">Costo fábrica total</span>
                <span className="font-mono-num font-semibold text-white">
                  {formatUSD(batchSummary.totalFactory)}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="text-slate-300">
                  Flete estimado ({shippingType})
                </span>
                <span className="font-mono-num font-semibold text-white">
                  {formatUSD(parsedFreight)}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="text-slate-300">
                  Flete prorrateado est. / ud
                </span>
                <span className="font-mono-num font-semibold text-blue-300">
                  {batchSummary.totalUnits > 0
                    ? `${formatUSD(batchSummary.freightPerUnit)}/ud`
                    : '—'}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="text-slate-300">Desembolso inmediato</span>
                <span
                  data-testid="batch-total-landed"
                  className={`font-mono-num text-base font-bold ${
                    batchSummary.totalLanded > availableFundingBalance
                      ? 'text-red-400'
                      : 'text-white'
                  }`}
                >
                  {formatUSD(batchSummary.totalLanded)}
                </span>
              </div>

              <div className="flex items-center justify-between pb-1">
                <span className="text-slate-300">Saldo proyectado</span>
                <span
                  className={`font-mono-num font-semibold ${
                    availableFundingBalance - batchSummary.totalLanded < 0
                      ? 'text-red-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {formatUSD(availableFundingBalance - batchSummary.totalLanded)}
                </span>
              </div>

              {batchSummary.totalLanded > availableFundingBalance &&
                draftItems.length > 0 && (
                  <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    El total supera el saldo disponible ({formatUSD(availableFundingBalance)}). Cobra cuentas por cobrar o cambia el origen de fondos.
                  </p>
                )}

              <button
                type="button"
                onClick={handleSaveBatch}
                disabled={draftItems.length === 0}
                className="mt-2 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                Registrar Orden en Tránsito
              </button>
            </div>
          </section>
        </div>
      )}

      {/* SECCIÓN: PEDIDOS EN TRÁNSITO (EN CAMINO) */}
      {(subView === 'all' || subView === 'transit') && (
        <section
          aria-labelledby="transit-orders-heading"
          className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2
                id="transit-orders-heading"
                className="font-display text-lg font-semibold text-white"
              >
                Pedidos en Tránsito (En Camino)
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Órdenes pagadas pendientes de llegada a Venezuela. Valida el flete real y las piezas recibidas para ingresarlas al inventario FIFO.
              </p>
            </div>
            <div className="text-xs text-slate-300 whitespace-nowrap">
              En tránsito:{' '}
              <strong className="font-mono-num text-amber-300">
                {formatUSD(transitCapital)}
              </strong>{' '}
              ({transitUnits} uds)
            </div>
          </div>

          {transitBatches.length === 0 ? (
            <div className="mt-5 rounded-lg border border-dashed border-slate-700/80 bg-[#080E1C] p-6 text-center">
              <p className="text-sm font-medium text-slate-300">
                No hay pedidos en tránsito en este momento
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Cuando registres una nueva orden en la Etapa 1 aparecerá aquí para auditar su llegada a bodega.
              </p>
            </div>
          ) : (
            <div className="mt-5 divide-y divide-slate-800">
              {transitBatches.map((batch) => (
                <article
                  key={batch.id}
                  data-testid={`transit-batch-${batch.id}`}
                  className="py-5 first:pt-1 last:pb-1 space-y-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          {batch.status}
                        </span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span className="font-mono-num text-xs text-slate-400">
                          Orden {batch.entryDate}
                        </span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span className="text-xs text-blue-300">
                          {batch.shippingType}
                        </span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span className="text-xs text-slate-400">
                          Pago:{' '}
                          {batch.fundingSource === 'growthReinvestment'
                            ? 'Fondo Reinversión'
                            : 'Caja General'}
                        </span>
                      </div>

                      <h3 className="text-base font-semibold text-white">
                        {batch.referenceName}
                      </h3>

                      <p className="text-xs text-slate-400">
                        {batch.orderedTotalUnits} prendas en camino · Fábrica{' '}
                        <span className="font-mono-num text-slate-200">
                          {formatUSD(batch.totalFactoryCost)}
                        </span>{' '}
                        + Flete est.{' '}
                        <span className="font-mono-num text-slate-200">
                          {formatUSD(batch.estimatedFreightCost)}
                        </span>{' '}
                        · Total invertido:{' '}
                        <strong className="font-mono-num text-amber-300">
                          {formatUSD(batch.totalLandedCost)}
                        </strong>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => openReceiveModal(batch)}
                      className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    >
                      <PackageCheck className="h-4 w-4" aria-hidden="true" />
                      Recibir / Validar Lote
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-800/80 bg-[#080E1C] px-4 py-2.5">
                    <ul className="divide-y divide-slate-800/60 text-xs">
                      {batch.items.map((item, idx) => (
                        <li
                          key={`${batch.id}-transit-item-${idx}`}
                          className="flex flex-wrap items-center justify-between gap-2 py-2"
                        >
                          <span className="text-slate-200">
                            <strong className="font-mono-num text-white">
                              {item.orderedQuantity}x
                            </strong>{' '}
                            {item.model}{' '}
                            <span className="text-slate-400">
                              ({item.team} · {item.version} · Talla {item.size})
                            </span>
                          </span>
                          <span className="font-mono-num text-slate-400">
                            Fábrica {formatUSD(item.factoryUnitCost)}/ud · Est. puesto{' '}
                            <strong className="text-blue-300">
                              {formatUSD(item.landedUnitCost)}/ud
                            </strong>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* HISTORIAL DE COMPRAS Y LOTES RECIBIDOS EN BODEGA */}
      {(subView === 'all' || subView === 'history') && (
        <section
          aria-labelledby="purchase-history-heading"
          className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6 overflow-hidden"
        >
          <div className="flex items-center justify-between gap-4">
            <h2
              id="purchase-history-heading"
              className="font-display text-lg font-semibold text-white"
            >
              Historial de Compras y Lotes Recibidos en Bodega
            </h2>
            <span className="font-mono-num text-xs text-slate-400">
              {receivedBatches.length}{' '}
              {receivedBatches.length === 1 ? 'lote' : 'lotes'}
            </span>
          </div>

          {receivedBatches.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">
              Aún no hay lotes recibidos en bodega. Al validar una orden en tránsito aparecerá aquí con su Landed Cost definitivo.
            </p>
          ) : (
            <>
              <div className="mt-4 hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-800 bg-[#080E1C] text-xs font-medium text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Fechas y Estatus</th>
                      <th className="px-4 py-3">Lote / Envío</th>
                      <th className="px-4 py-3">Detalle Recibido (Landed Real)</th>
                      <th className="px-4 py-3 text-right">Fábrica</th>
                      <th className="px-4 py-3 text-right">Flete Real</th>
                      <th className="px-4 py-3 text-right">Total Lote</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {receivedBatches.map((b) => {
                      const diff = b.freightAdjustment ?? 0;
                      return (
                        <tr
                          key={b.id}
                          className="align-top hover:bg-slate-800/30"
                        >
                          <td className="px-4 py-3 text-xs whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                              <PackageCheck
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              {b.status}
                            </span>
                            <p className="font-mono-num mt-1 text-slate-300">
                              Recibido: {b.receivedDate ?? b.entryDate}
                            </p>
                            {b.receivedDate && b.receivedDate !== b.entryDate && (
                              <p className="font-mono-num text-[11px] text-slate-500">
                                Orden: {b.entryDate}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-white">
                              {b.referenceName}
                            </p>
                            <p className="text-xs text-blue-300">
                              {b.shippingType} · {b.totalUnits}
                              {b.orderedTotalUnits !== b.totalUnits
                                ? `/${b.orderedTotalUnits}`
                                : ''}{' '}
                              uds (Flete{' '}
                              <span className="font-mono-num">
                                {formatUSD(b.freightPerUnit)}/ud
                              </span>
                              )
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <ul className="space-y-1 text-xs text-slate-300">
                              {b.items.map((item, idx) => (
                                <li key={`${b.id}-${item.skuId ?? idx}-${idx}`}>
                                  <strong className="font-mono-num text-white">
                                    {item.quantity}x
                                  </strong>{' '}
                                  {item.model} ({item.version} · {item.size})
                                  {item.orderedQuantity !== item.quantity ? (
                                    <span className="text-amber-300">
                                      {' '}
                                      [pedidas: {item.orderedQuantity}]
                                    </span>
                                  ) : null}{' '}
                                  — Fábrica{' '}
                                  <span className="font-mono-num">
                                    {formatUSD(item.factoryUnitCost)}
                                  </span>{' '}
                                  → Puesto{' '}
                                  <strong className="font-mono-num text-white">
                                    {formatUSD(item.landedUnitCost)}/ud
                                  </strong>
                                </li>
                              ))}
                            </ul>
                          </td>
                          <td className="px-4 py-3 text-right font-mono-num text-slate-300 whitespace-nowrap">
                            {formatUSD(b.totalFactoryCost)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono-num whitespace-nowrap">
                            <span className="text-slate-300">
                              {formatUSD(b.totalFreightCost)}
                            </span>
                            {diff !== 0 && (
                              <span
                                className={`block text-[11px] ${
                                  diff > 0 ? 'text-amber-300' : 'text-emerald-400'
                                }`}
                              >
                                ({diff > 0 ? `+${formatUSD(diff)}` : formatUSD(diff)})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono-num font-bold text-red-300 whitespace-nowrap">
                            -{formatUSD(b.totalLandedCost)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 divide-y divide-slate-800/80 md:hidden">
                {receivedBatches.map((b) => (
                  <div key={b.id} className="py-3.5 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                          <PackageCheck
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          {b.status}
                        </span>
                        <p className="mt-0.5 text-sm font-semibold text-white">
                          {b.referenceName}
                        </p>
                        <p className="text-slate-400">
                          {b.receivedDate ?? b.entryDate} · {b.shippingType} ·{' '}
                          {b.totalUnits} uds
                        </p>
                      </div>
                      <span className="font-mono-num text-sm font-bold text-red-300 shrink-0">
                        -{formatUSD(b.totalLandedCost)}
                      </span>
                    </div>
                    <ul className="space-y-1 text-slate-300">
                      {b.items.map((item, idx) => (
                        <li key={`${b.id}-m-${idx}`}>
                          {item.quantity}x {item.model} ({item.version} ·{' '}
                          {item.size}) →{' '}
                          <strong className="font-mono-num text-white">
                            {formatUSD(item.landedUnitCost)}/ud
                          </strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ETAPA 2: MODAL DE RECEPCIÓN Y AUDITORÍA DE INGRESO A BODEGA */}
      {receivingBatch && modalAuditPreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="receive-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-[#0D1526] p-5 sm:p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <p className="text-xs font-medium text-emerald-400">
                  Etapa 2 · Auditoría de Ingreso a Bodega FIFO
                </p>
                <h2
                  id="receive-modal-title"
                  className="font-display mt-0.5 text-lg font-bold text-white sm:text-xl"
                >
                  Recibir y Validar: {receivingBatch.referenceName}
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Orden {receivingBatch.entryDate} · {receivingBatch.shippingType} · Flete estimado:{' '}
                  <span className="font-mono-num text-slate-200">
                    {formatUSD(receivingBatch.estimatedFreightCost)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceivingBatch(null)}
                aria-label="Cerrar modal de recepción"
                className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-700 bg-[#080E1C] text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleConfirmReceive} className="mt-5 space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="receive-date"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Fecha de recepción en bodega (FIFO)
                  </label>
                  <input
                    id="receive-date"
                    type="date"
                    required
                    value={receiveDate}
                    onChange={(e) => {
                      setReceiveDate(e.target.value);
                      setReceiveError(null);
                    }}
                    className="font-mono-num mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="receive-actual-freight"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Costo Real del Flete ($ USD)
                  </label>
                  <input
                    id="receive-actual-freight"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={actualFreightInput}
                    onChange={(e) => {
                      setActualFreightInput(e.target.value);
                      setReceiveError(null);
                    }}
                    className="font-mono-num mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-200">
                    Cantidades Reales Recibidas por Modelo
                  </h3>
                  <span className="font-mono-num text-xs text-slate-400">
                    Flete real prorrateado:{' '}
                    <strong className="text-blue-300">
                      {modalAuditPreview.totalReceivedUnits > 0
                        ? `${formatUSD(modalAuditPreview.freightPerUnitDisplay)}/ud`
                        : '—'}
                    </strong>
                  </span>
                </div>

                <div className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-[#080E1C] px-3.5">
                  {receivingBatch.items.map((item, idx) => {
                    const qtyVal = Math.max(
                      0,
                      Math.floor(Number(receivedQtys[idx]) || 0),
                    );
                    const realLanded =
                      modalAuditPreview.totalReceivedUnits > 0
                        ? round2(
                            round4(
                              item.factoryUnitCost +
                                modalAuditPreview.freightPerUnitExact,
                            ),
                          )
                        : item.factoryUnitCost;
                    return (
                      <div
                        key={`receive-line-${idx}`}
                        className="flex flex-col gap-2.5 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white">
                            {item.model}
                          </p>
                          <p className="text-xs text-slate-400">
                            {item.version} · Talla {item.size} · Pedido:{' '}
                            <span className="font-mono-num text-slate-200">
                              {item.orderedQuantity} uds
                            </span>{' '}
                            · Fábrica{' '}
                            <span className="font-mono-num">
                              {formatUSD(item.factoryUnitCost)}
                            </span>
                          </p>
                        </div>

                        <div className="flex items-center justify-between gap-3 sm:justify-end shrink-0">
                          <div className="text-right">
                            <span className="block text-[11px] text-slate-400">
                              Landed Real
                            </span>
                            <span className="font-mono-num text-xs font-semibold text-emerald-300">
                              {qtyVal > 0 ? `${formatUSD(realLanded)}/ud` : 'Sin ingreso'}
                            </span>
                          </div>
                          <div>
                            <label
                              htmlFor={`receive-qty-${idx}`}
                              className="sr-only"
                            >
                              Cantidad recibida de {item.model}
                            </label>
                            <input
                              id={`receive-qty-${idx}`}
                              type="number"
                              min="0"
                              step="1"
                              required
                              value={receivedQtys[idx] ?? '0'}
                              onChange={(e) => {
                                setReceivedQtys((prev) => ({
                                  ...prev,
                                  [idx]: e.target.value,
                                }));
                                setReceiveError(null);
                              }}
                              className="font-mono-num min-h-[42px] w-24 rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-right text-sm font-semibold text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Resumen de diferencia de flete y efecto en caja/fondo */}
              <div className="space-y-2 rounded-lg border border-slate-800 bg-[#080E1C] p-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Total piezas a ingresar a FIFO</span>
                  <span className="font-mono-num font-semibold text-white">
                    {modalAuditPreview.totalReceivedUnits} /{' '}
                    {receivingBatch.orderedTotalUnits} uds
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">
                    Diferencia flete (Real vs Estimado)
                  </span>
                  <span
                    data-testid="receive-freight-diff"
                    className={`font-mono-num font-semibold ${
                      modalAuditPreview.freightDiff > 0
                        ? 'text-amber-300'
                        : modalAuditPreview.freightDiff < 0
                          ? 'text-emerald-400'
                          : 'text-slate-200'
                    }`}
                  >
                    {modalAuditPreview.freightDiff === 0
                      ? '$0.00 (Sin diferencia)'
                      : modalAuditPreview.freightDiff > 0
                        ? `+${formatUSD(modalAuditPreview.freightDiff)} (Cargo adicional a ${
                            receivingBatch.fundingSource === 'growthReinvestment'
                              ? 'Fondo Reinversión'
                              : 'Caja General'
                          })`
                        : `${formatUSD(modalAuditPreview.freightDiff)} (Reembolso a ${
                            receivingBatch.fundingSource === 'growthReinvestment'
                              ? 'Fondo Reinversión'
                              : 'Caja General'
                          })`}
                  </span>
                </div>
              </div>

              {receiveError && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-300"
                >
                  {receiveError}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setReceivingBatch(null)}
                  className="min-h-[44px] rounded-lg border border-slate-700 bg-[#080E1C] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  <PackageCheck className="h-4 w-4" aria-hidden="true" />
                  Confirmar Recepción e Ingresar a FIFO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
