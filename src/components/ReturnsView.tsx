import { useMemo, useState } from 'react';
import { ArrowLeftRight, CheckCircle2, RotateCcw } from 'lucide-react';
import type {
  AppState,
  ReturnExchangeType,
  SinglePaymentMethod,
} from '../types/erp';
import type { ProcessReturnExchangeInput } from '../utils/finance';
import {
  formatUSD,
  formatUSDT,
  formatVES,
  normalizeVersionDisplay,
  round2,
} from '../utils/finance';

interface ReturnsViewProps {
  state: AppState;
  onProcessReturnOrExchange: (
    input: ProcessReturnExchangeInput,
  ) => { ok: boolean; error?: string };
}

const SINGLE_PAYMENT_METHODS: SinglePaymentMethod[] = [
  'Efectivo ($)',
  'Binance USDT',
  'Zelle',
  'Pago Móvil / Bs',
];

export function ReturnsView({
  state,
  onProcessReturnOrExchange,
}: ReturnsViewProps) {
  const [operationType, setOperationType] = useState<ReturnExchangeType>('Cambio');
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');
  const [returnedSkuId, setReturnedSkuId] = useState<string>(
    () => state.inventory[0]?.id ?? '',
  );
  const [returnedQty, setReturnedQty] = useState<string>('1');
  const [returnedUnitPrice, setReturnedUnitPrice] = useState<string>(() =>
    state.inventory[0] ? state.inventory[0].salePrice.toFixed(2) : '25.00',
  );

  const [replacementSkuId, setReplacementSkuId] = useState<string>('');
  const [replacementQty, setReplacementQty] = useState<string>('1');
  const [replacementUnitPrice, setReplacementUnitPrice] = useState<string>('25.00');

  const [paymentMethod, setPaymentMethod] =
    useState<SinglePaymentMethod>('Efectivo ($)');
  const [reason, setReason] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const allCatalogSkus = useMemo(
    () =>
      [...state.inventory].sort(
        (a, b) =>
          a.model.localeCompare(b.model) ||
          a.version.localeCompare(b.version) ||
          a.size.localeCompare(b.size),
      ),
    [state.inventory],
  );

  const availableReplacementSkus = useMemo(
    () => allCatalogSkus.filter((i) => i.stock > 0),
    [allCatalogSkus],
  );

  const effectiveReturnedSkuId = allCatalogSkus.some(
    (s) => s.id === returnedSkuId,
  )
    ? returnedSkuId
    : (allCatalogSkus[0]?.id ?? '');

  const effectiveReplacementSkuId = availableReplacementSkus.some(
    (s) => s.id === replacementSkuId,
  )
    ? replacementSkuId
    : (availableReplacementSkus.find((s) => s.id !== effectiveReturnedSkuId)?.id ??
      availableReplacementSkus[0]?.id ??
      '');

  const selectedSale = useMemo(
    () => state.sales.find((s) => s.id === selectedSaleId) ?? null,
    [selectedSaleId, state.sales],
  );

  const saleLineItems = useMemo(() => {
    if (!selectedSale) return [];
    if (selectedSale.items && selectedSale.items.length > 0) {
      return selectedSale.items;
    }
    return [
      {
        skuId: selectedSale.skuId,
        modelLabel: selectedSale.modelLabel,
        version: selectedSale.version,
        size: selectedSale.size,
        quantity: selectedSale.quantity,
        unitPrice: round2(
          selectedSale.finalPrice / Math.max(1, selectedSale.quantity),
        ),
      },
    ];
  }, [selectedSale]);

  const handleSelectSale = (saleId: string) => {
    setSelectedSaleId(saleId);
    setFeedback(null);
    const sale = state.sales.find((s) => s.id === saleId);
    if (!sale) return;

    setCustomerName(sale.customerName || '');
    const firstItem =
      sale.items && sale.items.length > 0
        ? sale.items[0]
        : {
            skuId: sale.skuId,
            quantity: sale.quantity,
            unitPrice: round2(sale.finalPrice / Math.max(1, sale.quantity)),
          };

    if (allCatalogSkus.some((i) => i.id === firstItem.skuId)) {
      setReturnedSkuId(firstItem.skuId);
    }
    setReturnedQty('1');
    setReturnedUnitPrice(firstItem.unitPrice.toFixed(2));
  };

  const handleSelectReturnedSku = (skuId: string) => {
    setReturnedSkuId(skuId);
    setFeedback(null);
    const found = allCatalogSkus.find((i) => i.id === skuId);
    if (found) {
      setReturnedUnitPrice(found.salePrice.toFixed(2));
    }
  };

  const handleSelectReplacementSku = (skuId: string) => {
    setReplacementSkuId(skuId);
    setFeedback(null);
    const found = availableReplacementSkus.find((i) => i.id === skuId);
    if (found) {
      setReplacementUnitPrice(found.salePrice.toFixed(2));
    }
  };

  const activeReplacementSku = availableReplacementSkus.find(
    (s) => s.id === effectiveReplacementSkuId,
  );
  const effectiveReplacementPrice =
    Number(replacementUnitPrice) > 0
      ? round2(Number(replacementUnitPrice))
      : round2(activeReplacementSku?.salePrice ?? 25);

  const parsedRetQty = Math.max(0, Math.floor(Number(returnedQty) || 0));
  const parsedRetPrice = round2(Math.max(0, Number(returnedUnitPrice) || 0));
  const returnedTotal = round2(parsedRetQty * parsedRetPrice);

  const parsedRepQty =
    operationType === 'Cambio'
      ? Math.max(0, Math.floor(Number(replacementQty) || 0))
      : 0;
  const replacementTotal =
    operationType === 'Cambio'
      ? round2(parsedRepQty * effectiveReplacementPrice)
      : 0;

  const differenceUsd = round2(replacementTotal - returnedTotal);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!effectiveReturnedSkuId) {
      setFeedback({
        type: 'error',
        text: 'No hay productos registrados en el catálogo para procesar la devolución.',
      });
      return;
    }

    const res = onProcessReturnOrExchange({
      type: operationType,
      saleId: selectedSale?.id,
      invoiceNumber: selectedSale?.invoiceNumber,
      returnedSkuId: effectiveReturnedSkuId,
      returnedQuantity: parsedRetQty,
      returnedUnitPrice: parsedRetPrice,
      replacementSkuId:
        operationType === 'Cambio' ? effectiveReplacementSkuId : undefined,
      replacementQuantity: operationType === 'Cambio' ? parsedRepQty : undefined,
      replacementUnitPrice:
        operationType === 'Cambio' ? effectiveReplacementPrice : undefined,
      paymentMethod,
      reason,
      customerName: customerName.trim() || undefined,
    });

    if (!res.ok) {
      setFeedback({
        type: 'error',
        text: res.error ?? 'No se pudo procesar la operación.',
      });
      return;
    }

    setReason('');
    setSelectedSaleId('');
    setCustomerName('');
    setReturnedQty('1');
    setReplacementQty('1');
    setFeedback({
      type: 'success',
      text:
        operationType === 'Cambio'
          ? differenceUsd > 0
            ? `Cambio procesado. Cliente pagó diferencia de +${formatUSD(differenceUsd)} a caja y el stock FIFO fue actualizado.`
            : differenceUsd < 0
              ? `Cambio procesado. Se reembolsó ${formatUSD(Math.abs(differenceUsd))} y el stock FIFO fue actualizado.`
              : 'Cambio parejo ($0.00) procesado e inventario FIFO actualizado.'
          : `Devolución registrada. Stock restaurado al inventario FIFO y reembolso de ${formatUSD(Math.abs(differenceUsd))} aplicado.`,
    });
  };

  const returnsHistory = state.returns ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Devoluciones y Cambios de Mercancía
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Restaura prendas devueltas al inventario FIFO, entrega reemplazos y calcula automáticamente la diferencia a cobrar o reembolsar.
        </p>
      </div>

      <section
        aria-labelledby="returns-form-heading"
        className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2
            id="returns-form-heading"
            className="font-display text-lg font-semibold text-white"
          >
            Registrar Operación
          </h2>

          <div
            role="group"
            aria-label="Tipo de operación"
            className="inline-flex rounded-lg border border-slate-700 bg-[#080E1C] p-1"
          >
            <button
              type="button"
              data-testid="btn-mode-cambio"
              onClick={() => {
                setOperationType('Cambio');
                setFeedback(null);
              }}
              aria-pressed={operationType === 'Cambio'}
              className={`min-h-[38px] rounded-md px-3.5 text-xs font-semibold transition-colors ${
                operationType === 'Cambio'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Cambio de Prenda
            </button>
            <button
              type="button"
              data-testid="btn-mode-devolucion"
              onClick={() => {
                setOperationType('Devolución');
                setFeedback(null);
              }}
              aria-pressed={operationType === 'Devolución'}
              className={`min-h-[38px] rounded-md px-3.5 text-xs font-semibold transition-colors ${
                operationType === 'Devolución'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Devolución / Reembolso
            </button>
          </div>
        </div>

        {allCatalogSkus.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-[#080E1C] p-5 text-sm text-slate-300">
            No hay modelos registrados en inventario todavía. Registra una compra o importa tu archivo Excel para habilitar devoluciones y cambios.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Optional invoice lookup */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
              <div className="sm:col-span-6">
                <label
                  htmlFor="return-sale-ref"
                  className="block text-xs font-medium text-slate-300"
                >
                  Factura original (opcional)
                </label>
                <select
                  id="return-sale-ref"
                  value={selectedSaleId}
                  onChange={(e) => handleSelectSale(e.target.value)}
                  className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">
                    Sin factura vinculada / Selección manual de catálogo
                  </option>
                  {state.sales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.invoiceNumber || s.id} · {s.customerName} ·{' '}
                      {formatUSD(s.finalPrice)} ({s.paymentStatus})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-6">
                <label
                  htmlFor="return-customer-name"
                  className="block text-xs font-medium text-slate-300"
                >
                  Nombre del Cliente (opcional)
                </label>
                <input
                  id="return-customer-name"
                  type="text"
                  placeholder="Ej. Carlos Mendoza"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {selectedSale && saleLineItems.length > 1 && (
              <div className="rounded-lg border border-slate-800 bg-[#080E1C] p-3">
                <p className="text-xs font-medium text-slate-300">
                  Prendas incluidas en {selectedSale.invoiceNumber}:
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {saleLineItems.map((line, i) => (
                    <button
                      key={`${line.skuId}-${i}`}
                      type="button"
                      onClick={() => {
                        setReturnedSkuId(line.skuId);
                        setReturnedUnitPrice(line.unitPrice.toFixed(2));
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        effectiveReturnedSkuId === line.skuId
                          ? 'border-blue-500 bg-blue-600/20 text-white'
                          : 'border-slate-700 bg-[#070D19] text-slate-300 hover:text-white'
                      }`}
                    >
                      {line.quantity}x {line.modelLabel} ({line.version} ·{' '}
                      {line.size}) — {formatUSD(line.unitPrice)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {/* Prenda Devuelta */}
              <div className="rounded-lg border border-slate-800 bg-[#080E1C] p-4 space-y-3.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  1. Prenda que ingresa (Devuelta)
                </p>

                <div>
                  <label
                    htmlFor="returned-sku"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Modelo devuelto *
                  </label>
                  <select
                    id="returned-sku"
                    required
                    value={effectiveReturnedSkuId}
                    onChange={(e) => handleSelectReturnedSku(e.target.value)}
                    className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {allCatalogSkus.map((sku) => (
                      <option key={sku.id} value={sku.id}>
                        {sku.model} ({normalizeVersionDisplay(sku.version)} · Talla{' '}
                        {sku.size}) — Stock actual: {sku.stock}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="returned-qty"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Cantidad *
                    </label>
                    <input
                      id="returned-qty"
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={returnedQty}
                      onChange={(e) => setReturnedQty(e.target.value)}
                      className="font-mono-num mt-1.5 w-full min-h-[42px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="returned-unit-price"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Precio unit. devuelto (USDT) *
                    </label>
                    <input
                      id="returned-unit-price"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={returnedUnitPrice}
                      onChange={(e) => setReturnedUnitPrice(e.target.value)}
                      className="font-mono-num mt-1.5 w-full min-h-[42px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <p className="text-xs text-slate-400">
                  Crédito por prenda devuelta:{' '}
                  <strong className="font-mono-num text-white">
                    {formatUSDT(returnedTotal)}
                  </strong>
                </p>
              </div>

              {/* Prenda de Reemplazo (Solo Cambio) */}
              {operationType === 'Cambio' ? (
                <div className="rounded-lg border border-slate-800 bg-[#080E1C] p-4 space-y-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">
                    2. Prenda que sale (Reemplazo)
                  </p>

                  {availableReplacementSkus.length === 0 ? (
                    <p className="text-xs text-amber-300">
                      No hay unidades disponibles en bodega para entregar como reemplazo.
                    </p>
                  ) : (
                    <>
                      <div>
                        <label
                          htmlFor="replacement-sku"
                          className="block text-xs font-medium text-slate-300"
                        >
                          Modelo de reemplazo *
                        </label>
                        <select
                          id="replacement-sku"
                          required
                          value={effectiveReplacementSkuId}
                          onChange={(e) =>
                            handleSelectReplacementSku(e.target.value)
                          }
                          className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {availableReplacementSkus.map((sku) => (
                            <option key={sku.id} value={sku.id}>
                              {sku.model} ({normalizeVersionDisplay(sku.version)} ·
                              Talla {sku.size}) — {sku.stock} disp. ·{' '}
                              {formatUSD(sku.salePrice)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="replacement-qty"
                            className="block text-xs font-medium text-slate-300"
                          >
                            Cantidad *
                          </label>
                          <input
                            id="replacement-qty"
                            type="number"
                            min="1"
                            max={activeReplacementSku?.stock ?? 1}
                            step="1"
                            required
                            value={replacementQty}
                            onChange={(e) => setReplacementQty(e.target.value)}
                            className="font-mono-num mt-1.5 w-full min-h-[42px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="replacement-unit-price"
                            className="block text-xs font-medium text-slate-300"
                          >
                            Precio unit. nuevo (USDT) *
                          </label>
                          <input
                            id="replacement-unit-price"
                            type="number"
                            min="0.01"
                            step="0.01"
                            required
                            value={replacementUnitPrice}
                            onChange={(e) =>
                              setReplacementUnitPrice(e.target.value)
                            }
                            className="font-mono-num mt-1.5 w-full min-h-[42px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <p className="text-xs text-slate-400">
                        Valor prenda de reemplazo:{' '}
                        <strong className="font-mono-num text-white">
                          {formatUSDT(replacementTotal)}
                        </strong>
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-slate-800 bg-[#080E1C] p-4 flex flex-col justify-center space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                    2. Liquidación de Devolución
                  </p>
                  <p className="text-xs text-slate-300">
                    La prenda seleccionada regresará al stock disponible (capa FIFO) y se descontará el reembolso de caja física (o de la cuenta por cobrar pendiente si la factura estaba a crédito).
                  </p>
                </div>
              )}
            </div>

            {/* Automatic Price Difference Calculation */}
            <div
              data-testid="return-difference-banner"
              className={`rounded-lg border p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${
                differenceUsd > 0
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                  : differenceUsd < 0
                    ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
                    : 'border-slate-700 bg-[#080E1C] text-slate-200'
              }`}
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider">
                  Cálculo Automático de Diferencia
                </p>
                <p className="mt-0.5 text-sm font-medium">
                  {differenceUsd > 0
                    ? `El cliente debe pagar la diferencia: +${formatUSDT(differenceUsd)} (${formatVES(differenceUsd * state.exchangeRates.bcv)} BCV)`
                    : differenceUsd < 0
                      ? `Se debe reembolsar al cliente: ${formatUSDT(Math.abs(differenceUsd))} (${formatVES(Math.abs(differenceUsd) * state.exchangeRates.bcv)} BCV)`
                      : 'Cambio parejo sin diferencia monetaria ($0.00 USDT)'}
                </p>
              </div>
              <span className="font-mono-num text-xl font-bold text-white shrink-0">
                {differenceUsd > 0 ? '+' : differenceUsd < 0 ? '-' : ''}
                {formatUSD(Math.abs(differenceUsd))}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 sm:items-end">
              <div className="sm:col-span-4">
                <label
                  htmlFor="return-payment-method"
                  className="block text-xs font-medium text-slate-300"
                >
                  Vía de cobro / reembolso
                </label>
                <select
                  id="return-payment-method"
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as SinglePaymentMethod)
                  }
                  className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {SINGLE_PAYMENT_METHODS.map((pm) => (
                    <option key={pm} value={pm}>
                      {pm}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-5">
                <label
                  htmlFor="return-reason"
                  className="block text-xs font-medium text-slate-300"
                >
                  Motivo del cambio o devolución
                </label>
                <input
                  id="return-reason"
                  type="text"
                  placeholder="Ej. Cambio de talla M a L / Cambio por modelo Player"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="sm:col-span-3">
                <button
                  type="submit"
                  data-testid="btn-submit-return"
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  {operationType === 'Cambio' ? (
                    <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  )}
                  Confirmar {operationType}
                </button>
              </div>
            </div>

            {feedback && (
              <div
                role="status"
                className={`flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-xs font-medium ${
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
          </form>
        )}
      </section>

      <section
        aria-labelledby="returns-history-heading"
        className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6 overflow-hidden"
      >
        <div className="flex items-center justify-between gap-4">
          <h2
            id="returns-history-heading"
            className="font-display text-lg font-semibold text-white"
          >
            Historial de Devoluciones y Cambios
          </h2>
          <span className="font-mono-num text-xs text-slate-400">
            {returnsHistory.length}{' '}
            {returnsHistory.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        {returnsHistory.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">
            Aún no se han procesado cambios ni devoluciones. Cada operación ajustará el stock FIFO y el efectivo en caja automáticamente.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-[#080E1C] text-xs font-medium text-slate-400">
                <tr>
                  <th className="px-4 py-3">Fecha / Tipo</th>
                  <th className="px-4 py-3">Cliente / Factura</th>
                  <th className="px-4 py-3">Prenda Devuelta</th>
                  <th className="px-4 py-3">Prenda Reemplazo</th>
                  <th className="px-4 py-3">Motivo</th>
                  <th className="px-4 py-3 text-right">Diferencia (USDT)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {returnsHistory.map((rec) => (
                  <tr key={rec.id} className="align-top hover:bg-slate-800/30">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`text-xs font-semibold ${
                          rec.type === 'Cambio'
                            ? 'text-blue-300'
                            : 'text-amber-300'
                        }`}
                      >
                        {rec.type}
                      </span>
                      <span className="block font-mono-num text-[11px] text-slate-400">
                        {new Date(rec.createdAt).toLocaleString('es-VE', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-200 whitespace-nowrap">
                      <span className="font-semibold text-white">
                        {rec.customerName || 'Cliente Mostrador'}
                      </span>
                      {rec.invoiceNumber && (
                        <span className="block font-mono-num text-[11px] text-blue-300">
                          {rec.invoiceNumber}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300">
                      <strong className="text-white">
                        +{rec.returnedQuantity}x
                      </strong>{' '}
                      {rec.returnedModelLabel} (
                      {normalizeVersionDisplay(rec.returnedVersion)} ·{' '}
                      {rec.returnedSize})
                      <span className="block font-mono-num text-[11px] text-slate-400">
                        {formatUSD(rec.returnedTotal)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300">
                      {rec.replacementModelLabel ? (
                        <>
                          <strong className="text-white">
                            -{rec.replacementQuantity}x
                          </strong>{' '}
                          {rec.replacementModelLabel} (
                          {normalizeVersionDisplay(
                            rec.replacementVersion ?? 'Fans',
                          )}{' '}
                          · {rec.replacementSize})
                          <span className="block font-mono-num text-[11px] text-slate-400">
                            {formatUSD(rec.replacementTotal ?? 0)}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-500">Sin reemplazo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300">
                      {rec.reason}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num text-xs font-bold whitespace-nowrap">
                      <span
                        className={
                          rec.differenceUsd > 0
                            ? 'text-emerald-400'
                            : rec.differenceUsd < 0
                              ? 'text-red-300'
                              : 'text-slate-300'
                        }
                      >
                        {rec.differenceUsd > 0
                          ? `+${formatUSD(rec.differenceUsd)}`
                          : rec.differenceUsd < 0
                            ? `-${formatUSD(Math.abs(rec.differenceUsd))}`
                            : formatUSD(0)}
                      </span>
                      <span className="block text-[10px] font-normal text-slate-400">
                        {rec.paymentMethod}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
