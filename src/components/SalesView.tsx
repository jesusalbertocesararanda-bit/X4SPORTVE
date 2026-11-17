import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Download,
  ExternalLink,
  FileImage,
  History,
  Percent,
  Plus,
  Search,
  ShoppingBag,
  Star,
  Tag,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  AppState,
  JerseySize,
  JerseyVersion,
  PaymentMethod,
  PaymentSplit,
  PaymentStatus,
  SaleRecord,
  SellerName,
  SinglePaymentMethod,
} from '../types/erp';
import type {
  PricingAdjustMode,
  RegisterMultiSaleInput,
  UpsertCustomerInput,
} from '../utils/finance';
import {
  calculateDiscountedUnitPrice,
  calculateFourLayerMatrixConsolidated,
  formatUSD,
  formatVES,
  normalizeVersionDisplay,
  previewFifoConsumption,
  round2,
  WHOLESALE_DISCOUNT_PCT,
} from '../utils/finance';
import {
  buildCustomerDirectory,
  evaluateCustomerStatus,
  normalizeCustomerText,
  searchCustomerDirectory,
  type CustomerHistorySummary,
} from '../utils/customers';
import {
  buildSaleCalendarEvent,
  createGoogleCalendarEvent,
  shouldScheduleSaleCalendarEvent,
  type GoogleCalendarAuthState,
} from '../utils/googleCalendar';
import {
  downloadJpgDataUrl,
  renderSaleReceiptJpgDataUrl,
} from '../utils/receiptJpg';
import { GoogleCalendarBanner } from './GoogleCalendarBanner';

interface SalesViewProps {
  state: AppState;
  calendarAuth?: GoogleCalendarAuthState;
  onConnectGoogleCalendar?: () => Promise<boolean>;
  onDisconnectGoogleCalendar?: () => Promise<void>;
  onCalendarAuthExpired?: () => void;
  onAttachSaleCalendarMetadata?: (
    saleId: string,
    eventId: string,
    htmlLink?: string,
  ) => void;
  onRegisterMultiSale: (
    input: RegisterMultiSaleInput,
  ) => { ok: boolean; error?: string; createdSale?: SaleRecord };
  onSaveCustomerProfile?: (
    input: UpsertCustomerInput,
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

export function SalesView({
  state,
  calendarAuth,
  onConnectGoogleCalendar,
  onDisconnectGoogleCalendar,
  onCalendarAuthExpired,
  onAttachSaleCalendarMetadata,
  onRegisterMultiSale,
  onSaveCustomerProfile,
}: SalesViewProps) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [modelSearch, setModelSearch] = useState<string>('');
  const [selectedSkuId, setSelectedSkuId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [unitPrice, setUnitPrice] = useState<string>('30.00');
  const [pricingMode, setPricingMode] = useState<PricingAdjustMode>('normal');
  const [discountType, setDiscountType] = useState<'pct' | 'usd'>('usd');
  const [discountAmountInput, setDiscountAmountInput] = useState<string>('');

  // Optional flexible customer fields + dynamic autocomplete & profile state
  const [customerName, setCustomerName] = useState<string>('');
  const [customerCity, setCustomerCity] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerSocial, setCustomerSocial] = useState<string>('');
  const [customerIdDoc, setCustomerIdDoc] = useState<string>('');
  const [customerDropdownOpen, setCustomerDropdownOpen] =
    useState<boolean>(false);
  const [customerSavedNotice, setCustomerSavedNotice] = useState<string | null>(
    null,
  );
  const customerBoxRef = useRef<HTMLDivElement | null>(null);

  const [seller, setSeller] = useState<SellerName>('Jesús');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Cobrado');
  const [deliveryDate, setDeliveryDate] = useState<string>('');
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('Efectivo ($)');
  const [mixedSplits, setMixedSplits] =
    useState<Record<SinglePaymentMethod, string>>(INITIAL_MIXED_SPLITS);
  const [pendingCalendarSale, setPendingCalendarSale] =
    useState<SaleRecord | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
    calendarNotice?: string;
    calendarLink?: string;
    needsCalendarAuth?: boolean;
  } | null>(null);

  // Invoice search & auto-generated JPG receipt state
  const [invoiceSearch, setInvoiceSearch] = useState<string>('');
  const [receiptPreview, setReceiptPreview] = useState<{
    sale: SaleRecord;
    dataUrl: string;
  } | null>(null);
  const [generatingReceiptId, setGeneratingReceiptId] = useState<string | null>(
    null,
  );

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
            a.model.localeCompare(b.model) ||
            a.version.localeCompare(b.version) ||
            a.size.localeCompare(b.size),
        ),
    [qtyInCartBySku, state.inventory],
  );

  const filteredSelectorSkus = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    if (!q) return availableSkus;
    return availableSkus.filter((item) => {
      const ver = normalizeVersionDisplay(item.version).toLowerCase();
      return (
        item.model.toLowerCase().includes(q) ||
        ver.includes(q) ||
        item.size.toLowerCase().includes(q)
      );
    });
  }, [availableSkus, modelSearch]);

  const effectiveSkuId = availableSkus.some((s) => s.id === selectedSkuId)
    ? selectedSkuId
    : (filteredSelectorSkus[0]?.id ?? availableSkus[0]?.id ?? '');

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

  useEffect(() => {
    if (!customerDropdownOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        customerBoxRef.current &&
        !customerBoxRef.current.contains(e.target as Node)
      ) {
        setCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [customerDropdownOpen]);

  const customerDirectory = useMemo(
    () => buildCustomerDirectory(state.sales, state.customers ?? []),
    [state.customers, state.sales],
  );

  const customerSuggestions = useMemo(() => {
    const query = customerName.trim() || customerPhone.trim();
    return searchCustomerDirectory(customerDirectory, query, 7);
  }, [customerDirectory, customerName, customerPhone]);

  const customerStatus = useMemo(
    () =>
      evaluateCustomerStatus(
        customerDirectory,
        customerName,
        customerPhone,
      ),
    [customerDirectory, customerName, customerPhone],
  );

  const handleSelectCustomerSuggestion = (customer: CustomerHistorySummary) => {
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone ?? '');
    setCustomerCity(customer.city ?? '');
    setCustomerSocial(customer.social ?? '');
    setCustomerIdDoc(customer.idDoc ?? '');
    setCustomerDropdownOpen(false);
    setCustomerSavedNotice(null);
    setFeedback(null);
  };

  const handleClearCustomerFields = () => {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerCity('');
    setCustomerSocial('');
    setCustomerIdDoc('');
    setCustomerSavedNotice(null);
    setCustomerDropdownOpen(false);
  };

  const handleSaveNewCustomerInline = () => {
    if (!onSaveCustomerProfile) return;
    const res = onSaveCustomerProfile({
      name: customerName,
      phone: customerPhone,
      city: customerCity,
      social: customerSocial,
      idDoc: customerIdDoc,
    });
    if (!res.ok) {
      setFeedback({
        type: 'error',
        text: res.error ?? 'No se pudo guardar la ficha del cliente.',
      });
      return;
    }
    setCustomerDropdownOpen(false);
    setCustomerSavedNotice(
      `Ficha de ${customerName.trim()} guardada en el directorio sin salir de la venta.`,
    );
    setFeedback(null);
  };

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

  const handleSelectModelCard = (skuId: string) => {
    setSelectedSkuId(skuId);
    const found = availableSkus.find((s) => s.id === skuId);
    if (found) {
      setUnitPrice(found.salePrice.toFixed(2));
      setPricingMode('normal');
      setDiscountAmountInput('');
    }
    setFeedback(null);
  };

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
    const defaultVal =
      discountAmountInput || (discountType === 'pct' ? '10' : '2');
    setPricingMode(nextMode);
    setDiscountAmountInput(defaultVal);
    const res = calculateDiscountedUnitPrice(
      activeSku.salePrice,
      nextMode,
      Number(defaultVal) || 0,
    );
    setUnitPrice(res.unitPrice.toFixed(2));
  };

  const handleDiscountAmountChange = (
    rawVal: string,
    nextType = discountType,
  ) => {
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

  const openOrDownloadSaleReceipt = async (
    sale: SaleRecord,
    autoDownload: boolean,
  ) => {
    setGeneratingReceiptId(sale.id);
    try {
      const dataUrl = await renderSaleReceiptJpgDataUrl(
        sale,
        state.exchangeRates.bcv,
      );
      setReceiptPreview({ sale, dataUrl });
      if (autoDownload) {
        const filename = `${sale.invoiceNumber || sale.id}.jpg`;
        downloadJpgDataUrl(dataUrl, filename);
      }
    } catch {
      // Fail gracefully without blocking sale completion
    } finally {
      setGeneratingReceiptId(null);
    }
  };

  const scheduleSaleInCalendar = async (sale: SaleRecord) => {
    const calRes = await createGoogleCalendarEvent(buildSaleCalendarEvent(sale));
    if (calRes.ok) {
      setPendingCalendarSale(null);
      if (calRes.eventId) {
        onAttachSaleCalendarMetadata?.(
          sale.id,
          calRes.eventId,
          calRes.htmlLink,
        );
      }
      setFeedback((prev) =>
        prev
          ? {
              ...prev,
              calendarNotice: `Recordatorio agendado en Google Calendar para ${sale.customerName}.`,
              calendarLink: calRes.htmlLink,
              needsCalendarAuth: false,
            }
          : {
              type: 'success',
              text: `Recordatorio de ${sale.invoiceNumber || 'venta'} agendado en Google Calendar.`,
              calendarNotice: `Recordatorio agendado para ${sale.customerName}.`,
              calendarLink: calRes.htmlLink,
              needsCalendarAuth: false,
            },
      );
    } else if (calRes.needsAuth) {
      setPendingCalendarSale(sale);
      onCalendarAuthExpired?.();
      setFeedback((prev) =>
        prev
          ? {
              ...prev,
              calendarNotice:
                'Conecta Google Calendar para agendar automáticamente este recordatorio.',
              needsCalendarAuth: true,
            }
          : null,
      );
    } else {
      setFeedback((prev) =>
        prev
          ? {
              ...prev,
              calendarNotice: `No se pudo agendar en Google Calendar: ${calRes.error ?? 'error desconocido'}`,
              needsCalendarAuth: false,
            }
          : null,
      );
    }
  };

  const handleConfirmTotalSale = () => {
    setFeedback(null);
    setPendingCalendarSale(null);

    if (cart.length === 0) {
      setFeedback({
        type: 'error',
        text: 'Agrega al menos un producto al carrito antes de registrar la venta.',
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
    const cleanCustomer = customerName.trim() || 'Cliente Mostrador';
    const cleanCity = customerCity.trim() || undefined;
    const cleanPhone = customerPhone.trim() || undefined;
    const cleanSocial = customerSocial.trim() || undefined;
    const cleanIdDoc = customerIdDoc.trim() || undefined;
    const cleanDeliveryDate = deliveryDate.trim() || undefined;

    const res = onRegisterMultiSale({
      items: cart.map((line) => ({
        skuId: line.skuId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        baseUnitPrice: line.baseUnitPrice,
        discountLabel: line.discountLabel,
      })),
      customerName: cleanCustomer,
      customerCity: cleanCity,
      customerPhone: cleanPhone,
      customerSocial: cleanSocial,
      customerIdDoc: cleanIdDoc,
      seller,
      paymentStatus,
      paymentMethod,
      paymentSplits: paymentSplitsPayload,
      debtorName: cleanCustomer,
      deliveryDate: cleanDeliveryDate,
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
    setCustomerCity('');
    setCustomerPhone('');
    setCustomerSocial('');
    setCustomerIdDoc('');
    setDeliveryDate('');
    setCustomerSavedNotice(null);
    setCustomerDropdownOpen(false);
    setMixedSplits(INITIAL_MIXED_SPLITS);

    const invoiceTag = res.createdSale?.invoiceNumber
      ? `Factura ${res.createdSale.invoiceNumber} · `
      : '';
    const willSchedule =
      res.createdSale && shouldScheduleSaleCalendarEvent(res.createdSale);

    setFeedback({
      type: 'success',
      text: `${invoiceTag}Venta registrada para ${cleanCustomer} (${summaryCount} ${
        summaryCount === 1 ? 'franela' : 'franelas'
      } · ${formatUSD(summaryTotal)} vía ${paymentMethod}). Comprobante JPG generado.`,
      ...(willSchedule
        ? { calendarNotice: 'Agendando recordatorio en Google Calendar...' }
        : {}),
    });

    if (res.createdSale) {
      void openOrDownloadSaleReceipt(res.createdSale, true);
      if (shouldScheduleSaleCalendarEvent(res.createdSale)) {
        void scheduleSaleInCalendar(res.createdSale);
      }
    }
  };

  const handleRetryPendingCalendarSale = async () => {
    if (!pendingCalendarSale || !onConnectGoogleCalendar) return;
    const connected = await onConnectGoogleCalendar();
    if (connected) {
      await scheduleSaleInCalendar(pendingCalendarSale);
    }
  };

  const filteredSalesHistory = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    if (!q) return state.sales;
    return state.sales.filter((sale) => {
      const invoice = (sale.invoiceNumber ?? '').toLowerCase();
      const customer = (sale.customerName ?? '').toLowerCase();
      const phone = (sale.customerPhone ?? '').toLowerCase();
      const city = (sale.customerCity ?? '').toLowerCase();
      const models = (sale.items ?? [])
        .map((i) => i.modelLabel.toLowerCase())
        .join(' ');
      return (
        invoice.includes(q) ||
        customer.includes(q) ||
        phone.includes(q) ||
        city.includes(q) ||
        sale.modelLabel.toLowerCase().includes(q) ||
        models.includes(q)
      );
    });
  }, [invoiceSearch, state.sales]);

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
          Ventas y Facturación Digital (FIFO)
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Selecciona modelos en tarjetas limpias, aplica descuentos o Pago Mixto, emite facturas consecutivas JPG y consulta el historial.
        </p>
      </div>

      {calendarAuth && onConnectGoogleCalendar && onDisconnectGoogleCalendar && (
        <GoogleCalendarBanner
          variant="compact"
          authState={calendarAuth}
          onConnect={onConnectGoogleCalendar}
          onDisconnect={onDisconnectGoogleCalendar}
          contextText="Las ventas pendientes o con fecha de entrega se agendan como recordatorio automático con cliente y modelo."
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <section
            aria-labelledby="add-item-heading"
            className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                id="add-item-heading"
                className="font-display text-lg font-semibold text-white"
              >
                1. Seleccionar Modelo Disponible
              </h2>
              <span className="font-mono-num text-xs text-slate-400">
                {availableSkus.length} SKUs con stock
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
                  <label htmlFor="sale-model-search" className="sr-only">
                    Buscar modelo disponible
                  </label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="sale-model-search"
                      data-testid="sale-model-search"
                      type="search"
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      placeholder="Filtrar tarjetas por modelo, versión o talla..."
                      className="w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] pl-9 pr-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Tarjetas visuales limpias: únicamente Nombre del modelo, Cantidad disponible y Precio */}
                {filteredSelectorSkus.length === 0 ? (
                  <p className="rounded-lg border border-slate-800 bg-[#080E1C] p-4 text-xs text-slate-400">
                    Ningún modelo disponible coincide con &ldquo;{modelSearch}&rdquo;.
                  </p>
                ) : (
                  <div
                    role="listbox"
                    aria-label="Tarjetas de modelos disponibles"
                    className="grid max-h-[290px] grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2"
                  >
                    {filteredSelectorSkus.map((item) => {
                      const avail =
                        item.stock - (qtyInCartBySku.get(item.id) ?? 0);
                      const isSelected = item.id === effectiveSkuId;
                      const verLabel = normalizeVersionDisplay(item.version);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          data-testid={`model-card-${item.id}`}
                          onClick={() => handleSelectModelCard(item.id)}
                          className={`flex flex-col justify-between rounded-lg border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                            isSelected
                              ? 'border-blue-500 bg-blue-600/15 text-white'
                              : 'border-slate-800 bg-[#080E1C] text-slate-200 hover:border-slate-600 hover:bg-slate-800/40'
                          }`}
                        >
                          <p className="text-sm font-semibold leading-snug text-white">
                            {item.model} ({verLabel} · {item.size})
                          </p>
                          <div className="mt-2.5 flex items-baseline justify-between gap-2">
                            <span className="font-mono-num text-xs text-slate-400">
                              {avail} disp.
                            </span>
                            <span className="font-mono-num text-sm font-bold text-blue-300">
                              {formatUSD(item.salePrice)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-12">
                  <div className="sm:col-span-3">
                    <label
                      htmlFor="sale-qty"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Cantidad * (Máx. {remainingForActiveSku})
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
                        Monto unitario (USDT) *
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
                        · {formatVES(linePreviewSubtotal * state.exchangeRates.bcv)}{' '}
                        BCV
                      </span>
                    )}
                  </p>

                  <button
                    type="submit"
                    data-testid="btn-add-to-cart"
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
                  Elige una tarjeta de modelo arriba y presiona &ldquo;Agregar al Carrito&rdquo; para iniciar la factura.
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
                                {normalizeVersionDisplay(line.version)} · Talla{' '}
                                {line.size}
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
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
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
                          {normalizeVersionDisplay(line.version)} · Talla{' '}
                          {line.size} ·{' '}
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
                    Total acumulado del carrito ({cartFifoSimulation.totalUnits}{' '}
                    uds)
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
              3. Cierre Global y Facturación
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Obligatorio: modelos, cantidad, monto y condición. Cliente, ciudad y teléfono son opcionales.
            </p>

            <div className="mt-4 space-y-4">
              {/* Buscador/Autocompletado de Clientes + Indicador Dinámico Nuevo/Frecuente */}
              <div
                ref={customerBoxRef}
                className="space-y-3 rounded-xl border border-slate-800 bg-[#080E1C] p-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="sale-customer-name"
                    className="text-xs font-semibold text-slate-200"
                  >
                    Cliente (búsqueda por nombre o teléfono)
                  </label>

                  {customerStatus.status === 'frequent' ? (
                    <span
                      data-testid="customer-status-badge"
                      data-status="frequent"
                      className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/45 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200"
                    >
                      <Star
                        className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0"
                        aria-hidden="true"
                      />
                      <span>
                        Cliente Frecuente ({customerStatus.purchaseCount}{' '}
                        {customerStatus.purchaseCount === 1
                          ? 'compra'
                          : 'compras'}
                        )
                      </span>
                    </span>
                  ) : customerStatus.status === 'new' &&
                    customerDropdownOpen &&
                    customerSuggestions.length > 0 &&
                    !(
                      customerSuggestions.length === 1 &&
                      normalizeCustomerText(customerSuggestions[0].name) ===
                        normalizeCustomerText(customerName)
                    ) ? (
                    <span
                      data-testid="customer-status-badge"
                      data-status="searching"
                      className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-blue-200"
                    >
                      <Search className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>
                        {customerSuggestions.length}{' '}
                        {customerSuggestions.length === 1
                          ? 'coincidencia'
                          : 'coincidencias'}
                      </span>
                    </span>
                  ) : customerStatus.status === 'new' ? (
                    <span
                      data-testid="customer-status-badge"
                      data-status="new"
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/45 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300"
                    >
                      <span
                        className="h-2 w-2 rounded-full bg-emerald-400 shrink-0"
                        aria-hidden="true"
                      />
                      <span>Cliente Nuevo</span>
                    </span>
                  ) : (
                    <span
                      data-testid="customer-status-badge"
                      data-status="anonymous"
                      className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/70 px-2.5 py-0.5 text-[11px] font-medium text-slate-400"
                    >
                      Cliente Mostrador
                    </span>
                  )}
                </div>

                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="sale-customer-name"
                    data-testid="sale-customer-name"
                    type="text"
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={
                      customerDropdownOpen && customerSuggestions.length > 0
                    }
                    aria-controls="customer-autocomplete-listbox"
                    placeholder="Escribe nombre o teléfono para buscar o registrar..."
                    value={customerName}
                    onFocus={() => setCustomerDropdownOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setCustomerDropdownOpen(false);
                      }
                    }}
                    onChange={(e) => {
                      setCustomerName(e.target.value);
                      setCustomerDropdownOpen(true);
                      setCustomerSavedNotice(null);
                      setFeedback(null);
                    }}
                    className="w-full min-h-[42px] rounded-lg border border-slate-700 bg-[#070D19] pl-9 pr-9 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {(customerName ||
                    customerPhone ||
                    customerCity ||
                    customerSocial ||
                    customerIdDoc) && (
                    <button
                      type="button"
                      onClick={handleClearCustomerFields}
                      aria-label="Limpiar datos del cliente"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}

                  {customerDropdownOpen && customerSuggestions.length > 0 && (
                    <ul
                      id="customer-autocomplete-listbox"
                      role="listbox"
                      aria-label="Clientes sugeridos del historial"
                      data-testid="customer-autocomplete-list"
                      className="absolute left-0 right-0 top-[46px] z-40 max-h-56 divide-y divide-slate-800/80 overflow-y-auto rounded-xl border border-slate-700 bg-[#0D1526] shadow-2xl"
                    >
                      {customerSuggestions.map((cust) => (
                        <li key={cust.key}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={false}
                            data-testid={`customer-option-${cust.key}`}
                            onClick={() => handleSelectCustomerSuggestion(cust)}
                            className="flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-blue-600/15"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-white">
                                {cust.name}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] text-slate-400">
                                {[cust.phone, cust.city, cust.social]
                                  .filter(Boolean)
                                  .join(' · ') || 'Sin datos de contacto'}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              {cust.purchaseCount > 0 ? (
                                <>
                                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                                    <Star
                                      className="h-2.5 w-2.5 fill-amber-400 text-amber-400"
                                      aria-hidden="true"
                                    />
                                    {cust.purchaseCount}{' '}
                                    {cust.purchaseCount === 1
                                      ? 'compra'
                                      : 'compras'}
                                  </span>
                                  <span className="font-mono-num mt-0.5 block text-[10px] text-slate-300">
                                    {formatUSD(cust.totalSpentUsd)}
                                  </span>
                                </>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                                  Ficha nueva
                                </span>
                              )}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Tarjeta contextual para Cliente Frecuente */}
                {customerStatus.status === 'frequent' &&
                  customerStatus.matchedCustomer && (
                    <div
                      data-testid="customer-history-card"
                      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-amber-100">
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                          <History
                            className="h-3.5 w-3.5 text-amber-300"
                            aria-hidden="true"
                          />
                          Historial de {customerStatus.matchedCustomer.name}
                        </span>
                        <span className="font-mono-num font-bold text-amber-300">
                          Total previo:{' '}
                          {formatUSD(customerStatus.totalSpentUsd)} (
                          {customerStatus.purchaseCount}{' '}
                          {customerStatus.purchaseCount === 1
                            ? 'compra'
                            : 'compras'}
                          )
                        </span>
                      </div>
                      {customerStatus.matchedCustomer.lastPurchaseSummary && (
                        <p className="mt-1 text-[11px] text-amber-200/90">
                          Última compra:{' '}
                          {customerStatus.matchedCustomer.lastPurchaseDate
                            ? new Date(
                                customerStatus.matchedCustomer.lastPurchaseDate,
                              ).toLocaleDateString('es-VE', {
                                dateStyle: 'medium',
                              })
                            : ''}{' '}
                          · {customerStatus.matchedCustomer.lastPurchaseInvoice}{' '}
                          ({customerStatus.matchedCustomer.lastPurchaseSummary}{' '}
                          ·{' '}
                          <span className="font-mono-num font-semibold">
                            {formatUSD(
                              customerStatus.matchedCustomer
                                .lastPurchaseAmountUsd ?? 0,
                            )}
                          </span>
                          )
                        </p>
                      )}
                    </div>
                  )}

                {/* Sugerencia rápida si encontró por teléfono aunque el nombre sea diferente o vacío */}
                {customerStatus.status === 'frequent' &&
                  customerStatus.matchedCustomer &&
                  customerName.trim().toLowerCase() !==
                    customerStatus.matchedCustomer.name.toLowerCase() && (
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectCustomerSuggestion(
                          customerStatus.matchedCustomer!,
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-blue-200 hover:bg-blue-500/25"
                    >
                      <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      Autocompletar ficha de {customerStatus.matchedCustomer.name}
                    </button>
                  )}

                {/* Datos básicos del cliente (editable para frecuentes y registro directo para nuevos) */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="sale-customer-phone"
                      className="block text-[11px] font-medium text-slate-300"
                    >
                      Teléfono / WhatsApp
                    </label>
                    <input
                      id="sale-customer-phone"
                      data-testid="sale-customer-phone"
                      type="tel"
                      placeholder="Ej. 0414-1234567"
                      value={customerPhone}
                      onChange={(e) => {
                        setCustomerPhone(e.target.value);
                        setCustomerSavedNotice(null);
                      }}
                      className="font-mono-num mt-1 w-full min-h-[38px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="sale-customer-city"
                      className="block text-[11px] font-medium text-slate-300"
                    >
                      Ciudad
                    </label>
                    <input
                      id="sale-customer-city"
                      data-testid="sale-customer-city"
                      type="text"
                      placeholder="Ej. Guacara / Valencia"
                      value={customerCity}
                      onChange={(e) => {
                        setCustomerCity(e.target.value);
                        setCustomerSavedNotice(null);
                      }}
                      className="mt-1 w-full min-h-[38px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="sale-customer-social"
                      className="block text-[11px] font-medium text-slate-300"
                    >
                      Red Social (IG / TikTok)
                    </label>
                    <input
                      id="sale-customer-social"
                      data-testid="sale-customer-social"
                      type="text"
                      placeholder="Ej. @cliente_fut"
                      value={customerSocial}
                      onChange={(e) => {
                        setCustomerSocial(e.target.value);
                        setCustomerSavedNotice(null);
                      }}
                      className="mt-1 w-full min-h-[38px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="sale-customer-iddoc"
                      className="block text-[11px] font-medium text-slate-300"
                    >
                      Cédula / RIF (opcional)
                    </label>
                    <input
                      id="sale-customer-iddoc"
                      data-testid="sale-customer-iddoc"
                      type="text"
                      placeholder="Ej. V-25.123.456"
                      value={customerIdDoc}
                      onChange={(e) => {
                        setCustomerIdDoc(e.target.value);
                        setCustomerSavedNotice(null);
                      }}
                      className="font-mono-num mt-1 w-full min-h-[38px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {customerStatus.status === 'new' && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2.5">
                    <p className="text-[11px] text-emerald-300/90">
                      Sin compras previas · Se registrará automáticamente al facturar.
                    </p>
                    {onSaveCustomerProfile && (
                      <button
                        type="button"
                        data-testid="btn-save-new-customer"
                        onClick={handleSaveNewCustomerInline}
                        className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/25"
                      >
                        <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                        Guardar ficha ahora
                      </button>
                    )}
                  </div>
                )}

                {customerSavedNotice && (
                  <p
                    role="status"
                    data-testid="customer-saved-notice"
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300"
                  >
                    {customerSavedNotice}
                  </p>
                )}
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
                    Condición (Contado / Crédito) *
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
                    <option value="Cobrado">Contado / Cobrado</option>
                    <option value="Pendiente">Crédito / Pendiente</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="sale-delivery-date"
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-300"
                >
                  <Calendar className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
                  Fecha de entrega / recordatorio (Google Calendar)
                </label>
                <input
                  id="sale-delivery-date"
                  data-testid="sale-delivery-date"
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => {
                    setDeliveryDate(e.target.value);
                    setFeedback(null);
                  }}
                  className="font-mono-num mt-1.5 w-full min-h-[42px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  {deliveryDate
                    ? `Se agendará recordatorio automático en Google Calendar el ${deliveryDate} con cliente y modelo(s).`
                    : paymentStatus === 'Pendiente'
                      ? 'Venta pendiente: si no eliges fecha, se agendará recordatorio automático para mañana a las 9:00 AM.'
                      : 'Opcional: si ingresas una fecha de entrega, se agendará automáticamente en tu Google Calendar.'}
                </p>
              </div>

              {paymentStatus === 'Pendiente' && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200">
                  El saldo pendiente se registrará en Cuentas por Cobrar a nombre de{' '}
                  <strong>{customerName.trim() || 'Cliente Mostrador'}</strong> y se agendará en Google Calendar.
                </p>
              )}

              {paymentMethod === 'Pago Móvil / Bs' && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3.5 py-2.5 text-xs">
                  <div className="flex items-center justify-between text-blue-200">
                    <span>
                      Conversión automática Tasa BCV (
                      {state.exchangeRates.bcv.toFixed(2)} Bs/$):
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
                  data-testid="sales-feedback"
                  className={`flex flex-col gap-2 rounded-lg px-3.5 py-2.5 text-xs font-medium ${
                    feedback.type === 'error'
                      ? 'border border-red-500/30 bg-red-500/10 text-red-300'
                      : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {feedback.type === 'success' && (
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span>{feedback.text}</span>
                  </div>
                  {feedback.calendarNotice && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-emerald-500/20 pt-2 text-[11px] text-blue-200">
                      <Calendar className="h-3.5 w-3.5 shrink-0 text-blue-300" aria-hidden="true" />
                      <span data-testid="sale-calendar-status">{feedback.calendarNotice}</span>
                      {feedback.calendarLink && (
                        <a
                          href={feedback.calendarLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-blue-400/40 bg-blue-500/15 px-2 py-0.5 font-semibold text-blue-200 hover:bg-blue-500/25"
                        >
                          Ver recordatorio
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      )}
                      {feedback.needsCalendarAuth &&
                        pendingCalendarSale &&
                        onConnectGoogleCalendar && (
                          <button
                            type="button"
                            data-testid="btn-retry-sale-calendar"
                            onClick={() => void handleRetryPendingCalendarSale()}
                            className="inline-flex items-center gap-1 rounded-md border border-blue-400/50 bg-blue-600/25 px-2.5 py-1 font-semibold text-white hover:bg-blue-600/40"
                          >
                            Conectar Google y Agendar
                          </button>
                        )}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                data-testid="btn-confirm-total-sale"
                onClick={handleConfirmTotalSale}
                disabled={cart.length === 0}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                Registrar Venta y Emitir Factura JPG
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
                    Aviso: El total del carrito es menor al costo base FIFO (
                    {formatUSD(cartFifoSimulation.totalBaseCost)}). No se generará utilidad neta.
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

      {/* Historial de Ventas + Buscador por Número de Factura */}
      <section
        aria-labelledby="recent-sales-heading"
        className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6 overflow-hidden"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              id="recent-sales-heading"
              className="font-display text-lg font-semibold text-white"
            >
              Historial de Ventas y Facturas
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Busca cualquier factura por su número consecutivo (ej. FAC-0001) o descarga el comprobante JPG.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                data-testid="sales-invoice-search"
                aria-label="Buscar venta por número de factura"
                placeholder="Buscar N° Factura (FAC-0001) o cliente..."
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                className="w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <span className="font-mono-num text-xs text-slate-400 shrink-0">
              {filteredSalesHistory.length}{' '}
              {filteredSalesHistory.length === 1 ? 'venta' : 'ventas'}
            </span>
          </div>
        </div>

        {state.sales.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">
            Aún no se han registrado ventas en esta sesión. Las ventas confirmadas aparecerán aquí con su número de factura, cliente, detalle de prendas y comprobante JPG.
          </p>
        ) : filteredSalesHistory.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">
            No se encontraron facturas que coincidan con &ldquo;{invoiceSearch}&rdquo;.
          </p>
        ) : (
          <>
            <div className="mt-4 hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-800 bg-[#080E1C] text-xs font-medium text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Factura / Fecha</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Vendedor</th>
                    <th className="px-4 py-3">Detalle de Prendas</th>
                    <th className="px-4 py-3">Método de Pago</th>
                    <th className="px-4 py-3 text-right">Total (USDT)</th>
                    <th className="px-4 py-3 text-right">Estatus</th>
                    <th className="px-4 py-3 text-right">Comprobante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredSalesHistory.map((sale) => {
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
                        <td className="px-4 py-3 font-mono-num text-xs whitespace-nowrap">
                          <span className="block font-bold text-blue-300">
                            {sale.invoiceNumber || 'FAC-0001'}
                          </span>
                          <span className="text-slate-400">
                            {new Date(sale.createdAt).toLocaleString('es-VE', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                          <span className="block font-semibold text-white">
                            {sale.customerName || sale.debtorName || 'Cliente Mostrador'}
                          </span>
                          {(sale.customerCity ||
                            sale.customerPhone ||
                            sale.customerSocial ||
                            sale.customerIdDoc) && (
                            <span className="block text-[11px] text-slate-400">
                              {[
                                sale.customerCity,
                                sale.customerPhone,
                                sale.customerSocial,
                                sale.customerIdDoc,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          )}
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
                                {item.modelLabel} (
                                {normalizeVersionDisplay(item.version)} ·{' '}
                                {item.size}) —{' '}
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
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            data-testid={`btn-receipt-jpg-${sale.invoiceNumber || sale.id}`}
                            disabled={generatingReceiptId === sale.id}
                            onClick={() => void openOrDownloadSaleReceipt(sale, false)}
                            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-700 bg-[#080E1C] px-2.5 py-1 text-xs font-semibold text-blue-200 transition-colors hover:border-blue-500/50 hover:bg-blue-600/20 hover:text-white"
                          >
                            <FileImage className="h-3.5 w-3.5" aria-hidden="true" />
                            Ver / JPG
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 divide-y divide-slate-800/80 md:hidden">
              {filteredSalesHistory.map((sale) => (
                <div key={sale.id} className="py-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-mono-num text-xs font-bold text-blue-300">
                        {sale.invoiceNumber || 'FAC-0001'}
                      </span>
                      <span className="block text-sm font-semibold text-white">
                        {sale.customerName || 'Cliente'} · {sale.seller}
                      </span>
                    </div>
                    <span className="font-mono-num text-sm font-bold text-white">
                      {formatUSD(sale.finalPrice)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    {(sale.items ?? [])
                      .map(
                        (i) =>
                          `${i.quantity}x ${i.modelLabel} (${normalizeVersionDisplay(
                            i.version,
                          )} ${i.size})`,
                      )
                      .join(', ') || sale.modelLabel}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-400">
                      {sale.paymentMethod ?? 'Efectivo ($)'} ·{' '}
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
                    <button
                      type="button"
                      onClick={() => void openOrDownloadSaleReceipt(sale, false)}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-700 bg-[#080E1C] px-2.5 py-1 text-xs font-semibold text-blue-200"
                    >
                      <FileImage className="h-3.5 w-3.5" aria-hidden="true" />
                      JPG
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Modal Previsualización y Descarga de Comprobante Digital JPG */}
      {receiptPreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-modal-title"
          data-testid="receipt-preview-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
        >
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#0D1526] shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
              <div>
                <h3
                  id="receipt-modal-title"
                  className="font-display text-base font-semibold text-white"
                >
                  Comprobante Digital {receiptPreview.sale.invoiceNumber}
                </h3>
                <p className="text-xs text-slate-400">
                  Imagen JPG lista para compartir o archivar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptPreview(null)}
                aria-label="Cerrar comprobante"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-[#060B16] p-4 flex justify-center">
              <img
                src={receiptPreview.dataUrl}
                alt={`Comprobante digital ${receiptPreview.sale.invoiceNumber}`}
                className="max-h-[65vh] w-auto rounded-lg border border-slate-800 object-contain"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-800 px-5 py-3.5">
              <button
                type="button"
                onClick={() => setReceiptPreview(null)}
                className="min-h-[40px] rounded-lg border border-slate-700 bg-[#080E1C] px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                Cerrar
              </button>
              <button
                type="button"
                data-testid="btn-download-receipt-jpg"
                onClick={() =>
                  downloadJpgDataUrl(
                    receiptPreview.dataUrl,
                    `${receiptPreview.sale.invoiceNumber || receiptPreview.sale.id}.jpg`,
                  )
                }
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Descargar Comprobante JPG
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
