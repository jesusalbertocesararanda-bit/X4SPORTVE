import { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  CheckCircle2,
  Download,
  Landmark,
  PlusCircle,
  Receipt,
  RefreshCcw,
  Scale,
} from 'lucide-react';
import { PARTNER_SHARES } from '../data/initialState';
import type {
  AppState,
  CapitalInjectionDestination,
  ExpenseCategory,
  MatrixConfigParams,
  PartnerName,
  PaymentMethod,
  SinglePaymentMethod,
} from '../types/erp';
import type {
  ReconcileCashInput,
  RegisterCapitalInjectionInput,
  RegisterOperatingExpenseInput,
} from '../utils/finance';
import {
  DEFAULT_GENERAL_CONFIG,
  EXPENSE_CATEGORIES,
  formatUSD,
  formatUSDT,
  formatVES,
  getCashBackedFundsSummary,
  getTotalReceivables,
  round2,
} from '../utils/finance';

interface FinanceViewProps {
  state: AppState;
  activeSection?: 'matriz' | 'gastos' | 'socios' | 'cxc';
  matrixParams?: MatrixConfigParams;
  onCollectReceivable: (
    receivableId: string,
    paymentMethod: PaymentMethod,
    amountPaid?: number,
  ) => { ok: boolean; error?: string };
  onReinvestDividends: (partner: PartnerName) => { ok: boolean; error?: string };
  onRegisterOperatingExpense: (
    input: RegisterOperatingExpenseInput,
  ) => { ok: boolean; error?: string };
  onRegisterCapitalInjection: (
    input: RegisterCapitalInjectionInput,
  ) => { ok: boolean; error?: string };
  onReconcileCash: (input: ReconcileCashInput) => { ok: boolean; error?: string };
  onResetDemoData: () => void;
}

const PARTNERS: PartnerName[] = ['Jesús', 'Josué', 'Gabriel'];
const PAYMENT_METHODS: SinglePaymentMethod[] = [
  'Efectivo ($)',
  'Binance USDT',
  'Zelle',
  'Pago Móvil / Bs',
];
const CONTRIBUTOR_PRESETS = ['Jesús', 'Josué', 'Gabriel', 'Capital Externo'];

const PETTY_CASH_QUICK_PRESETS: Array<{
  label: string;
  concept: string;
  category: ExpenseCategory;
  source: 'operatingFund' | 'cashOnHand';
}> = [
  {
    label: 'Delivery local',
    concept: 'Delivery local de pedido',
    category: 'Gastos de Logística/Empaque (bolsas, etiquetas)',
    source: 'cashOnHand',
  },
  {
    label: 'Bolsas y empaques',
    concept: 'Bolsas y empaques',
    category: 'Gastos de Logística/Empaque (bolsas, etiquetas)',
    source: 'cashOnHand',
  },
  {
    label: 'Papelería / Etiquetas',
    concept: 'Papelería y etiquetas',
    category: 'Gastos de Logística/Empaque (bolsas, etiquetas)',
    source: 'cashOnHand',
  },
  {
    label: 'Publicidad / Ads',
    concept: 'Publicidad Instagram / Meta Ads',
    category: 'Gastos de Comercialización/Publicidad',
    source: 'operatingFund',
  },
];

export function FinanceView({
  state,
  activeSection,
  matrixParams,
  onCollectReceivable,
  onReinvestDividends,
  onRegisterOperatingExpense,
  onRegisterCapitalInjection,
  onReconcileCash,
  onResetDemoData,
}: FinanceViewProps) {
  const effectiveMatrixParams = matrixParams ?? DEFAULT_GENERAL_CONFIG.matrixParams;

  useEffect(() => {
    if (!activeSection) return;
    const sectionHeadingMap: Record<NonNullable<FinanceViewProps['activeSection']>, string> = {
      matriz: 'funds-heading',
      gastos: 'petty-cash-heading',
      socios: 'dividends-heading',
      cxc: 'receivables-heading',
    };
    const targetId = sectionHeadingMap[activeSection];
    const raf = window.requestAnimationFrame(() => {
      if (activeSection === 'matriz') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const el = document.getElementById(targetId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [activeSection]);

  const [collectionMethod, setCollectionMethod] =
    useState<SinglePaymentMethod>('Efectivo ($)');
  const [abonoTargetId, setAbonoTargetId] = useState<string | null>(null);
  const [abonoAmountInput, setAbonoAmountInput] = useState('');

  const [expenseConcept, setExpenseConcept] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>(
    EXPENSE_CATEGORIES[0],
  );
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseSource, setExpenseSource] = useState<'operatingFund' | 'cashOnHand'>(
    'operatingFund',
  );
  const [expenseMethod, setExpenseMethod] =
    useState<SinglePaymentMethod>('Efectivo ($)');

  const [injContributor, setInjContributor] = useState('Jesús');
  const [injConcept, setInjConcept] = useState('');
  const [injAmount, setInjAmount] = useState('');
  const [injMethod, setInjMethod] =
    useState<SinglePaymentMethod>('Efectivo ($)');
  const [injDestination, setInjDestination] =
    useState<CapitalInjectionDestination>('cashOnly');

  const [countedCashInput, setCountedCashInput] = useState(
    state.cashOnHand.toFixed(2),
  );
  const [reconcileReason, setReconcileReason] = useState('');

  useEffect(() => {
    setCountedCashInput(state.cashOnHand.toFixed(2));
  }, [state.cashOnHand]);

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [downloadingHtml, setDownloadingHtml] = useState(false);

  const totalReceivables = getTotalReceivables(state);
  const cashBackedSummary = getCashBackedFundsSummary(state);

  const handleDownloadStandaloneHtml = async () => {
    setFeedback(null);
    if (window.location.protocol === 'file:') {
      setFeedback({
        type: 'success',
        text: 'Ya estás ejecutando el archivo HTML portátil completo de X4SPORT.',
      });
      return;
    }

    setDownloadingHtml(true);
    try {
      const response = await fetch('/x4sport-standalone.html', {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('No se encontró el paquete HTML autocontenido.');
      }
      const htmlText = await response.text();
      if (!htmlText.toLowerCase().includes('<!doctype html>')) {
        throw new Error('El archivo generado no tiene formato HTML válido.');
      }
      const blob = new Blob([htmlText], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'index.html';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({
        type: 'success',
        text: 'Archivo autocontenido index.html descargado con Firebase Realtime Database integrado, listo para arrastrar a Netlify Drop.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'No se pudo descargar el archivo index.html completo.',
      });
    } finally {
      setDownloadingHtml(false);
    }
  };

  const handleCollect = (
    id: string,
    debtor: string,
    amount: number,
    partialAmount?: number,
  ) => {
    const res = onCollectReceivable(id, collectionMethod, partialAmount);
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error ?? 'Error al cobrar cuenta.' });
      return;
    }

    if (partialAmount !== undefined && partialAmount < amount) {
      const remaining = round2(Math.max(0, amount - partialAmount));
      setAbonoTargetId(null);
      setAbonoAmountInput('');
      setFeedback({
        type: 'success',
        text: `Abono de ${formatUSD(partialAmount)} recibido de ${debtor} vía ${collectionMethod}. Saldo restante: ${formatUSD(remaining)}.`,
      });
    } else {
      setAbonoTargetId(null);
      setAbonoAmountInput('');
      setFeedback({
        type: 'success',
        text: `Liquidación total de ${formatUSD(amount)} recibida de ${debtor} vía ${collectionMethod} y sumada a caja.`,
      });
    }
  };

  const handleReinvest = (partner: PartnerName, amount: number) => {
    const res = onReinvestDividends(partner);
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error ?? 'No se pudo reinvertir.' });
      return;
    }
    setFeedback({
      type: 'success',
      text: `${formatUSD(amount)} en dividendos de ${partner} reinvertidos al Fondo de Crecimiento.`,
    });
  };

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const parsedAmount = Number(expenseAmount);
    const res = onRegisterOperatingExpense({
      concept: expenseConcept,
      category: expenseCategory,
      amount: parsedAmount,
      source: expenseSource,
      paymentMethod: expenseMethod,
    });
    if (!res.ok) {
      setFeedback({
        type: 'error',
        text: res.error ?? 'No se pudo registrar el gasto operativo.',
      });
      return;
    }
    const triggeredDeficit =
      expenseSource === 'operatingFund' &&
      parsedAmount > state.funds.operatingAndAds;
    setExpenseConcept('');
    setExpenseAmount('');
    setFeedback({
      type: 'success',
      text: triggeredDeficit
        ? `Gasto [${expenseCategory}] "${expenseConcept.trim()}" por ${formatUSD(parsedAmount)} registrado. Regla de Déficit aplicada: el excedente redujo proporcionalmente el resto de los fondos activos.`
        : `Gasto [${expenseCategory}] "${expenseConcept.trim()}" por ${formatUSD(parsedAmount)} registrado y descontado de caja.`,
    });
  };

  const handleCapitalInjectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const parsedAmount = Number(injAmount);
    const res = onRegisterCapitalInjection({
      contributor: injContributor,
      concept: injConcept,
      amount: parsedAmount,
      paymentMethod: injMethod,
      destination: injDestination,
    });
    if (!res.ok) {
      setFeedback({
        type: 'error',
        text: res.error ?? 'No se pudo registrar la inyección de dinero.',
      });
      return;
    }
    setInjConcept('');
    setInjAmount('');
    setFeedback({
      type: 'success',
      text: `Inyección de ${formatUSD(parsedAmount)} (${injContributor.trim()}) conciliada en caja operativa sin alterar el costo FIFO de inventario.`,
    });
  };

  const handleReconcileCashSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const parsedCount = Number(countedCashInput);
    const res = onReconcileCash({
      countedCash: parsedCount,
      reason: reconcileReason,
    });
    if (!res.ok) {
      setFeedback({
        type: 'error',
        text: res.error ?? 'No se pudo conciliar la caja física.',
      });
      return;
    }
    setReconcileReason('');
    setFeedback({
      type: 'success',
      text: `Caja física conciliada a ${formatUSD(parsedCount)} (Bs. ${formatVES(parsedCount * state.exchangeRates.bcv).replace('Bs. ', '')} BCV).`,
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Finanzas, Matriz de 4 Capas y Caja
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Fondos acumulados por capa contable, reparto de dividendos entre socios y gestión de cuentas por cobrar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="btn-download-html"
            disabled={downloadingHtml}
            onClick={handleDownloadStandaloneHtml}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-blue-500/40 bg-blue-600/15 px-3.5 py-2 text-xs font-semibold text-blue-200 transition-colors hover:bg-blue-600/25 hover:text-white disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {downloadingHtml ? 'Generando index.html...' : 'Descargar index.html (Netlify Drop)'}
          </button>

          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="min-h-[40px] rounded-lg border border-slate-700 bg-[#0D1526] px-3.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              Restablecer Datos Iniciales
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onResetDemoData();
                  setConfirmReset(false);
                  setFeedback({
                    type: 'success',
                    text: 'Saldos oficiales X4SPORT ($135.19 caja, $263.50 CxC, sin ítems de prueba) restablecidos.',
                  });
                }}
                className="min-h-[40px] rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-500"
              >
                Confirmar Restablecimiento
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="min-h-[40px] rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-medium ${
            feedback.type === 'error'
              ? 'border border-red-500/30 bg-red-500/10 text-red-300'
              : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          }`}
        >
          {feedback.type === 'success' && (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <section aria-labelledby="funds-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2
              id="funds-heading"
              className="font-display text-lg font-semibold text-white"
            >
              Fondos Acumulados · Matriz de 4 Capas (USDT)
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Cálculo estricto respaldado por efectivo físico real en caja (
              <span className="font-mono-num text-slate-200">
                {formatUSDT(cashBackedSummary.totalAllocatedFunds)}
              </span>{' '}
              en fondos vs{' '}
              <span className="font-mono-num text-emerald-300">
                {formatUSDT(cashBackedSummary.cashOnHand)}
              </span>{' '}
              en caja).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>
              Ganancia neta histórica:{' '}
              <strong
                data-testid="finance-historical-profit"
                className="font-mono-num text-emerald-400"
              >
                {formatUSDT(state.historicalNetProfit ?? 317.37)}
              </strong>
            </span>
            <span>
              Caja física actual:{' '}
              <strong className="font-mono-num text-white">
                {formatUSDT(state.cashOnHand)}
              </strong>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-xl border border-slate-800 bg-[#0D1526] p-5">
            <p className="text-xs font-medium text-slate-400">
              1. Reposición de Stock (COGS FIFO)
            </p>
            <p
              data-testid="fund-replacement"
              className="font-mono-num mt-2 text-2xl font-bold text-white"
            >
              {formatUSD(state.funds.replacement)}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              100% recuperación costo base
            </p>
          </article>

          <article className="rounded-xl border border-slate-800 bg-[#0D1526] p-5">
            <p className="text-xs font-medium text-slate-400">
              2. Comisiones Venta Directa
            </p>
            <p
              data-testid="fund-commissions"
              className="font-mono-num mt-2 text-2xl font-bold text-white"
            >
              {formatUSD(state.funds.commissions)}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Jesús {formatUSD(state.funds.commissionsBySeller.Jesús)} · Josué{' '}
              {formatUSD(state.funds.commissionsBySeller.Josué)} · Gabriel{' '}
              {formatUSD(state.funds.commissionsBySeller.Gabriel)}
            </p>
          </article>

          <article className="rounded-xl border border-slate-800 bg-[#0D1526] p-5">
            <p className="text-xs font-medium text-slate-400">
              3. Fondo Operativo y Publicidad
            </p>
            <p
              data-testid="fund-operating"
              className="font-mono-num mt-2 text-2xl font-bold text-white"
            >
              {formatUSD(state.funds.operatingAndAds)}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {effectiveMatrixParams.operatingFundPct}% de la utilidad neta
            </p>
          </article>

          <article className="rounded-xl border border-slate-800 bg-[#0D1526] p-5">
            <p className="text-xs font-medium text-slate-400">
              4. Reinversión de Crecimiento
            </p>
            <p
              data-testid="fund-growth"
              className="font-mono-num mt-2 text-2xl font-bold text-emerald-400"
            >
              {formatUSD(state.funds.growthReinvestment)}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {effectiveMatrixParams.growthReinvestmentPct}% remanente +{' '}
              <span className="font-mono-num text-slate-300">
                {formatUSD(state.funds.reinvestedFromDividendsTotal)}
              </span>{' '}
              reinvertidos
            </p>
          </article>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section
          aria-labelledby="dividends-heading"
          className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6 lg:col-span-6"
        >
          <div>
            <h2
              id="dividends-heading"
              className="font-display text-lg font-semibold text-white"
            >
              Reparto de Dividendos por Socio
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {effectiveMatrixParams.dividendsPct}% de la utilidad neta remanente. Puedes reinvertir el saldo directamente al Fondo de Crecimiento.
            </p>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 text-xs font-medium text-slate-400">
                <tr>
                  <th scope="col" className="pb-3">Socio</th>
                  <th scope="col" className="pb-3 text-right">Participación</th>
                  <th scope="col" className="pb-3 text-right">Acumulado</th>
                  <th scope="col" className="pb-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {PARTNERS.map((partner) => {
                  const amount = state.funds.dividendsByPartner[partner];
                  const sharePct = (
                    effectiveMatrixParams.partnerSharesPct[partner] ??
                    PARTNER_SHARES[partner] * 100
                  ).toFixed(2);
                  return (
                    <tr key={partner}>
                      <td className="py-3.5 font-semibold text-white">
                        {partner}
                      </td>
                      <td className="py-3.5 text-right font-mono-num text-slate-300">
                        {sharePct}%
                      </td>
                      <td
                        data-testid={`dividend-${partner}`}
                        className="py-3.5 text-right font-mono-num font-bold text-white"
                      >
                        {formatUSD(amount)}
                      </td>
                      <td className="py-3.5 text-right">
                        <button
                          type="button"
                          disabled={amount <= 0}
                          onClick={() => handleReinvest(partner, amount)}
                          aria-label={`Reinvertir dividendos de ${partner}`}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                        >
                          <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          Reinvertir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section
          aria-labelledby="receivables-heading"
          className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6 lg:col-span-6"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2
                id="receivables-heading"
                className="font-display text-lg font-semibold text-white"
              >
                Cuentas por Cobrar Pendientes
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Selecciona el método de cobro; el monto se suma automáticamente a caja.
              </p>
            </div>
            <span className="font-mono-num text-sm font-bold text-amber-400 shrink-0">
              {formatUSD(totalReceivables)}
            </span>
          </div>

          {state.receivables.length > 0 && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-slate-800 bg-[#080E1C] p-3">
              <label
                htmlFor="collection-payment-method"
                className="text-xs font-medium text-slate-300"
              >
                Método de cobro recibido:
              </label>
              <select
                id="collection-payment-method"
                value={collectionMethod}
                onChange={(e) =>
                  setCollectionMethod(e.target.value as SinglePaymentMethod)
                }
                className="min-h-[38px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </select>
            </div>
          )}

          {state.receivables.length === 0 ? (
            <div className="mt-6 rounded-lg border border-slate-800 bg-[#080E1C] p-6 text-center">
              <p className="text-sm font-medium text-emerald-400">
                Sin cuentas pendientes
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Todas las cuentas por cobrar han sido liquidadas a caja.
              </p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-800/80">
              {state.receivables.map((rec) => {
                const isAbonoOpen = abonoTargetId === rec.id;
                const paidSoFar = round2(rec.paidAmount ?? 0);
                return (
                  <div key={rec.id} className="py-3 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-white">
                            {rec.debtor}
                          </p>
                          {paidSoFar > 0 && (
                            <span className="text-[11px] font-semibold text-blue-300">
                              Abono parcial (pagado {formatUSD(paidSoFar)})
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-slate-400">
                          {rec.note ?? 'Cuenta por cobrar'}
                          {collectionMethod === 'Pago Móvil / Bs' && (
                            <span className="font-mono-num text-blue-300">
                              {' '}
                              · {formatVES(rec.amount * state.exchangeRates.bcv)}
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <span className="font-mono-num text-sm font-bold text-white">
                          {formatUSD(rec.amount)}
                        </span>
                        <button
                          type="button"
                          data-testid={`btn-abono-${rec.id}`}
                          onClick={() => {
                            if (isAbonoOpen) {
                              setAbonoTargetId(null);
                              setAbonoAmountInput('');
                            } else {
                              setAbonoTargetId(rec.id);
                              setAbonoAmountInput('');
                            }
                          }}
                          className="min-h-[38px] rounded-lg border border-blue-500/40 bg-blue-600/10 px-2.5 py-1.5 text-xs font-semibold text-blue-200 transition-colors hover:bg-blue-600/20 hover:text-white"
                        >
                          {isAbonoOpen ? 'Cerrar' : 'Abonar'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleCollect(rec.id, rec.debtor, rec.amount)
                          }
                          aria-label={`Cobrar total ${formatUSD(rec.amount)} a ${rec.debtor}`}
                          className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                        >
                          <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
                          Cobrar
                        </button>
                      </div>
                    </div>

                    {isAbonoOpen && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleCollect(
                            rec.id,
                            rec.debtor,
                            rec.amount,
                            Number(abonoAmountInput),
                          );
                        }}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-[#080E1C] p-2.5"
                      >
                        <label
                          htmlFor={`abono-input-${rec.id}`}
                          className="text-xs text-slate-300"
                        >
                          Monto del abono ($):
                        </label>
                        <input
                          id={`abono-input-${rec.id}`}
                          type="number"
                          min="0.01"
                          max={rec.amount}
                          step="0.01"
                          required
                          placeholder={(rec.amount / 2).toFixed(2)}
                          value={abonoAmountInput}
                          onChange={(e) => setAbonoAmountInput(e.target.value)}
                          className="font-mono-num min-h-[38px] w-28 rounded-lg border border-slate-700 bg-[#070D19] px-2.5 py-1 text-xs text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="submit"
                          className="min-h-[38px] rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                        >
                          Registrar Abono
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section
        aria-labelledby="petty-cash-heading"
        className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              id="petty-cash-heading"
              className="font-display text-lg font-semibold text-white"
            >
              Gastos Operativos (Caja Chica)
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Registra gastos menores (delivery, papelería, empaques) o publicidad descontándolos del efectivo físico de caja o Fondo Operativo sin alterar el inventario.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono-num text-xs text-slate-300">
            <span>
              Caja física:{' '}
              <strong className="text-emerald-300">
                {formatUSDT(state.cashOnHand)}
              </strong>
            </span>
            <span>
              Total gastos:{' '}
              <strong
                data-testid="finance-total-expenses"
                className="text-red-300"
              >
                {formatUSDT(
                  (state.operatingExpenses ?? []).reduce(
                    (s, e) => s + e.amount,
                    0,
                  ),
                )}
              </strong>
            </span>
            <span>
              Fondo Operativo {effectiveMatrixParams.operatingFundPct}%:{' '}
              <strong className="text-blue-300">
                {formatUSDT(state.funds.operatingAndAds)}
              </strong>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-slate-400">
            Atajos Caja Chica:
          </span>
          {PETTY_CASH_QUICK_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              data-testid={`petty-cash-preset-${preset.label}`}
              onClick={() => {
                setExpenseCategory(preset.category);
                setExpenseConcept(preset.concept);
                setExpenseSource(preset.source);
                setExpenseMethod('Efectivo ($)');
                setFeedback(null);
              }}
              className="min-h-[32px] rounded-lg border border-slate-700 bg-[#080E1C] px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition-colors hover:border-blue-500/50 hover:bg-blue-600/20 hover:text-white"
            >
              + {preset.label}
            </button>
          ))}
        </div>

        <form
          onSubmit={handleExpenseSubmit}
          className="grid grid-cols-1 gap-4 sm:grid-cols-12 sm:items-end"
        >
          <div className="sm:col-span-3">
            <label
              htmlFor="expense-category"
              className="block text-xs font-medium text-slate-300"
            >
              Clasificación del gasto *
            </label>
            <select
              id="expense-category"
              data-testid="expense-category"
              required
              value={expenseCategory}
              onChange={(e) => {
                setExpenseCategory(e.target.value as ExpenseCategory);
                setFeedback(null);
              }}
              className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <label
              htmlFor="expense-concept"
              className="block text-xs font-medium text-slate-300"
            >
              Concepto del gasto *
            </label>
            <input
              id="expense-concept"
              type="text"
              required
              placeholder="Ej. Bolsas / Publicidad Instagram"
              value={expenseConcept}
              onChange={(e) => {
                setExpenseConcept(e.target.value);
                setFeedback(null);
              }}
              className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="expense-amount"
              className="block text-xs font-medium text-slate-300"
            >
              Monto (USDT) *
            </label>
            <input
              id="expense-amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              placeholder="0.00"
              value={expenseAmount}
              onChange={(e) => {
                setExpenseAmount(e.target.value);
                setFeedback(null);
              }}
              className="font-mono-num mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="expense-source"
              className="block text-xs font-medium text-slate-300"
            >
              Descontar de
            </label>
            <select
              id="expense-source"
              value={expenseSource}
              onChange={(e) =>
                setExpenseSource(
                  e.target.value as 'operatingFund' | 'cashOnHand',
                )
              }
              className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="operatingFund">
                Fondo Operativo {effectiveMatrixParams.operatingFundPct}%
              </option>
              <option value="cashOnHand">Caja General</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="expense-method"
              className="block text-xs font-medium text-slate-300"
            >
              Vía de pago
            </label>
            <select
              id="expense-method"
              value={expenseMethod}
              onChange={(e) =>
                setExpenseMethod(e.target.value as SinglePaymentMethod)
              }
              className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {PAYMENT_METHODS.map((pm) => (
                <option key={pm} value={pm}>
                  {pm}
                </option>
              ))}
            </select>
          </div>

          {expenseSource === 'operatingFund' &&
            Number(expenseAmount) > state.funds.operatingAndAds &&
            Number(expenseAmount) <= state.cashOnHand && (
              <div className="sm:col-span-12 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200">
                Regla de Déficit activa: el Fondo Operativo (
                {formatUSD(state.funds.operatingAndAds)}) no cubre todo el gasto;
                el excedente de{' '}
                <strong className="font-mono-num">
                  {formatUSD(
                    round2(Number(expenseAmount) - state.funds.operatingAndAds),
                  )}
                </strong>{' '}
                se restará del efectivo en caja y reducirá proporcionalmente los fondos restantes.
              </div>
            )}

          <div className="sm:col-span-12 flex justify-end">
            <button
              type="submit"
              data-testid="btn-register-expense"
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <Receipt className="h-4 w-4 shrink-0" aria-hidden="true" />
              Registrar Gasto Clasificado
            </button>
          </div>
        </form>

        {/* Resumen por categoría obligatoria */}
        <div className="grid grid-cols-1 gap-3 border-t border-slate-800 pt-4 sm:grid-cols-3">
          {EXPENSE_CATEGORIES.map((cat) => {
            const catTotal = round2(
              (state.operatingExpenses ?? [])
                .filter((e) => e.category === cat)
                .reduce((s, e) => s + e.amount, 0),
            );
            return (
              <div
                key={cat}
                className="rounded-lg border border-slate-800 bg-[#080E1C] px-3.5 py-2.5"
              >
                <p className="text-[11px] font-medium text-slate-400">{cat}</p>
                <p className="font-mono-num mt-1 text-sm font-bold text-white">
                  {formatUSDT(catTotal)}
                </p>
              </div>
            );
          })}
        </div>

        {(state.operatingExpenses ?? []).length === 0 ? (
          <p className="text-xs text-slate-400">
            Sin gastos operativos registrados en esta sesión.
          </p>
        ) : (
          <div className="divide-y divide-slate-800/80 border-t border-slate-800 pt-2">
            {(state.operatingExpenses ?? []).map((exp) => (
              <div
                key={exp.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
              >
                <div>
                  <p className="font-medium text-white">
                    {exp.concept}{' '}
                    <span className="text-blue-300 font-normal">
                      · {exp.category ?? 'Gasto histórico acumulado'}
                    </span>
                  </p>
                  <p className="text-slate-400">
                    {exp.paymentMethod} ·{' '}
                    {exp.source === 'operatingFund'
                      ? `Fondo Operativo ${effectiveMatrixParams.operatingFundPct}%`
                      : 'Caja General'}
                    {exp.deficitCoveredByFunds && exp.deficitCoveredByFunds > 0
                      ? ` · Déficit proporcional (-${formatUSD(
                          exp.deficitCoveredByFunds,
                        )})`
                      : ''}{' '}
                    ·{' '}
                    {new Date(exp.createdAt).toLocaleString('es-VE', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
                <span className="font-mono-num text-sm font-semibold text-red-300">
                  -{formatUSD(exp.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* INYECCIONES DE DINERO Y CONCILIACIÓN DE CAJA FÍSICA */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section
          aria-labelledby="capital-injections-heading"
          className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6 space-y-5 lg:col-span-7"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2
                id="capital-injections-heading"
                className="font-display text-lg font-semibold text-white"
              >
                Inyecciones de Dinero / Aportes de Capital
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Registra aportes externos o de socios para aumentar la liquidez y caja sin alterar el costo FIFO de inventario.
              </p>
            </div>
            <span className="font-mono-num text-xs text-emerald-300 shrink-0">
              Total inyectado:{' '}
              <strong>
                {formatUSD(
                  (state.capitalInjections ?? []).reduce(
                    (s, i) => s + i.amount,
                    0,
                  ),
                )}
              </strong>
            </span>
          </div>

          <form
            onSubmit={handleCapitalInjectionSubmit}
            className="grid grid-cols-1 gap-4 sm:grid-cols-12 sm:items-start"
          >
            <div className="sm:col-span-4">
              <label
                htmlFor="injection-contributor"
                className="block text-xs font-medium text-slate-300"
              >
                Aportante / Origen *
              </label>
              <input
                id="injection-contributor"
                type="text"
                required
                value={injContributor}
                onChange={(e) => setInjContributor(e.target.value)}
                placeholder="Ej. Jesús / Aporte Externo"
                className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {CONTRIBUTOR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setInjContributor(preset)}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      injContributor === preset
                        ? 'bg-blue-600 text-white'
                        : 'bg-[#080E1C] text-slate-400 hover:text-white'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="sm:col-span-5">
              <label
                htmlFor="injection-concept"
                className="block text-xs font-medium text-slate-300"
              >
                Concepto del aporte *
              </label>
              <input
                id="injection-concept"
                type="text"
                required
                placeholder="Ej. Capital de trabajo / Liquidez envío"
                value={injConcept}
                onChange={(e) => {
                  setInjConcept(e.target.value);
                  setFeedback(null);
                }}
                className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-3">
              <label
                htmlFor="injection-amount"
                className="block text-xs font-medium text-slate-300"
              >
                Monto (USDT) *
              </label>
              <input
                id="injection-amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="0.00"
                value={injAmount}
                onChange={(e) => {
                  setInjAmount(e.target.value);
                  setFeedback(null);
                }}
                className="font-mono-num mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-4">
              <label
                htmlFor="injection-method"
                className="block text-xs font-medium text-slate-300"
              >
                Método de ingreso
              </label>
              <select
                id="injection-method"
                value={injMethod}
                onChange={(e) =>
                  setInjMethod(e.target.value as SinglePaymentMethod)
                }
                className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4">
              <label
                htmlFor="injection-destination"
                className="block text-xs font-medium text-slate-300"
              >
                Destino contable
              </label>
              <select
                id="injection-destination"
                value={injDestination}
                onChange={(e) =>
                  setInjDestination(
                    e.target.value as CapitalInjectionDestination,
                  )
                }
                className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="cashOnly">Solo Caja Operativa</option>
                <option value="growthReinvestment">
                  Caja + Fondo Reinversión
                </option>
                <option value="operatingFund">
                  Caja + Fondo Operativo 10%
                </option>
              </select>
            </div>

            <div className="sm:col-span-4 sm:self-end">
              <button
                type="submit"
                data-testid="btn-register-injection"
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <PlusCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                Registrar Inyección
              </button>
            </div>
          </form>

          {(state.capitalInjections ?? []).length === 0 ? (
            <p className="text-xs text-slate-400">
              Aún no se han registrado inyecciones de capital externo.
            </p>
          ) : (
            <div className="divide-y divide-slate-800/80 border-t border-slate-800 pt-2">
              {(state.capitalInjections ?? []).map((inj) => (
                <div
                  key={inj.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
                >
                  <div>
                    <p className="font-medium text-white">
                      {inj.contributor} — {inj.concept}
                    </p>
                    <p className="text-slate-400">
                      {inj.paymentMethod} ·{' '}
                      {inj.destination === 'growthReinvestment'
                        ? 'Caja + Fondo Reinversión'
                        : inj.destination === 'operatingFund'
                          ? 'Caja + Fondo Operativo'
                          : 'Caja Operativa'}{' '}
                      ·{' '}
                      {new Date(inj.createdAt).toLocaleString('es-VE', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>
                  <span className="font-mono-num text-sm font-semibold text-emerald-400">
                    +{formatUSD(inj.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          aria-labelledby="cash-reconciliation-heading"
          className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6 space-y-5 lg:col-span-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                id="cash-reconciliation-heading"
                className="font-display text-lg font-semibold text-white"
              >
                Conciliación Exacta de Caja
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Cuadre de efectivo físico contra referencias BCV y USDT sin modificar costos FIFO.
              </p>
            </div>
            <Scale className="h-5 w-5 shrink-0 text-blue-400" aria-hidden="true" />
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-800 bg-[#080E1C] p-3.5 text-xs">
            <div>
              <p className="text-slate-400">Caja en sistema (USDT)</p>
              <p
                data-testid="finance-cash-system"
                className="font-mono-num mt-1 text-lg font-bold text-white"
              >
                {formatUSDT(state.cashOnHand)}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Referencia BCV / USDT</p>
              <p className="font-mono-num mt-1 font-semibold text-emerald-300">
                {formatVES(state.cashOnHand * state.exchangeRates.bcv)} BCV
              </p>
              <p className="font-mono-num text-[11px] text-blue-300">
                {formatVES(state.cashOnHand * state.exchangeRates.usdt)} USDT
              </p>
            </div>
          </div>

          <form onSubmit={handleReconcileCashSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="reconcile-counted-cash"
                className="block text-xs font-medium text-slate-300"
              >
                Efectivo físico contado (USDT) *
              </label>
              <input
                id="reconcile-counted-cash"
                type="number"
                min="0"
                step="0.01"
                required
                value={countedCashInput}
                onChange={(e) => {
                  setCountedCashInput(e.target.value);
                  setFeedback(null);
                }}
                className="font-mono-num mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {Number.isFinite(Number(countedCashInput)) &&
                Math.abs(round2(Number(countedCashInput) - state.cashOnHand)) > 0 && (
                  <p
                    className={`mt-1 font-mono-num text-[11px] font-medium ${
                      round2(Number(countedCashInput) - state.cashOnHand) > 0
                        ? 'text-emerald-400'
                        : 'text-amber-300'
                    }`}
                  >
                    Diferencia a conciliar:{' '}
                    {round2(Number(countedCashInput) - state.cashOnHand) > 0
                      ? '+'
                      : ''}
                    {formatUSD(round2(Number(countedCashInput) - state.cashOnHand))}
                  </p>
                )}
            </div>

            <div>
              <label
                htmlFor="reconcile-reason"
                className="block text-xs font-medium text-slate-300"
              >
                Motivo / Referencia del arqueo
              </label>
              <input
                id="reconcile-reason"
                type="text"
                placeholder="Ej. Cuadre diario hoja de cálculo / Diferencia de vuelto"
                value={reconcileReason}
                onChange={(e) => setReconcileReason(e.target.value)}
                className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              data-testid="btn-reconcile-cash"
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <Landmark className="h-4 w-4 shrink-0" aria-hidden="true" />
              Conciliar Saldo de Caja
            </button>
          </form>

          {(state.movements ?? []).length > 0 && (
            <div className="border-t border-slate-800 pt-3 space-y-2">
              <p className="text-xs font-semibold text-slate-300">
                Últimos movimientos financieros sincronizados
              </p>
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/70">
                {(state.movements ?? []).slice(0, 8).map((mov) => (
                  <div
                    key={mov.id}
                    className="flex items-start justify-between gap-2 py-2 text-[11px]"
                  >
                    <div className="min-w-0">
                      <p className="text-slate-200">{mov.description}</p>
                      <p className="text-slate-500">
                        {new Date(mov.createdAt).toLocaleString('es-VE', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>
                    <span
                      className={`font-mono-num font-semibold shrink-0 ${
                        mov.amount > 0
                          ? 'text-emerald-400'
                          : mov.amount < 0
                            ? 'text-red-300'
                            : 'text-slate-400'
                      }`}
                    >
                      {mov.amount > 0 ? '+' : ''}
                      {formatUSD(mov.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
