import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Percent,
  Plus,
  ShoppingBag,
  Tag,
  Trash2,
} from 'lucide-react';
import type {
  AppState,
  JerseySize,
  JerseyVersion,
  PaymentMethod,
  PaymentSplit,
  PaymentStatus,
  SellerName,
  SinglePaymentMethod,
} from '../types/erp';
import type { PricingAdjustMode, RegisterMultiSaleInput } from '../utils/finance';
import {
  calculateDiscountedUnitPrice,
  calculateFourLayerMatrixConsolidated,
  formatUSD,
  formatVES,
  getNextFifoUnitCost,
  previewFifoConsumption,
  round2,
  WHOLESALE_DISCOUNT_PCT,
} from '../utils/finance';

interface SalesViewProps {
  state: AppState;
  onRegisterMultiSale: (
    input: RegisterMultiSaleInput,
  ) => { ok: boolean; error?: string };
}

interface CartLine {
  lineId: string;
  skuId: string;
  modelLabel: string;
  version: JerseyVersion;
  size: JerseySize;
  quantity: number;
  baseUnitPrice: number;
  discountLabel?: string;
  unitPrice: number;
  subtotal: number;
}

const SELLERS: SellerName[] = ['Jesús', 'Josué', 'Gabriel', 'Sin Vendedor'];
const SINGLE_PAYMENT_METHODS: SinglePaymentMethod[] = [
  'Efectivo ($)',
  'Binance USDT',
  'Zelle',
  'Pago Móvil / Bs',
];
const ALL_PAYMENT_METHODS: PaymentMethod[] = [
  ...SINGLE_PAYMENT_METHODS,
  'Pago Mixto',
];

const INITIAL_MIXED_SPLITS: Record<SinglePaymentMethod, string> = {
  'Efectivo ($)': '',
  'Binance USDT': '',
  Zelle: '',
  'Pago Móvil / Bs': '',
};

export function SalesView({ state, onRegisterMultiSale }: SalesViewProps) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedSkuId, setSelectedSkuId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [unitPrice, setUnitPrice] = useState<string>('30.00');
  const [pricingMode, setPricingMode] = useState<PricingAdjustMode>('normal');
  const [discountType, setDiscountType] = useState<'pct' | 'usd'>('usd');
  const [discountAmountInput, setDiscountAmountInput] = useState<string>('');

  const [customerName, setCustomerName] = useState<string>('');
  const [seller, setSeller] = useState<SellerName>('Jesús');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Cobrado');
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('Efectivo ($)');
  const [mixedSplits, setMixedSplits] =
    useState<Record<SinglePaymentMethod, string>>(INITIAL_MIXED_SPLITS);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const qtyInCartBySku = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cart) {
      map.set(line.skuId, (map.get(line.skuId) ?? 0) + line.quantity);
    }
    return map;
  }, [cart]);

  const availableSkus = useMemo(
    () =>
      state.inventory
        .filter((item) => item.stock - (qtyInCartBySku.get(item.id) ?? 0) > 0)
        .sort(
          (a, b) =>
            a.team.localeCompare(b.team) || a.model.localeCompare(b.model),
        ),
    [qtyInCartBySku, state.inventory],
  );

  const effectiveSkuId = availableSkus.some((s) => s.id === selectedSkuId)
    ? selectedSkuId
    : (availableSkus[0]?.id ?? '');

  const activeSku = availableSkus.find((s) => s.id === effectiveSkuId) ?? null;
  const remainingForActiveSku = activeSku
    ? activeSku.stock - (qtyInCartBySku.get(activeSku.id) ?? 0)
    : 0;

  // Auto-fill unit price in USD whenever the active SKU changes
  useEffect(() => {
    if (!activeSku) return;
    setUnitPrice(activeSku.salePrice.toFixed(2));
    setPricingMode('normal');
    setDiscountAmountInput('');
  }, [activeSku?.id, activeSku?.salePrice]);

  // Simulate exact sequential FIFO consumption across all lines in the cart
  const cartFifoSimulation = useMemo(() => {
    const workingInventory = new Map(
      state.inventory.map((item) => [
        item.id,
        {
          ...item,
          fifoBatches: (item.fifoBatches ?? []).map((b) => ({ ...b })),
        },
      ]),
    );

    const lineCogsMap = new Map<string, number>();
    let totalUnits = 0;
    let totalAmount = 0;
    let totalBaseCost = 0;

    for (const line of cart) {
      const sku = workingInventory.get(line.skuId);
      let lineCost = 0;
      if (sku) {
        const res = previewFifoConsumption(sku, line.quantity);
        lineCost = res.totalCost;
        sku.stock -= line.quantity;
        sku.fifoBatches = res.updatedBatches;
      }
      lineCogsMap.set(line.lineId, lineCost);
      totalUnits += line.quantity;
      totalAmount += line.subtotal;
      totalBaseCost += lineCost;
    }

    return {
      lineCogsMap,
      totalUnits,
      totalAmount: round2(totalAmount),
      totalBaseCost: round2(totalBaseCost),
    };
  }, [cart, state.inventory]);

  const liveBreakdown = useMemo(() => {
    if (cart.length === 0 || cartFifoSimulation.totalAmount <= 0) return null;
    return calculateFourLayerMatrixConsolidated(
      cartFifoSimulation.totalAmount,
      cartFifoSimulation.totalBaseCost,
      seller,
    );
  }, [
    cart.length,
    cartFifoSimulation.totalAmount,
    cartFifoSimulation.totalBaseCost,
    seller,
  ]);

  const handleToggleWholesale = () => {
    if (!activeSku) return;
    setFeedback(null);
    if (pricingMode === 'wholesale') {
      setPricingMode('normal');
      setUnitPrice(activeSku.salePrice.toFixed(2));
      return;
    }
    const res = calculateDiscountedUnitPrice(activeSku.salePrice, 'wholesale');
    setPricingMode('wholesale');
    setDiscountAmountInput('');
    setUnitPrice(res.unitPrice.toFixed(2));
  };

  const handleToggleCustomDiscount = () => {
    if (!activeSku) return;
    setFeedback(null);
    const isDiscountActive =
      pricingMode === 'discount_pct' || pricingMode === 'discount_usd';
    if (isDiscountActive) {
      setPricingMode('normal');
      setDiscountAmountInput('');
      setUnitPrice(activeSku.salePrice.toFixed(2));
      return;
    }
    const nextMode: PricingAdjustMode =
      discountType === 'pct' ? 'discount_pct' : 'discount_usd';
    const defaultVal = discountAmountInput || (discountType === 'pct' ? '10' : '2');
    setPricingMode(nextMode);
    setDiscountAmountInput(defaultVal);
    const res = calculateDiscountedUnitPrice(
      activeSku.salePrice,
      nextMode,
      Number(defaultVal) || 0,
    );
    setUnitPrice(res.unitPrice.toFixed(2));
  };

  const handleDiscountAmountChange = (rawVal: string, nextType = discountType) => {
    setDiscountAmountInput(rawVal);
    setFeedback(null);
    if (!activeSku) return;
    const mode: PricingAdjustMode =
      nextType === 'pct' ? 'discount_pct' : 'discount_usd';
    setPricingMode(mode);
    const res = calculateDiscountedUnitPrice(
      activeSku.salePrice,
      mode,
      Number(rawVal) || 0,
    );
    setUnitPrice(res.unitPrice.toFixed(2));
  };

  const currentDiscountLabel = useMemo(() => {
    if (!activeSku) return undefined;
    const parsedPrice = round2(Number(unitPrice) || 0);
    if (pricingMode === 'wholesale') {
      return `Al Mayor (-${WHOLESALE_DISCOUNT_PCT}%)`;
    }
    if (pricingMode === 'discount_pct' || pricingMode === 'discount_usd') {
      return calculateDiscountedUnitPrice(
        activeSku.salePrice,
        pricingMode,
        Number(discountAmountInput) || 0,
      ).discountLabel;
    }
    if (pricingMode === 'manual' && parsedPrice < activeSku.salePrice) {
      const diff = round2(activeSku.salePrice - parsedPrice);
      return `Precio especial (-${formatUSD(diff)})`;
    }
    return undefined;
  }, [activeSku, discountAmountInput, pricingMode, unitPrice]);

  const handleAddToCart = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!activeSku) {
      setFeedback({
        type: 'error',
        text: 'No hay productos con stock disponible para agregar.',
      });
      return;
    }

    const parsedQty = Math.floor(Number(quantity) || 0);
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      setFeedback({
        type: 'error',
        text: 'La cantidad a agregar debe ser un número entero mayor a 0.',
      });
      return;
    }

    if (parsedQty > remainingForActiveSku) {
      setFeedback({
        type: 'error',
        text: `Stock insuficiente para ${activeSku.model} (${activeSku.version} · ${activeSku.size}). Quedan ${remainingForActiveSku} unidad(es) disponibles.`,
      });
      return;
    }

    const parsedUnitPrice = round2(Number(unitPrice) || 0);
    if (!Number.isFinite(parsedUnitPrice) || parsedUnitPrice <= 0) {
      setFeedback({
        type: 'error',
        text: 'El precio unitario debe ser mayor a $0.00.',
      });
      return;
    }

    setCart((prev) => {
      const matchIdx = prev.findIndex(
        (line) =>
          line.skuId === activeSku.id &&
          line.unitPrice === parsedUnitPrice &&
          line.discountLabel === currentDiscountLabel,
      );
      if (matchIdx >= 0) {
        return prev.map((line, idx) =>
          idx === matchIdx
            ? {
                ...line,
                quantity: line.quantity + parsedQty,
                subtotal: round2((line.quantity + parsedQty) * line.unitPrice),
              }
            : line,
        );
      }

      return [
        ...prev,
        {
          lineId: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          skuId: activeSku.id,
          modelLabel: activeSku.model,
          version: activeSku.version,
          size: activeSku.size,
          quantity: parsedQty,
          baseUnitPrice: activeSku.salePrice,
          discountLabel: currentDiscountLabel,
          unitPrice: parsedUnitPrice,
          subtotal: round2(parsedQty * parsedUnitPrice),
        },
      ];
    });

    setQuantity('1');
  };

  const handleRemoveCartLine = (lineId: string) => {
    setCart((prev) => prev.filter((l) => l.lineId !== lineId));
    setFeedback(null);
  };

  const mixedAllocatedTotal = useMemo(() => {
    return round2(
      SINGLE_PAYMENT_METHODS.reduce(
        (sum, m) => sum + Math.max(0, round2(Number(mixedSplits[m]) || 0)),
        0,
      ),
    );
  }, [mixedSplits]);

  const mixedRemaining = round2(
    cartFifoSimulation.totalAmount - mixedAllocatedTotal,
  );

  const handleConfirmTotalSale = () => {
    setFeedback(null);

    if (cart.length === 0) {
      setFeedback({
        type: 'error',
        text: 'Agrega al menos un producto al carrito antes de registrar la venta.',
      });
      return;
    }

    if (!customerName.trim()) {
      setFeedback({
        type: 'error',
        text: 'El campo "Nombre del Cliente" es obligatorio para emitir la venta.',
      });
      return;
    }

    const paymentSplitsPayload: PaymentSplit[] | undefined =
      paymentMethod === 'Pago Mixto'
        ? SINGLE_PAYMENT_METHODS.map((m) => ({
            method: m,
            amountUsd: Math.max(0, round2(Number(mixedSplits[m]) || 0)),
          })).filter((s) => s.amountUsd > 0)
        : undefined;

    const summaryCount = cartFifoSimulation.totalUnits;
    const summaryTotal = cartFifoSimulation.totalAmount;
    const cleanCustomer = customerName.trim();

    const res = onRegisterMultiSale({
      items: cart.map((line) => ({
        skuId: line.skuId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        baseUnitPrice: line.baseUnitPrice,
        discountLabel: line.discountLabel,
      })),
      customerName: cleanCustomer,
      seller,
      paymentStatus,
      paymentMethod,
      paymentSplits: paymentSplitsPayload,
      debtorName: cleanCustomer,
    });

    if (!res.ok) {
      setFeedback({
        type: 'error',
        text: res.error ?? 'No se pudo registrar la venta total.',
      });
      return;
    }

    setCart([]);
    setQuantity('1');
    setCustomerName('');
    setMixedSplits(INITIAL_MIXED_SPLITS);
    setFeedback({
      type: 'success',
      text: `Venta registrada para ${cleanCustomer} (${summaryCount} ${
        summaryCount === 1 ? 'franela' : 'franelas'
      } · ${formatUSD(summaryTotal)} vía ${paymentMethod}) con descuento FIFO y matriz de 4 capas.`,
    });
  };

  const linePreviewSubtotal = round2(
    Math.max(0, Math.floor(Number(quantity) || 0)) *
      Math.max(0, Number(unitPrice) || 0),
  );

  const bcvTotalEquivalent = round2(
    cartFifoSimulation.totalAmount * state.exchangeRates.bcv,
  );

  const pagoMovilMixedUsd = Math.max(
    0,
    round2(Number(mixedSplits['Pago Móvil / Bs']) || 0),
  );

  const isDiscountOpen =
    pricingMode === 'discount_pct' || pricingMode === 'discount_usd';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Registro de Ventas Multi-Ítem (FIFO)
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Precio automático en USDT al seleccionar producto, ajuste rápido Al Mayor o Rebaja, cliente obligatorio y pagos simples o mixtos.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <section
            aria-labelledby="add-item-heading"
            className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6"
          >
            <div className="flex items-center justify-between gap-4">
              <h2
                id="add-item-heading"
                className="font-display text-lg font-semibold text-white"
              >
                1. Agregar Productos al Carrito
              </h2>
              <span className="font-mono-num text-xs text-slate-400">
                {availableSkus.length} SKUs disponibles
              </span>
            </div>

            {availableSkus.length === 0 ? (
              <div className="mt-4 rounded-lg border border-slate-800 bg-[#080E1C] p-5 text-sm text-slate-300">
                {cart.length > 0
                  ? 'Ya agregaste todo el stock disponible al carrito. Confirma la venta o elimina algún ítem.'
                  : 'No hay inventario disponible en este momento. Registra un lote en Compras.'}
              </div>
            ) : (
              <form onSubmit={handleAddToCart} className="mt-4 space-y-4">
                <div>
                  <label
                    htmlFor="sale-sku"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Producto disponible (Modelo · Versión · Talla)
                  </label>
                  <select
                    id="sale-sku"
                    required
                    value={effectiveSkuId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedSkuId(nextId);
                      const found = availableSkus.find((s) => s.id === nextId);
                      if (found) {
                        setUnitPrice(found.salePrice.toFixed(2));
                        setPricingMode('normal');
                        setDiscountAmountInput('');
                      }
                      setFeedback(null);
                    }}
                    className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {availableSkus.map((item) => {
                      const avail =
                        item.stock - (qtyInCartBySku.get(item.id) ?? 0);
                      const fifoCost = getNextFifoUnitCost(item);
                      return (
                        <option key={item.id} value={item.id}>
                          {item.model} — {item.version} · Talla {item.size} (
                          {avail} disp. · PVP {formatUSD(item.salePrice)} · FIFO{' '}
                          {formatUSD(fifoCost)})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                  <div className="sm:col-span-3">
                    <label
                      htmlFor="sale-qty"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Cantidad (Máx. {remainingForActiveSku})
                    </label>
                    <input
                      id="sale-qty"
                      type="number"
                      min="1"
                      max={remainingForActiveSku}
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

                  <div className="sm:col-span-9">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="sale-unit-price"
                        className="block text-xs font-medium text-slate-300"
                      >
                        Precio unitario (USDT)
                      </label>
                      {activeSku && (
                        <span className="font-mono-num text-[11px] text-slate-400">
                          PVP base: {formatUSD(activeSku.salePrice)}
                          {currentDiscountLabel ? ` · ${currentDiscountLabel}` : ''}
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:flex-nowrap">
                      <input
                        id="sale-unit-price"
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={unitPrice}
                        onChange={(e) => {
                          setUnitPrice(e.target.value);
                          setPricingMode('manual');
                          setFeedback(null);
                        }}
                        className="font-mono-num min-h-[44px] w-full sm:w-32 rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />

                      <button
                        type="button"
                        data-testid="btn-wholesale"
                        onClick={handleToggleWholesale}
                        aria-pressed={pricingMode === 'wholesale'}
                        className={`inline-flex min-h-[44px] flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                          pricingMode === 'wholesale'
                            ? 'border-blue-500 bg-blue-600/25 text-white'
                            : 'border-slate-700 bg-[#080E1C] text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Al Mayor (-{WHOLESALE_DISCOUNT_PCT}%)
                      </button>

                      <button
                        type="button"
                        data-testid="btn-discount"
                        onClick={handleToggleCustomDiscount}
                        aria-pressed={isDiscountOpen}
                        className={`inline-flex min-h-[44px] flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                          isDiscountOpen
                            ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                            : 'border-slate-700 bg-[#080E1C] text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <Percent className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Descuento / Rebaja
                      </button>
                    </div>
                  </div>
                </div>

                {isDiscountOpen && (
                  <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-[#080E1C] p-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-300">
                        Tipo de rebaja:
                      </span>
                      <div className="inline-flex rounded-lg border border-slate-700 bg-[#070D19] p-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setDiscountType('usd');
                            handleDiscountAmountChange(discountAmountInput, 'usd');
                          }}
                          className={`min-h-[34px] rounded-md px-2.5 text-xs font-semibold transition-colors ${
                            discountType === 'usd'
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Monto (USDT)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDiscountType('pct');
                            handleDiscountAmountChange(discountAmountInput, 'pct');
                          }}
                          className={`min-h-[34px] rounded-md px-2.5 text-xs font-semibold transition-colors ${
                            discountType === 'pct'
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Porcentaje (%)
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <label
                        htmlFor="sale-discount-value"
                        className="text-xs text-slate-400 whitespace-nowrap"
                      >
                        {discountType === 'pct' ? 'Descuento (%):' : 'Rebaja ($):'}
                      </label>
                      <input
                        id="sale-discount-value"
                        type="number"
                        min="0"
                        max={discountType === 'pct' ? '99' : undefined}
                        step="0.01"
                        value={discountAmountInput}
                        onChange={(e) => handleDiscountAmountChange(e.target.value)}
                        className="font-mono-num min-h-[40px] w-28 rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-right text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-400">
                    Subtotal del ítem:{' '}
                    <strong className="font-mono-num text-sm text-white">
                      {formatUSD(linePreviewSubtotal)}
                    </strong>
                    {activeSku && (
                      <span className="ml-2 font-mono-num text-slate-400">
                        · {formatVES(linePreviewSubtotal * state.exchangeRates.bcv)} BCV
                      </span>
                    )}
                  </p>

                  <button
                    type="submit"
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-blue-500/40 bg-blue-600/20 px-4 py-2 text-sm font-semibold text-blue-200 transition-colors hover:bg-blue-600/30 hover:text-white active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 whitespace-nowrap shrink-0"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Agregar al Carrito
                  </button>
                </div>
              </form>
            )}
          </section>

          <section
            aria-labelledby="cart-items-heading"
            className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6"
          >
            <div className="flex items-center justify-between gap-4">
              <h2
                id="cart-items-heading"
                className="font-display text-lg font-semibold text-white"
              >
                2. Ítems de la Venta Actual
              </h2>
              <span
                data-testid="cart-count"
                className="font-mono-num text-xs text-slate-300"
              >
                {cart.length} {cart.length === 1 ? 'línea' : 'líneas'} ·{' '}
                {cartFifoSimulation.totalUnits}{' '}
                {cartFifoSimulation.totalUnits === 1 ? 'unidad' : 'unidades'}
              </span>
            </div>

            {cart.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-700/80 bg-[#080E1C] p-6 text-center">
                <p className="text-sm font-medium text-slate-300">
                  El carrito está vacío
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Selecciona una camiseta arriba y presiona &ldquo;Agregar al Carrito&rdquo; para iniciar la venta.
                </p>
              </div>
            ) : (
              <div className="mt-4">
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-800 text-xs font-medium text-slate-400">
                      <tr>
                        <th scope="col" className="pb-2.5">
                          Modelo / Versión / Talla
                        </th>
                        <th scope="col" className="pb-2.5 text-right">
                          Cant.
                        </th>
                        <th scope="col" className="pb-2.5 text-right">
                          Unitario
                        </th>
                        <th scope="col" className="pb-2.5 text-right">
                          COGS FIFO
                        </th>
                        <th scope="col" className="pb-2.5 text-right">
                          Subtotal
                        </th>
                        <th scope="col" className="pb-2.5 text-right">
                          Acción
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {cart.map((line) => {
                        const fifoLineCost =
                          cartFifoSimulation.lineCogsMap.get(line.lineId) ?? 0;
                        return (
                          <tr key={line.lineId}>
                            <td className="py-3 pr-3">
                              <p className="font-medium text-white">
                                {line.modelLabel}
                              </p>
                              <p className="text-xs text-slate-400">
                                {line.version} · Talla {line.size}
                                {line.discountLabel ? (
                                  <span className="text-emerald-400">
                                    {' '}
                                    · {line.discountLabel}
                                  </span>
                                ) : null}
                              </p>
                            </td>
                            <td className="py-3 text-right font-mono-num font-semibold text-white">
                              {line.quantity}
                            </td>
                            <td className="py-3 text-right font-mono-num text-slate-300">
                              {formatUSD(line.unitPrice)}
                            </td>
                            <td className="py-3 text-right font-mono-num text-blue-300">
                              {formatUSD(fifoLineCost)}
                            </td>
                            <td className="py-3 text-right font-mono-num font-bold text-white">
                              {formatUSD(line.subtotal)}
                            </td>
                            <td className="py-3 pl-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveCartLine(line.lineId)}
                                aria-label={`Eliminar ${line.modelLabel} ${line.version} talla ${line.size}`}
                                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
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

                <div className="divide-y divide-slate-800/80 sm:hidden">
                  {cart.map((line) => (
                    <div
                      key={line.lineId}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {line.quantity}x {line.modelLabel}
                        </p>
                        <p className="text-xs text-slate-400">
                          {line.version} · Talla {line.size} ·{' '}
                          <span className="font-mono-num">
                            {formatUSD(line.unitPrice)} c/u
                          </span>
                          {line.discountLabel ? ` · ${line.discountLabel}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="font-mono-num text-sm font-bold text-white">
                          {formatUSD(line.subtotal)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCartLine(line.lineId)}
                          aria-label={`Eliminar ${line.modelLabel} ${line.version} talla ${line.size}`}
                          className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3.5">
                  <span className="text-xs font-medium text-slate-400">
                    Total acumulado del carrito ({cartFifoSimulation.totalUnits} uds)
                  </span>
                  <span
                    data-testid="cart-total-amount"
                    className="font-mono-num text-xl font-bold text-white"
                  >
                    {formatUSD(cartFifoSimulation.totalAmount)}
                  </span>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6 lg:col-span-5">
          <section
            aria-labelledby="global-sale-heading"
            className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6"
          >
            <h2
              id="global-sale-heading"
              className="font-display text-lg font-semibold text-white"
            >
              3. Cierre Global y Pago
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Aplica a todos los ítems acumulados en el carrito.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="sale-customer-name"
                  className="block text-xs font-medium text-slate-300"
                >
                  Nombre del Cliente *
                </label>
                <input
                  id="sale-customer-name"
                  type="text"
                  required
                  placeholder="Ej. Carlos Mendoza"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setFeedback(null);
                  }}
                  className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="sale-seller"
                  className="block text-xs font-medium text-slate-300"
                >
                  Vendedor asignado (4% comisión)
                </label>
                <select
                  id="sale-seller"
                  value={seller}
                  onChange={(e) => {
                    setSeller(e.target.value as SellerName);
                    setFeedback(null);
                  }}
                  className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {SELLERS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="sale-payment-method"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Método de Pago
                  </label>
                  <select
                    id="sale-payment-method"
                    value={paymentMethod}
                    onChange={(e) => {
                      setPaymentMethod(e.target.value as PaymentMethod);
                      setFeedback(null);
                    }}
                    className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {ALL_PAYMENT_METHODS.map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="sale-status"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Estatus de cobro
                  </label>
                  <select
                    id="sale-status"
                    value={paymentStatus}
                    onChange={(e) => {
                      setPaymentStatus(e.target.value as PaymentStatus);
                      setFeedback(null);
                    }}
                    className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="Cobrado">Cobrado / Liquidado</option>
                    <option value="Pendiente">Pendiente / Crédito</option>
                  </select>
                </div>
              </div>

              {paymentStatus === 'Pendiente' && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200">
                  El saldo pendiente se registrará en Cuentas por Cobrar a nombre de{' '}
                  <strong>{customerName.trim() || 'este cliente'}</strong>.
                </p>
              )}

              {paymentMethod === 'Pago Móvil / Bs' && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3.5 py-2.5 text-xs">
                  <div className="flex items-center justify-between text-blue-200">
                    <span>
                      Conversión automática Tasa BCV ({state.exchangeRates.bcv.toFixed(2)} Bs/$):
                    </span>
                    <strong
                      data-testid="sale-bcv-conversion"
                      className="font-mono-num text-sm text-white"
                    >
                      {formatVES(bcvTotalEquivalent)}
                    </strong>
                  </div>
                </div>
              )}

              {paymentMethod === 'Pago Mixto' && (
                <div className="space-y-3 rounded-lg border border-slate-700 bg-[#080E1C] p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">
                      Desglose de Pago Mixto (USDT)
                    </span>
                    <span
                      className={`font-mono-num font-semibold ${
                        Math.abs(mixedRemaining) <= 0.01 &&
                        cartFifoSimulation.totalAmount > 0
                          ? 'text-emerald-400'
                          : 'text-amber-300'
                      }`}
                    >
                      Restante: {formatUSD(mixedRemaining)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {SINGLE_PAYMENT_METHODS.map((method) => (
                      <div key={method}>
                        <label
                          htmlFor={`split-${method}`}
                          className="block text-[11px] font-medium text-slate-300"
                        >
                          {method}
                        </label>
                        <input
                          id={`split-${method}`}
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={mixedSplits[method]}
                          onChange={(e) => {
                            setMixedSplits((prev) => ({
                              ...prev,
                              [method]: e.target.value,
                            }));
                            setFeedback(null);
                          }}
                          className="font-mono-num mt-1 w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] px-2.5 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    ))}
                  </div>

                  {pagoMovilMixedUsd > 0 && (
                    <div className="flex items-center justify-between border-t border-slate-800 pt-2 text-xs text-blue-200">
                      <span>Equivalente Pago Móvil BCV:</span>
                      <strong
                        data-testid="mixed-bcv-conversion"
                        className="font-mono-num text-white"
                      >
                        {formatVES(pagoMovilMixedUsd * state.exchangeRates.bcv)}
                      </strong>
                    </div>
                  )}
                </div>
              )}

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

              <button
                type="button"
                onClick={handleConfirmTotalSale}
                disabled={cart.length === 0}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                Registrar Venta Total
              </button>
            </div>
          </section>

          <section
            aria-labelledby="matrix-preview-heading"
            className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6"
          >
            <h2
              id="matrix-preview-heading"
              className="font-display text-lg font-semibold text-white"
            >
              Simulación Matriz de 4 Capas (FIFO)
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              COGS calculado estrictamente por lotes FIFO consumidos.
            </p>

            {!liveBreakdown ? (
              <p className="mt-5 text-sm text-slate-400">
                Agrega ítems al carrito para previsualizar el desglose de costos, comisión y dividendos.
              </p>
            ) : (
              <div className="mt-5 space-y-3 text-sm">
                {cartFifoSimulation.totalAmount <
                  cartFifoSimulation.totalBaseCost && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    Aviso: El total del carrito es menor al costo base FIFO ({formatUSD(cartFifoSimulation.totalBaseCost)}). No se generará utilidad neta.
                  </p>
                )}

                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <span className="text-slate-300">
                    1. Recuperación Costo Base FIFO (100%)
                  </span>
                  <span className="font-mono-num font-semibold text-white">
                    {formatUSD(liveBreakdown.layer1CostRecovery)}
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <span className="text-slate-300">
                    2. Comisión Venta Directa (
                    {seller === 'Sin Vendedor' ? '0%' : '4%'})
                  </span>
                  <span className="font-mono-num font-semibold text-white">
                    {formatUSD(liveBreakdown.layer2Commission)}
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <span className="text-slate-400">Utilidad Neta Base</span>
                  <span className="font-mono-num font-semibold text-blue-300">
                    {formatUSD(liveBreakdown.netProfit)}
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <span className="text-slate-300">
                    3. Fondo Operativo y Publicidad (10%)
                  </span>
                  <span className="font-mono-num font-semibold text-white">
                    {formatUSD(liveBreakdown.layer3OperatingFund)}
                  </span>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">
                      4a. Reinversión Crecimiento (80% de 90%)
                    </span>
                    <span className="font-mono-num font-semibold text-emerald-400">
                      {formatUSD(liveBreakdown.layer4GrowthReinvestment)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">
                      4b. Reparto Dividendos (20% de 90%)
                    </span>
                    <span className="font-mono-num font-semibold text-white">
                      {formatUSD(liveBreakdown.layer4TotalDividends)}
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-[#080E1C] p-3 text-xs">
                    <div>
                      <span className="block text-slate-400">Jesús (53.65%)</span>
                      <span className="font-mono-num mt-0.5 block font-semibold text-white">
                        {formatUSD(liveBreakdown.partnerSplits.Jesús)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-slate-400">Josué (40.43%)</span>
                      <span className="font-mono-num mt-0.5 block font-semibold text-white">
                        {formatUSD(liveBreakdown.partnerSplits.Josué)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-slate-400">Gabriel (5.92%)</span>
                      <span className="font-mono-num mt-0.5 block font-semibold text-white">
                        {formatUSD(liveBreakdown.partnerSplits.Gabriel)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <section
        aria-labelledby="recent-sales-heading"
        className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6 overflow-hidden"
      >
        <div className="flex items-center justify-between gap-4">
          <h2
            id="recent-sales-heading"
            className="font-display text-lg font-semibold text-white"
          >
            Historial de Ventas Recientes
          </h2>
          <span className="font-mono-num text-xs text-slate-400">
            {state.sales.length} {state.sales.length === 1 ? 'venta' : 'ventas'}
          </span>
        </div>

        {state.sales.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">
            Aún no se han registrado ventas en esta sesión. Las ventas confirmadas aparecerán aquí con su cliente, detalle de prendas, método de pago y estatus.
          </p>
        ) : (
          <>
            <div className="mt-4 hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-800 bg-[#080E1C] text-xs font-medium text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Vendedor</th>
                    <th className="px-4 py-3">Detalle de Prendas</th>
                    <th className="px-4 py-3">Método de Pago</th>
                    <th className="px-4 py-3 text-right">Total (USDT)</th>
                    <th className="px-4 py-3 text-right">Estatus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {state.sales.map((sale) => {
                    const lineItems =
                      sale.items && sale.items.length > 0
                        ? sale.items
                        : [
                            {
                              skuId: sale.skuId,
                              modelLabel: sale.modelLabel,
                              team: sale.team,
                              version: sale.version,
                              size: sale.size,
                              quantity: sale.quantity,
                              unitCogs: sale.unitCogs,
                              totalLineCogs: round2(
                                sale.unitCogs * sale.quantity,
                              ),
                              unitPrice: round2(
                                sale.finalPrice / Math.max(1, sale.quantity),
                              ),
                              subtotal: sale.finalPrice,
                            },
                          ];

                    return (
                      <tr key={sale.id} className="align-top hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-mono-num text-xs text-slate-300 whitespace-nowrap">
                          {new Date(sale.createdAt).toLocaleString('es-VE', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-white whitespace-nowrap">
                          {sale.customerName || sale.debtorName || 'Cliente Mostrador'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-200 whitespace-nowrap">
                          {sale.seller}
                        </td>
                        <td className="px-4 py-3">
                          <ul className="space-y-0.5 text-xs text-slate-300">
                            {lineItems.map((item, idx) => (
                              <li key={`${sale.id}-${item.skuId}-${idx}`}>
                                <strong className="text-white">
                                  {item.quantity}x
                                </strong>{' '}
                                {item.modelLabel} ({item.version} · {item.size}) —{' '}
                                <span className="font-mono-num">
                                  {formatUSD(item.subtotal)}
                                </span>
                                {item.discountLabel ? (
                                  <span className="text-emerald-400">
                                    {' '}
                                    · {item.discountLabel}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-200">
                          <span className="font-medium">
                            {sale.paymentMethod ?? 'Efectivo ($)'}
                          </span>
                          {sale.paymentMethod === 'Pago Mixto' &&
                            sale.paymentSplits && (
                              <ul className="mt-1 space-y-0.5 text-[11px] text-slate-400">
                                {sale.paymentSplits.map((sp) => (
                                  <li key={sp.method} className="font-mono-num">
                                    {sp.method}: {formatUSD(sp.amountUsd)}
                                    {sp.bcvEquivalent
                                      ? ` (${formatVES(sp.bcvEquivalent)})`
                                      : ''}
                                  </li>
                                ))}
                              </ul>
                            )}
                          {sale.paymentMethod !== 'Pago Mixto' &&
                            sale.bcvEquivalent !== undefined && (
                              <span className="font-mono-num block text-blue-300">
                                {formatVES(sale.bcvEquivalent)}
                              </span>
                            )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num font-bold text-white whitespace-nowrap">
                          {formatUSD(sale.finalPrice)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold whitespace-nowrap">
                          <span
                            className={
                              sale.paymentStatus === 'Cobrado'
                                ? 'text-emerald-400'
                                : 'text-amber-400'
                            }
                          >
                            {sale.paymentStatus === 'Cobrado'
                              ? 'Cobrado'
                              : `Pendiente (${sale.debtorName})`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 divide-y divide-slate-800/80 md:hidden">
              {state.sales.map((sale) => (
                <div key={sale.id} className="py-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">
                      {sale.customerName || 'Cliente'} · {sale.seller}
                    </span>
                    <span className="font-mono-num text-sm font-bold text-white">
                      {formatUSD(sale.finalPrice)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    {(sale.items ?? [])
                      .map(
                        (i) =>
                          `${i.quantity}x ${i.modelLabel} (${i.version} ${i.size})`,
                      )
                      .join(', ') || sale.modelLabel}
                  </p>
                  <p className="text-xs text-slate-400">
                    {sale.paymentMethod ?? 'Efectivo ($)'}
                    {sale.bcvEquivalent !== undefined
                      ? ` (${formatVES(sale.bcvEquivalent)})`
                      : ''}{' '}
                    ·{' '}
                    <span
                      className={
                        sale.paymentStatus === 'Cobrado'
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }
                    >
                      {sale.paymentStatus === 'Cobrado'
                        ? 'Cobrado'
                        : `Pendiente (${sale.debtorName})`}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
