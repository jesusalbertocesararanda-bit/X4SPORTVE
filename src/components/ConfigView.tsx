import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Globe,
  Layers,
  Plus,
  RefreshCcw,
  RefreshCw,
  Save,
  Settings,
  ShieldAlert,
  Store,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { RateSyncInfo } from '../App';
import type {
  AppState,
  AuthorizedUserRecord,
  GeneralConfig,
} from '../types/erp';
import {
  canAccessConfiguration,
  getMergedAuthorizedUsers,
  MAIN_ADMIN_EMAIL,
  type ERPUser,
} from '../utils/auth';
import { DEFAULT_GENERAL_CONFIG, round2 } from '../utils/finance';
import type { GoogleCalendarAuthState } from '../utils/googleCalendar';
import {
  buildShareableCatalogUrl,
  convertGoogleDriveUrlToDirect,
} from '../utils/publicCatalog';
import { GoogleCalendarBanner } from './GoogleCalendarBanner';

interface ConfigViewProps {
  currentUser: ERPUser | null;
  state: AppState;
  generalConfig: GeneralConfig;
  rateSync: RateSyncInfo;
  calendarAuth: GoogleCalendarAuthState;
  onSaveGeneralConfig: (config: GeneralConfig) => Promise<void>;
  onConnectGoogleCalendar: () => Promise<boolean>;
  onDisconnectGoogleCalendar: () => Promise<void>;
  onToggleCatalogEnabled: (enabled: boolean) => void;
  onOpenCatalogAdmin: () => void;
  onBackToDashboard: () => void;
  onOpenExcelImport: () => void;
  onSyncRatesFromApi: () => Promise<{ ok: boolean; error?: string }>;
  onUpdateRates: (bcv: number, usdt: number) => { ok: boolean; error?: string };
  onResetDemoData: () => void;
  onUpdateAuthorizedUsers?: (users: AuthorizedUserRecord[]) => void;
}

export function ConfigView({
  currentUser,
  state,
  generalConfig,
  rateSync,
  calendarAuth,
  onSaveGeneralConfig,
  onConnectGoogleCalendar,
  onDisconnectGoogleCalendar,
  onToggleCatalogEnabled,
  onOpenCatalogAdmin,
  onBackToDashboard,
  onOpenExcelImport,
  onSyncRatesFromApi,
  onUpdateRates,
  onResetDemoData,
  onUpdateAuthorizedUsers,
}: ConfigViewProps) {
  // 4-Layer Matrix Config State
  const [commissionPct, setCommissionPct] = useState(
    String(generalConfig.matrixParams.commissionPct),
  );
  const [operatingFundPct, setOperatingFundPct] = useState(
    String(generalConfig.matrixParams.operatingFundPct),
  );
  const [growthReinvestmentPct, setGrowthReinvestmentPct] = useState(
    String(generalConfig.matrixParams.growthReinvestmentPct),
  );
  const [jesusSharePct, setJesusSharePct] = useState(
    String(generalConfig.matrixParams.partnerSharesPct.Jesús),
  );
  const [josueSharePct, setJosueSharePct] = useState(
    String(generalConfig.matrixParams.partnerSharesPct.Josué),
  );
  const [gabrielSharePct, setGabrielSharePct] = useState(
    String(generalConfig.matrixParams.partnerSharesPct.Gabriel),
  );

  // Alert Thresholds Config State
  const [lowStockThreshold, setLowStockThreshold] = useState(
    String(generalConfig.alertThresholds.lowStockThreshold),
  );
  const [receivableOverdueDays, setReceivableOverdueDays] = useState(
    String(generalConfig.alertThresholds.receivableOverdueDays),
  );
  const [maritimeTransitMaxDays, setMaritimeTransitMaxDays] = useState(
    String(generalConfig.alertThresholds.maritimeTransitMaxDays),
  );
  const [airTransitMaxDays, setAirTransitMaxDays] = useState(
    String(generalConfig.alertThresholds.airTransitMaxDays),
  );

  // Brand & JPG Invoice Identity State
  const [storeName, setStoreName] = useState(
    generalConfig.brandIdentity.storeName,
  );
  const [storeSubtitle, setStoreSubtitle] = useState(
    generalConfig.brandIdentity.storeSubtitle,
  );
  const [storeLocation, setStoreLocation] = useState(
    generalConfig.brandIdentity.storeLocation,
  );
  const [logoUrl, setLogoUrl] = useState(generalConfig.brandIdentity.logoUrl);
  const [invoiceFooterMessage, setInvoiceFooterMessage] = useState(
    generalConfig.brandIdentity.invoiceFooterMessage,
  );

  // Rates, Backup & Users State
  const [bcvInput, setBcvInput] = useState(state.exchangeRates.bcv.toFixed(2));
  const [usdtInput, setUsdtInput] = useState(state.exchangeRates.usdt.toFixed(2));
  const [downloadingHtml, setDownloadingHtml] = useState(false);
  const [confirmDemoReset, setConfirmDemoReset] = useState(false);
  const [copiedCatalogUrl, setCopiedCatalogUrl] = useState(false);
  const [savingGeneral, setSavingGeneral] = useState(false);

  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'partner' | 'admin'>(
    'partner',
  );
  const [newUserPhone, setNewUserPhone] = useState('');
  const [showAddUserForm, setShowAddUserForm] = useState(false);

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    setCommissionPct(String(generalConfig.matrixParams.commissionPct));
    setOperatingFundPct(String(generalConfig.matrixParams.operatingFundPct));
    setGrowthReinvestmentPct(
      String(generalConfig.matrixParams.growthReinvestmentPct),
    );
    setJesusSharePct(String(generalConfig.matrixParams.partnerSharesPct.Jesús));
    setJosueSharePct(String(generalConfig.matrixParams.partnerSharesPct.Josué));
    setGabrielSharePct(
      String(generalConfig.matrixParams.partnerSharesPct.Gabriel),
    );

    setLowStockThreshold(
      String(generalConfig.alertThresholds.lowStockThreshold),
    );
    setReceivableOverdueDays(
      String(generalConfig.alertThresholds.receivableOverdueDays),
    );
    setMaritimeTransitMaxDays(
      String(generalConfig.alertThresholds.maritimeTransitMaxDays),
    );
    setAirTransitMaxDays(
      String(generalConfig.alertThresholds.airTransitMaxDays),
    );

    setStoreName(generalConfig.brandIdentity.storeName);
    setStoreSubtitle(generalConfig.brandIdentity.storeSubtitle);
    setStoreLocation(generalConfig.brandIdentity.storeLocation);
    setLogoUrl(generalConfig.brandIdentity.logoUrl);
    setInvoiceFooterMessage(generalConfig.brandIdentity.invoiceFooterMessage);
  }, [generalConfig]);

  useEffect(() => {
    setBcvInput(state.exchangeRates.bcv.toFixed(2));
    setUsdtInput(state.exchangeRates.usdt.toFixed(2));
  }, [state.exchangeRates.bcv, state.exchangeRates.usdt]);

  const partnerSumPct = useMemo(() => {
    return round2(
      (Number(jesusSharePct) || 0) +
        (Number(josueSharePct) || 0) +
        (Number(gabrielSharePct) || 0),
    );
  }, [jesusSharePct, josueSharePct, gabrielSharePct]);

  const dividendsAutoPct = useMemo(() => {
    const g = Number(growthReinvestmentPct);
    if (!Number.isFinite(g)) return 20;
    return round2(Math.max(0, 100 - Math.min(100, Math.max(0, g))));
  }, [growthReinvestmentPct]);

  const resolvedLogoPreview = useMemo(() => {
    const trimmed = logoUrl.trim();
    if (!trimmed) return DEFAULT_GENERAL_CONFIG.brandIdentity.logoUrl;
    return convertGoogleDriveUrlToDirect(trimmed);
  }, [logoUrl]);

  // Strict check: Only MAIN_ADMIN_EMAIL can access Configuration
  if (!canAccessConfiguration(currentUser)) {
    return (
      <div
        data-testid="settings-modal-restricted"
        className="mx-auto max-w-xl py-8"
      >
        <div className="rounded-2xl border border-red-500/40 bg-[#0D1526] p-6 sm:p-8 shadow-2xl space-y-5">
          <div className="flex items-center gap-3.5">
            <div className="rounded-xl border border-red-500/40 bg-red-500/15 p-3 text-red-400">
              <ShieldAlert className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-white">
                Control de Seguridad ERP (SAP)
              </h1>
              <p className="text-xs font-medium text-red-300">
                Acceso restringido: Solo Administrador Principal ({MAIN_ADMIN_EMAIL})
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#080E1C] p-4 text-xs text-slate-300 leading-relaxed space-y-2">
            <p>
              El módulo de <strong>Configuración General</strong> resguarda parámetros críticos del ERP: porcentajes de la Matriz de 4 Capas, umbrales de alertas, identidad fiscal de facturas, usuarios SAP, tasas globales y respaldos en Firebase.
            </p>
            <p className="text-slate-400">
              Tu sesión actual (
              <span className="text-white font-medium">
                {currentUser?.name ?? 'Invitado'}
              </span>{' '}
              &lt;{currentUser?.email ?? 'sin sesión'}&gt;) no tiene privilegios de Administrador Principal.
            </p>
          </div>

          <button
            type="button"
            onClick={onBackToDashboard}
            className="w-full min-h-[44px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors"
          >
            Volver al Panel Principal
          </button>
        </div>
      </div>
    );
  }

  const catalogEnabled = state.catalogEnabled !== false;
  const shareableCatalogUrl = buildShareableCatalogUrl();
  const authorizedUsersList = getMergedAuthorizedUsers(state.authorizedUsers);

  const handleSaveGeneralParameters = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const comm = Number(commissionPct);
    const op = Number(operatingFundPct);
    const growth = Number(growthReinvestmentPct);
    const jPct = Number(jesusSharePct);
    const joPct = Number(josueSharePct);
    const gPct = Number(gabrielSharePct);

    if (
      !Number.isFinite(comm) ||
      comm < 0 ||
      comm > 50 ||
      !Number.isFinite(op) ||
      op < 0 ||
      op > 50 ||
      !Number.isFinite(growth) ||
      growth < 0 ||
      growth > 100
    ) {
      setFeedback({
        type: 'error',
        text: 'Verifica que los porcentajes de la Matriz de 4 Capas estén dentro de rangos válidos (0–100%).',
      });
      return;
    }

    if (Math.abs(partnerSumPct - 100) > 0.05) {
      setFeedback({
        type: 'error',
        text: `La participación de los 3 socios debe sumar 100.00% (actualmente suma ${partnerSumPct.toFixed(2)}%).`,
      });
      return;
    }

    const stockTh = Math.floor(Number(lowStockThreshold));
    const cxcDays = Math.floor(Number(receivableOverdueDays));
    const marDays = Math.floor(Number(maritimeTransitMaxDays));
    const airDays = Math.floor(Number(airTransitMaxDays));

    if (
      !Number.isFinite(stockTh) ||
      stockTh < 0 ||
      !Number.isFinite(cxcDays) ||
      cxcDays < 1 ||
      !Number.isFinite(marDays) ||
      marDays < 1 ||
      !Number.isFinite(airDays) ||
      airDays < 1
    ) {
      setFeedback({
        type: 'error',
        text: 'Los umbrales de alertas deben ser números enteros positivos válidos.',
      });
      return;
    }

    const cleanLogo = logoUrl.trim()
      ? convertGoogleDriveUrlToDirect(logoUrl.trim())
      : DEFAULT_GENERAL_CONFIG.brandIdentity.logoUrl;

    const nextConfig: GeneralConfig = {
      matrixParams: {
        commissionPct: round2(comm),
        operatingFundPct: round2(op),
        growthReinvestmentPct: round2(growth),
        dividendsPct: round2(100 - growth),
        partnerSharesPct: {
          Jesús: round2(jPct),
          Josué: round2(joPct),
          Gabriel: round2(gPct),
        },
      },
      alertThresholds: {
        lowStockThreshold: stockTh,
        receivableOverdueDays: cxcDays,
        maritimeTransitMaxDays: marDays,
        airTransitMaxDays: airDays,
      },
      brandIdentity: {
        storeName: storeName.trim() || 'X4SPORT',
        storeSubtitle: storeSubtitle.trim() || 'INDUMENTARIA DEPORTIVA',
        storeLocation:
          storeLocation.trim() || 'Guacara, Edo. Carabobo · Venezuela',
        logoUrl: cleanLogo,
        invoiceFooterMessage:
          invoiceFooterMessage.trim() || 'Gracias por comprar en X4SPORT',
      },
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.email ?? MAIN_ADMIN_EMAIL,
    };

    setSavingGeneral(true);
    try {
      await onSaveGeneralConfig(nextConfig);
      setLogoUrl(cleanLogo);
      setFeedback({
        type: 'success',
        text: 'Configuración general (Matriz, Umbrales e Identidad JPG) sincronizada en Firebase (configuracion/general).',
      });
    } catch {
      setFeedback({
        type: 'error',
        text: 'Se guardó respaldo local, pero hubo un error al sincronizar configuracion/general en Firebase.',
      });
    } finally {
      setSavingGeneral(false);
    }
  };

  const handleRestoreDefaultConfig = () => {
    const def = DEFAULT_GENERAL_CONFIG;
    setCommissionPct(String(def.matrixParams.commissionPct));
    setOperatingFundPct(String(def.matrixParams.operatingFundPct));
    setGrowthReinvestmentPct(String(def.matrixParams.growthReinvestmentPct));
    setJesusSharePct(String(def.matrixParams.partnerSharesPct.Jesús));
    setJosueSharePct(String(def.matrixParams.partnerSharesPct.Josué));
    setGabrielSharePct(String(def.matrixParams.partnerSharesPct.Gabriel));

    setLowStockThreshold(String(def.alertThresholds.lowStockThreshold));
    setReceivableOverdueDays(String(def.alertThresholds.receivableOverdueDays));
    setMaritimeTransitMaxDays(
      String(def.alertThresholds.maritimeTransitMaxDays),
    );
    setAirTransitMaxDays(String(def.alertThresholds.airTransitMaxDays));

    setStoreName(def.brandIdentity.storeName);
    setStoreSubtitle(def.brandIdentity.storeSubtitle);
    setStoreLocation(def.brandIdentity.storeLocation);
    setLogoUrl(def.brandIdentity.logoUrl);
    setInvoiceFooterMessage(def.brandIdentity.invoiceFooterMessage);
    setFeedback({
      type: 'success',
      text: 'Valores oficiales de fábrica cargados en el formulario. Presiona "Guardar en Firebase" para aplicarlos.',
    });
  };

  const handleCopyCatalogUrl = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareableCatalogUrl);
      }
      setCopiedCatalogUrl(true);
      setTimeout(() => setCopiedCatalogUrl(false), 2000);
    } catch {
      setFeedback({
        type: 'success',
        text: `Enlace del catálogo público: ${shareableCatalogUrl}`,
      });
    }
  };

  const handleSaveRates = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = onUpdateRates(Number(bcvInput), Number(usdtInput));
    if (!res.ok) {
      setFeedback({
        type: 'error',
        text: res.error ?? 'Error al guardar las tasas.',
      });
      return;
    }
    setFeedback({
      type: 'success',
      text: 'Tasas BCV / USDT actualizadas en Firebase Realtime Database.',
    });
  };

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
        text: 'Archivo autocontenido index.html descargado para Netlify Drop.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'No se pudo descargar el archivo index.html.',
      });
    } finally {
      setDownloadingHtml(false);
    }
  };

  const handleAddAuthorizedUser = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const cleanEmail = newUserEmail.trim().toLowerCase();
    const cleanName = newUserName.trim();

    if (!cleanEmail || !cleanName) {
      setFeedback({
        type: 'error',
        text: 'Ingresa el nombre completo y correo electrónico del usuario.',
      });
      return;
    }

    const currentUsers = getMergedAuthorizedUsers(state.authorizedUsers);
    const existing = currentUsers.find(
      (u) => u.email.toLowerCase() === cleanEmail,
    );

    if (existing) {
      setFeedback({
        type: 'error',
        text: `El correo "${cleanEmail}" ya está registrado como ${existing.name}.`,
      });
      return;
    }

    const newUser: AuthorizedUserRecord = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      email: cleanEmail,
      name: cleanName,
      role: newUserRole,
      title:
        newUserRole === 'admin'
          ? 'Administrador Principal'
          : 'Socio Operativo',
      phone: newUserPhone.trim() || undefined,
      firstLoginPending: true,
      avatarBg: newUserRole === 'admin' ? 'bg-blue-600' : 'bg-emerald-600',
      createdAt: new Date().toISOString(),
    };

    const updated = [...currentUsers, newUser];
    if (onUpdateAuthorizedUsers) {
      onUpdateAuthorizedUsers(updated);
    }

    setNewUserName('');
    setNewUserEmail('');
    setNewUserPhone('');
    setNewUserRole('partner');
    setShowAddUserForm(false);
    setFeedback({
      type: 'success',
      text: `Usuario "${cleanName}" pre-registrado exitosamente. Al iniciar sesión por primera vez, el sistema le pedirá verificar su correo con código OTP y definir su contraseña personal.`,
    });
  };

  const handleDeleteUser = (targetEmail: string) => {
    const cleanEmail = targetEmail.trim().toLowerCase();
    if (
      cleanEmail === MAIN_ADMIN_EMAIL.toLowerCase() ||
      cleanEmail === 'jesus@x4sport.app'
    ) {
      setFeedback({
        type: 'error',
        text: 'No es posible eliminar al Administrador Principal del sistema.',
      });
      return;
    }

    const currentUsers = getMergedAuthorizedUsers(state.authorizedUsers);
    const filtered = currentUsers.filter(
      (u) => u.email.toLowerCase() !== cleanEmail,
    );

    if (onUpdateAuthorizedUsers) {
      onUpdateAuthorizedUsers(filtered);
    }

    setFeedback({
      type: 'success',
      text: `Usuario con correo "${targetEmail}" eliminado del sistema.`,
    });
  };

  return (
    <div data-testid="config-view" className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-2.5 text-blue-400 shrink-0">
            <Settings className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Configuración General del ERP
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              Sincronizado en tiempo real con Firebase (<span className="font-mono text-slate-300">configuracion/general</span>) · Administrador:{' '}
              <span className="font-medium text-white">{MAIN_ADMIN_EMAIL}</span>
            </p>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          data-testid="config-feedback"
          className={`flex items-start gap-2 rounded-xl px-4 py-3 text-xs font-medium ${
            feedback.type === 'error'
              ? 'border border-red-500/35 bg-red-500/10 text-red-200'
              : 'border border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Formulario Maestro: Matriz de 4 Capas + Umbrales de Alertas + Identidad de Factura JPG */}
      <form onSubmit={handleSaveGeneralParameters} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 1. Parámetros Matriz de 4 Capas */}
          <section className="space-y-4 rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
                  <Layers className="h-4 w-4 text-blue-400" aria-hidden="true" />
                  Parámetros de Matriz de 4 Capas (%)
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Reglas aplicadas a nuevas ventas y proyecciones financieras sin alterar registros históricos.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRestoreDefaultConfig}
                className="text-[11px] font-semibold text-blue-300 hover:text-white underline shrink-0"
              >
                Restaurar estándar
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="cfg-commission"
                  className="block text-xs font-medium text-slate-300"
                >
                  % Comisión Venta Directa
                </label>
                <input
                  id="cfg-commission"
                  type="number"
                  step="0.01"
                  min="0"
                  max="50"
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(e.target.value)}
                  className="font-mono-num mt-1 w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="cfg-operating"
                  className="block text-xs font-medium text-slate-300"
                >
                  % Fondo Operativo / Ads
                </label>
                <input
                  id="cfg-operating"
                  type="number"
                  step="0.01"
                  min="0"
                  max="50"
                  value={operatingFundPct}
                  onChange={(e) => setOperatingFundPct(e.target.value)}
                  className="font-mono-num mt-1 w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="cfg-growth"
                  className="block text-xs font-medium text-slate-300"
                >
                  % Reinversión Crecimiento
                </label>
                <input
                  id="cfg-growth"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={growthReinvestmentPct}
                  onChange={(e) => setGrowthReinvestmentPct(e.target.value)}
                  className="font-mono-num mt-1 w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  % Reparto Dividendos (Auto)
                </label>
                <div className="font-mono-num mt-1 flex min-h-[40px] items-center rounded-lg border border-slate-800 bg-[#080E1C] px-3 py-1.5 text-sm font-semibold text-emerald-300">
                  {dividendsAutoPct.toFixed(2)}%
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-200">
                  Participación de Dividendos por Socio (%)
                </span>
                <span
                  className={`font-mono-num text-xs font-bold ${
                    Math.abs(partnerSumPct - 100) <= 0.05
                      ? 'text-emerald-400'
                      : 'text-red-400'
                  }`}
                >
                  Total: {partnerSumPct.toFixed(2)}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label
                    htmlFor="cfg-jesus-pct"
                    className="block text-[11px] font-medium text-slate-400"
                  >
                    Jesús (%)
                  </label>
                  <input
                    id="cfg-jesus-pct"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={jesusSharePct}
                    onChange={(e) => setJesusSharePct(e.target.value)}
                    className="font-mono-num mt-1 w-full min-h-[38px] rounded-lg border border-slate-700 bg-[#070D19] px-2.5 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="cfg-josue-pct"
                    className="block text-[11px] font-medium text-slate-400"
                  >
                    Josué (%)
                  </label>
                  <input
                    id="cfg-josue-pct"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={josueSharePct}
                    onChange={(e) => setJosueSharePct(e.target.value)}
                    className="font-mono-num mt-1 w-full min-h-[38px] rounded-lg border border-slate-700 bg-[#070D19] px-2.5 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="cfg-gabriel-pct"
                    className="block text-[11px] font-medium text-slate-400"
                  >
                    Gabriel (%)
                  </label>
                  <input
                    id="cfg-gabriel-pct"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={gabrielSharePct}
                    onChange={(e) => setGabrielSharePct(e.target.value)}
                    className="font-mono-num mt-1 w-full min-h-[38px] rounded-lg border border-slate-700 bg-[#070D19] px-2.5 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* 2. Umbrales de Alertas Operativas */}
          <section className="space-y-4 rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6">
            <div>
              <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
                <BellRing className="h-4 w-4 text-amber-400" aria-hidden="true" />
                Umbrales de Alertas en Tiempo Real
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Controla cuándo se disparan notificaciones de stock crítico, CxC vencidas y retrasos logísticos.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="cfg-low-stock"
                  className="block text-xs font-medium text-slate-300"
                >
                  Stock mínimo crítico (uds)
                </label>
                <input
                  id="cfg-low-stock"
                  type="number"
                  step="1"
                  min="0"
                  max="500"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value)}
                  className="font-mono-num mt-1 w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Alerta modelos/tallas con ≤ {lowStockThreshold || 0} uds.
                </p>
              </div>

              <div>
                <label
                  htmlFor="cfg-cxc-days"
                  className="block text-xs font-medium text-slate-300"
                >
                  Días vencimiento CxC
                </label>
                <input
                  id="cfg-cxc-days"
                  type="number"
                  step="1"
                  min="1"
                  max="365"
                  value={receivableOverdueDays}
                  onChange={(e) => setReceivableOverdueDays(e.target.value)}
                  className="font-mono-num mt-1 w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Alerta créditos sin liquidar &gt; {receivableOverdueDays || 30} días.
                </p>
              </div>

              <div>
                <label
                  htmlFor="cfg-maritime-days"
                  className="block text-xs font-medium text-slate-300"
                >
                  Límite tránsito Marítimo (días)
                </label>
                <input
                  id="cfg-maritime-days"
                  type="number"
                  step="1"
                  min="1"
                  max="365"
                  value={maritimeTransitMaxDays}
                  onChange={(e) => setMaritimeTransitMaxDays(e.target.value)}
                  className="font-mono-num mt-1 w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="cfg-air-days"
                  className="block text-xs font-medium text-slate-300"
                >
                  Límite tránsito Aéreo (días)
                </label>
                <input
                  id="cfg-air-days"
                  type="number"
                  step="1"
                  min="1"
                  max="365"
                  value={airTransitMaxDays}
                  onChange={(e) => setAirTransitMaxDays(e.target.value)}
                  className="font-mono-num mt-1 w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </section>
        </div>

        {/* 3. Identidad de Factura JPG y Marca */}
        <section className="space-y-4 rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
                <Building2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                Identidad de Marca y Factura Digital JPG
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Personaliza el encabezado, logotipo oficial (acepta enlaces compartidos de Google Drive) y mensaje de pie en las facturas JPG emitidas.
              </p>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-[#080E1C] p-2 shrink-0">
              <img
                src={resolvedLogoPreview}
                alt="Vista previa logo tienda"
                className="h-10 w-10 rounded-lg object-cover border border-slate-700 bg-white"
              />
              <div className="text-[11px]">
                <p className="font-bold text-white">{storeName || 'X4SPORT'}</p>
                <p className="text-slate-400 truncate max-w-[140px]">
                  {storeSubtitle || 'INDUMENTARIA DEPORTIVA'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label
                htmlFor="cfg-store-name"
                className="block text-xs font-medium text-slate-300"
              >
                Nombre de la Tienda
              </label>
              <input
                id="cfg-store-name"
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="X4SPORT"
                className="mt-1 w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="cfg-store-subtitle"
                className="block text-xs font-medium text-slate-300"
              >
                Subtítulo / Rubro
              </label>
              <input
                id="cfg-store-subtitle"
                type="text"
                value={storeSubtitle}
                onChange={(e) => setStoreSubtitle(e.target.value)}
                placeholder="INDUMENTARIA DEPORTIVA"
                className="mt-1 w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="cfg-store-location"
                className="block text-xs font-medium text-slate-300"
              >
                Ubicación / Ciudad
              </label>
              <input
                id="cfg-store-location"
                type="text"
                value={storeLocation}
                onChange={(e) => setStoreLocation(e.target.value)}
                placeholder="Guacara, Edo. Carabobo · Venezuela"
                className="mt-1 w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="cfg-logo-url"
                className="block text-xs font-medium text-slate-300"
              >
                URL del Logo Oficial (acepta enlaces de Google Drive)
              </label>
              <input
                id="cfg-logo-url"
                type="text"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="/assets/aistudio/image_992adf2a.jpg o https://drive.google.com/file/d/..."
                className="mt-1 w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="cfg-invoice-footer"
                className="block text-xs font-medium text-slate-300"
              >
                Mensaje al Pie de Factura JPG
              </label>
              <input
                id="cfg-invoice-footer"
                type="text"
                value={invoiceFooterMessage}
                onChange={(e) => setInvoiceFooterMessage(e.target.value)}
                placeholder="Gracias por comprar en X4SPORT"
                className="mt-1 w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
            <span className="text-[11px] text-slate-400">
              {generalConfig.updatedAt
                ? `Última sincronización: ${new Date(
                    generalConfig.updatedAt,
                  ).toLocaleString('es-VE', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}`
                : 'Usando parámetros iniciales estándar'}
            </span>
            <button
              type="submit"
              data-testid="btn-save-general-config"
              disabled={savingGeneral}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {savingGeneral
                ? 'Guardando en Firebase...'
                : 'Guardar Configuración General'}
            </button>
          </div>
        </section>
      </form>

      {/* Gestión de Usuarios y Socios Autorizados (Roles SAP) */}
      <section className="space-y-4 rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
              <Users className="h-4 w-4 text-blue-400" aria-hidden="true" />
              Gestión de Usuarios y Socios Autorizados (Roles SAP)
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Pre-registra nuevos socios y colaboradores. En su primer login verificarán su correo con código OTP y crearán su contraseña personal.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddUserForm((prev) => !prev)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-600/15 px-3 py-1.5 text-xs font-semibold text-blue-200 hover:bg-blue-600/25 hover:text-white transition-colors"
          >
            {showAddUserForm ? (
              <>
                <X className="h-3.5 w-3.5" />
                <span>Cancelar</span>
              </>
            ) : (
              <>
                <UserPlus className="h-3.5 w-3.5" />
                <span>Pre-registrar Usuario</span>
              </>
            )}
          </button>
        </div>

        {showAddUserForm && (
          <form
            onSubmit={handleAddAuthorizedUser}
            className="rounded-xl border border-blue-500/30 bg-[#070D19] p-4 space-y-3"
          >
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              <Plus className="h-3.5 w-3.5 text-blue-400" />
              Pre-registro de Nuevo Usuario ERP
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Carlos Mendoza"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full min-h-[38px] rounded-lg border border-slate-700 bg-[#0D1526] px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Correo Electrónico *
                </label>
                <input
                  type="email"
                  required
                  placeholder="carlos@x4sport.app o gmail"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full min-h-[38px] rounded-lg border border-slate-700 bg-[#0D1526] px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Rol en el ERP
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) =>
                    setNewUserRole(e.target.value as 'partner' | 'admin')
                  }
                  className="w-full min-h-[38px] rounded-lg border border-slate-700 bg-[#0D1526] px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="partner">Socio Operativo</option>
                  <option value="admin">Administrador Secundario</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Teléfono / WhatsApp
                </label>
                <input
                  type="text"
                  placeholder="+58 412-..."
                  value={newUserPhone}
                  onChange={(e) => setNewUserPhone(e.target.value)}
                  className="w-full min-h-[38px] rounded-lg border border-slate-700 bg-[#0D1526] px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="submit"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors shadow-sm"
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>Guardar Pre-registro</span>
              </button>
            </div>
          </form>
        )}

        <div className="rounded-xl border border-slate-800 bg-[#070D19] overflow-hidden">
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/80">
            {authorizedUsersList.map((u) => {
              const isMainAdmin =
                u.email.toLowerCase() === MAIN_ADMIN_EMAIL.toLowerCase();
              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 p-3 hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`h-8 w-8 rounded-lg ${
                        u.avatarBg || 'bg-blue-600'
                      } flex items-center justify-center text-white text-xs font-bold shrink-0`}
                    >
                      {u.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-white truncate">
                          {u.name}
                        </p>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {u.role === 'admin' ? 'Admin' : 'Socio'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        {u.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {u.firstLoginPending ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Primer ingreso pendiente
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        Activo
                      </span>
                    )}

                    {!isMainAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(u.email)}
                        title={`Eliminar acceso a ${u.name}`}
                        aria-label={`Eliminar acceso a ${u.name}`}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Google Calendar + Catálogo Público + Tasas + Respaldos */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <GoogleCalendarBanner
            variant="card"
            authState={calendarAuth}
            onConnect={onConnectGoogleCalendar}
            onDisconnect={onDisconnectGoogleCalendar}
          />

          <section className="space-y-3 rounded-xl border border-slate-800 bg-[#0D1526] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Store className="h-4 w-4 text-blue-400" aria-hidden="true" />
                  Catálogo Público Interactivo (WhatsApp)
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Activa o pausa el enlace público sincronizado en tiempo real con el inventario FIFO.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={catalogEnabled}
                aria-label="Activar catálogo público para clientes"
                data-testid="settings-catalog-switch"
                onClick={() => onToggleCatalogEnabled(!catalogEnabled)}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                  catalogEnabled
                    ? 'border-emerald-400/50 bg-emerald-600'
                    : 'border-slate-600 bg-slate-800'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    catalogEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => void handleCopyCatalogUrl()}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-700 bg-[#080E1C] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white"
              >
                {copiedCatalogUrl ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
                )}
                {copiedCatalogUrl ? '¡Enlace copiado!' : 'Copiar Enlace'}
              </button>

              <button
                type="button"
                onClick={onOpenCatalogAdmin}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-600/15 px-3 py-1.5 text-xs font-semibold text-blue-200 hover:bg-blue-600/25 hover:text-white"
              >
                Gestionar Fotos y Vista Previa
              </button>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="space-y-3 rounded-xl border border-slate-800 bg-[#0D1526] p-5">
            <h2 className="text-sm font-semibold text-white">
              Tasas de Cambio Globales (BCV / USDT)
            </h2>
            <form
              onSubmit={handleSaveRates}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              <div>
                <label
                  htmlFor="settings-bcv"
                  className="block text-xs font-medium text-slate-300"
                >
                  Tasa BCV (Bs/USD)
                </label>
                <input
                  id="settings-bcv"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={bcvInput}
                  onChange={(e) => setBcvInput(e.target.value)}
                  className="font-mono-num mt-1 w-full min-h-[42px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="settings-usdt"
                  className="block text-xs font-medium text-slate-300"
                >
                  Tasa USDT (Bs/USDT)
                </label>
                <input
                  id="settings-usdt"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={usdtInput}
                  onChange={(e) => setUsdtInput(e.target.value)}
                  className="font-mono-num mt-1 w-full min-h-[42px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2 flex flex-wrap gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => void onSyncRatesFromApi()}
                  disabled={rateSync.status === 'loading'}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-700 bg-[#080E1C] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                >
                  <Globe className="h-4 w-4" aria-hidden="true" />
                  {rateSync.status === 'loading'
                    ? 'Sincronizando...'
                    : 'Sincronizar API'}
                </button>
                <button
                  type="submit"
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Guardar Tasas
                </button>
              </div>
            </form>
          </section>

          <section className="space-y-3 rounded-xl border border-slate-800 bg-[#0D1526] p-5">
            <h2 className="text-sm font-semibold text-white">
              Respaldo Excel (.xlsx) y Exportación HTML
            </h2>
            <p className="text-xs text-slate-400">
              Importa tu hoja de cálculo oficial con mapeo automático a Firebase o descarga el paquete autocontenido.
            </p>
            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                data-testid="btn-open-excel-import"
                onClick={onOpenExcelImport}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-600/15 px-4 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-600/25 hover:text-white"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                Sincronizar Excel (.xlsx)
              </button>

              <button
                type="button"
                onClick={() => void handleDownloadStandaloneHtml()}
                disabled={downloadingHtml}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-700 bg-[#080E1C] px-4 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-60"
              >
                <Download className="h-4 w-4 text-blue-400" aria-hidden="true" />
                {downloadingHtml ? 'Generando...' : 'Descargar index.html'}
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Restaurar inventario demo */}
      <section className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">
            Datos de Demostración (176 unidades)
          </h2>
          <p className="text-xs text-slate-400">
            Restaura el catálogo de prueba de 176 franelas si deseas probar ventas o matriz de stock.
          </p>
        </div>
        {!confirmDemoReset ? (
          <button
            type="button"
            onClick={() => setConfirmDemoReset(true)}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-700 bg-[#080E1C] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Restaurar Catálogo Demo
          </button>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onResetDemoData();
                setConfirmDemoReset(false);
                setFeedback({
                  type: 'success',
                  text: 'Catálogo de demostración restaurado en Firebase.',
                });
              }}
              className="min-h-[38px] rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => setConfirmDemoReset(false)}
              className="min-h-[38px] rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
