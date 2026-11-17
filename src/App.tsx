import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { AppHeader } from './components/AppHeader';
import { AuditView } from './components/AuditView';
import { BulkImportView } from './components/BulkImportView';
import { CatalogAdminView } from './components/CatalogAdminView';
import { DashboardView } from './components/DashboardView';
import { ExcelImportModal } from './components/ExcelImportModal';
import { FinanceView } from './components/FinanceView';
import { InventoryView } from './components/InventoryView';
import { PublicCatalogView } from './components/PublicCatalogView';
import { PurchasesView } from './components/PurchasesView';
import { ReportsView } from './components/ReportsView';
import { ReturnsView } from './components/ReturnsView';
import { SalesView } from './components/SalesView';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar } from './components/Sidebar';
import { StatsView } from './components/StatsView';
import { SupplierPriceHistoryView } from './components/SupplierPriceHistoryView';
import { createInitialState } from './data/initialState';
import type {
  AppState,
  PartnerName,
  PaymentMethod,
  PurchaseBatchRecord,
  SaleRecord,
  TabId,
} from './types/erp';
import { fetchVenezuelaExchangeRates } from './utils/exchangeRatesApi';
import {
  adjustInventoryPhysicalCount,
  applyAuditAdjustments,
  attachPurchaseBatchCalendarMetadata,
  attachSaleCalendarMetadata,
  collectReceivable,
  createImportOrder,
  getActiveOperationalAlerts,
  processReturnOrExchange,
  receiveImportBatch,
  reconcileCashOnHand,
  recoverStartupErpState,
  registerCapitalInjection,
  registerMultiItemSale,
  registerOperatingExpense,
  reinvestPartnerDividends,
  round2,
  updateExchangeRates,
  upsertCustomerProfile,
} from './utils/finance';
import {
  clearCachedCalendarAccessToken,
  initGoogleCalendarAuth,
  signInWithGoogleCalendar,
  signOutGoogleCalendar,
  type GoogleCalendarAuthState,
} from './utils/googleCalendar';
import type {
  ActionResult,
  AdjustInventoryCountInput,
  ApplyAuditAdjustmentsInput,
  ProcessReturnExchangeInput,
  ReceiveImportBatchInput,
  ReconcileCashInput,
  RegisterCapitalInjectionInput,
  RegisterImportBatchInput,
  RegisterMultiSaleInput,
  RegisterOperatingExpenseInput,
  UpsertCustomerInput,
} from './utils/finance';
import {
  markAllAlertsSeenIds,
  toggleAlertSeenId,
} from './utils/notifications';
import {
  formatFirebaseError,
  purgeAllDataInFirebase,
  readLocalStorageRecoveryCandidates,
  resetBaselineStateInFirebase,
  resetErpStateInFirebase,
  saveLocalStateBackup,
  subscribeErpState,
  writeErpState,
  writeExchangeRatesOnly,
} from './utils/firebaseRealtime';
import { isPublicCatalogModeFromLocation } from './utils/publicCatalog';

export interface RateSyncInfo {
  status: 'idle' | 'loading' | 'synced' | 'error';
  message?: string;
}

const MODULE_TITLES: Record<TabId, string> = {
  dashboard: 'Panel Principal',
  ventas: 'Ventas y Facturación Digital',
  devoluciones: 'Devoluciones y Cambios',
  compras: 'Compras y Recepción de Mercancía',
  inventario: 'Inventario y Stock Base',
  auditoria: 'Auditoría Física de Inventario',
  finanzas: 'Finanzas, Caja y Cuentas por Cobrar',
  estadisticas: 'Estadísticas y Comisiones',
  reportes: 'Reportes Consolidados Avanzados',
  cargas: 'Cargas Masivas de Datos (.xlsx)',
  'historial-precios': 'Historial de Precios y Proveedores',
  catalogo: 'Catálogo Público para Clientes',
};

export default function App() {
  const [state, setState] = useState<AppState>(() => {
    const { state: initialRecovered } = recoverStartupErpState(
      createInitialState(),
      readLocalStorageRecoveryCandidates(),
    );
    return initialRecovered;
  });
  const [isHydratingDb, setIsHydratingDb] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [rateSync, setRateSync] = useState<RateSyncInfo>({ status: 'idle' });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isPublicCatalogRoute, setIsPublicCatalogRoute] = useState<boolean>(() =>
    isPublicCatalogModeFromLocation(),
  );
  const [isCatalogPreview, setIsCatalogPreview] = useState(false);
  const [calendarAuth, setCalendarAuth] = useState<GoogleCalendarAuthState>({
    isConnected: false,
    needsAuth: true,
    isConnecting: false,
  });
  const [localSeenAlertIds, setLocalSeenAlertIds] = useState<string[]>(() => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return [];
      const raw = window.localStorage.getItem('x4sport_seen_alerts_v1');
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : [];
    } catch {
      return [];
    }
  });

  // Inicializar listener de autenticación de Google Calendar (token solo en memoria)
  useEffect(() => {
    const unsubscribe = initGoogleCalendarAuth(
      (user) => {
        setCalendarAuth({
          isConnected: true,
          needsAuth: false,
          isConnecting: false,
          userEmail: user.email ?? undefined,
          userName: user.displayName ?? undefined,
        });
      },
      () => {
        setCalendarAuth((prev) => ({
          isConnected: false,
          needsAuth: true,
          isConnecting: false,
          error: prev.error,
        }));
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const syncPublicRoute = () => {
      setIsPublicCatalogRoute(isPublicCatalogModeFromLocation());
    };
    window.addEventListener('popstate', syncPublicRoute);
    window.addEventListener('hashchange', syncPublicRoute);
    return () => {
      window.removeEventListener('popstate', syncPublicRoute);
      window.removeEventListener('hashchange', syncPublicRoute);
    };
  }, []);

  const handleConnectGoogleCalendar = useCallback(async (): Promise<boolean> => {
    setCalendarAuth((prev) => ({
      ...prev,
      isConnecting: true,
      error: undefined,
    }));
    try {
      const { user } = await signInWithGoogleCalendar();
      setCalendarAuth({
        isConnected: true,
        needsAuth: false,
        isConnecting: false,
        userEmail: user.email ?? undefined,
        userName: user.displayName ?? undefined,
      });
      return true;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo completar el inicio de sesión con Google.';
      setCalendarAuth({
        isConnected: false,
        needsAuth: true,
        isConnecting: false,
        error: message,
      });
      return false;
    }
  }, []);

  const handleDisconnectGoogleCalendar = useCallback(async (): Promise<void> => {
    await signOutGoogleCalendar();
    setCalendarAuth({
      isConnected: false,
      needsAuth: true,
      isConnecting: false,
    });
  }, []);

  const handleCalendarAuthExpired = useCallback(() => {
    clearCachedCalendarAccessToken();
    setCalendarAuth({
      isConnected: false,
      needsAuth: true,
      isConnecting: false,
    });
  }, []);

  // Suscripción en tiempo real (onValue) a Firebase RTDB con blindaje anti-borrado de localStorage
  useEffect(() => {
    const unsubscribe = subscribeErpState(
      (remoteState) => {
        setState(remoteState);
        setIsHydratingDb(false);
        setDbError(null);
      },
      (errorMessage) => {
        setIsHydratingDb(false);
        setDbError(errorMessage);
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const commitState = useCallback(
    (
      res: ActionResult,
    ): {
      ok: boolean;
      error?: string;
      createdSale?: SaleRecord;
      createdBatch?: PurchaseBatchRecord;
    } => {
      if (!res.ok) {
        return { ok: false, error: res.error };
      }

      setState(res.state);
      saveLocalStateBackup(res.state, { allowOverwriteEmpty: true });
      void writeErpState(res.state)
        .then(() => {
          setDbError(null);
        })
        .catch((err: unknown) => {
          setDbError(formatFirebaseError(err));
        });

      return {
        ok: true,
        createdSale: res.createdSale,
        createdBatch: res.createdBatch,
      };
    },
    [],
  );

  const hasBootRateSyncRef = useRef(false);
  const latestRateSourceRef = useRef(state.exchangeRates.source);
  latestRateSourceRef.current = state.exchangeRates.source;

  const syncRatesFromApi = useCallback(async () => {
    setRateSync({ status: 'loading', message: 'Consultando tasas BCV / USDT...' });
    const result = await fetchVenezuelaExchangeRates();
    if (result.ok && result.bcv && result.usdt) {
      const cleanBcv = round2(result.bcv);
      const cleanUsdt = round2(result.usdt);
      const nextRates: AppState['exchangeRates'] = {
        bcv: cleanBcv,
        usdt: cleanUsdt,
        updatedAt: new Date().toISOString(),
        source: 'api',
      };

      setState((prev) => ({
        ...prev,
        exchangeRates: nextRates,
      }));

      void writeExchangeRatesOnly(nextRates)
        .then(() => setDbError(null))
        .catch((err: unknown) => {
          setDbError(formatFirebaseError(err));
        });

      setRateSync({
        status: 'synced',
        message: `Tasas sincronizadas vía ${result.providerLabel ?? 'API pública'}.`,
      });
      return { ok: true, bcv: cleanBcv, usdt: cleanUsdt };
    }

    setRateSync({
      status: 'error',
      message:
        result.error ??
        'No se pudo sincronizar automáticamente; usando tasas guardadas.',
    });
    return { ok: false, error: result.error };
  }, []);

  // Esperar a que Firebase entregue el estado inicial antes de sincronizar tasas en vivo
  // (No sobrescribir tasas reales importadas desde Excel ni ajustes manuales)
  useEffect(() => {
    if (isHydratingDb || hasBootRateSyncRef.current) return;
    hasBootRateSyncRef.current = true;

    const currentSource = latestRateSourceRef.current;
    if (currentSource === 'excel' || currentSource === 'manual') {
      setRateSync({
        status: 'idle',
        message:
          currentSource === 'excel'
            ? 'Usando Tasa USDT importada desde Excel.'
            : 'Usando ajuste manual guardado.',
      });
      return;
    }

    let active = true;
    setRateSync({ status: 'loading', message: 'Consultando tasas BCV / USDT...' });

    void fetchVenezuelaExchangeRates().then((result) => {
      if (!active) return;
      if (result.ok && result.bcv && result.usdt) {
        const cleanBcv = round2(result.bcv);
        const cleanUsdt = round2(result.usdt);
        const nextRates: AppState['exchangeRates'] = {
          bcv: cleanBcv,
          usdt: cleanUsdt,
          updatedAt: new Date().toISOString(),
          source: 'api',
        };

        setState((prev) => {
          if (
            prev.exchangeRates.bcv === cleanBcv &&
            prev.exchangeRates.usdt === cleanUsdt
          ) {
            return prev;
          }
          return {
            ...prev,
            exchangeRates: nextRates,
          };
        });

        void writeExchangeRatesOnly(nextRates).catch((err: unknown) => {
          if (!active) return;
          setDbError(formatFirebaseError(err));
        });

        setRateSync({
          status: 'synced',
          message: `Tasas sincronizadas vía ${result.providerLabel ?? 'API pública'}.`,
        });
      } else {
        setRateSync({
          status: 'error',
          message:
            result.error ??
            'Sin respuesta de API pública; puedes editar las tasas manualmente.',
        });
      }
    });

    return () => {
      active = false;
    };
  }, [isHydratingDb]);

  const activeAlerts = useMemo(
    () => getActiveOperationalAlerts(state),
    [state],
  );

  const effectiveSeenAlertIds = useMemo(() => {
    const merged = new Set<string>([
      ...localSeenAlertIds,
      ...(state.seenAlertIds ?? []),
    ]);
    return Array.from(merged);
  }, [localSeenAlertIds, state.seenAlertIds]);

  const persistSeenAlerts = (nextIds: string[]) => {
    setLocalSeenAlertIds(nextIds);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          'x4sport_seen_alerts_v1',
          JSON.stringify(nextIds),
        );
      }
    } catch {
      // Ignore storage quota errors
    }
    commitState({
      ok: true,
      state: {
        ...state,
        seenAlertIds: nextIds,
      },
    });
  };

  const handleToggleAlertSeen = (alertId: string) => {
    const nextIds = toggleAlertSeenId(effectiveSeenAlertIds, alertId);
    persistSeenAlerts(nextIds);
  };

  const handleMarkAllAlertsSeen = () => {
    const nextIds = markAllAlertsSeenIds(effectiveSeenAlertIds, activeAlerts);
    persistSeenAlerts(nextIds);
  };

  const handleUpdateRates = (bcv: number, usdt: number) => {
    const res = updateExchangeRates(state, bcv, usdt, 'manual');
    if (res.ok) {
      setState(res.state);
      saveLocalStateBackup(res.state, { allowOverwriteEmpty: true });
      void writeExchangeRatesOnly(res.state.exchangeRates)
        .then(() => setDbError(null))
        .catch((err: unknown) => setDbError(formatFirebaseError(err)));
      setRateSync({
        status: 'idle',
        message: 'Ajuste manual guardado.',
      });
    }
    return { ok: res.ok, error: res.error };
  };

  const handleRegisterMultiSale = (input: RegisterMultiSaleInput) =>
    commitState(registerMultiItemSale(state, input));

  const handleSaveCustomerProfile = (input: UpsertCustomerInput) =>
    commitState(upsertCustomerProfile(state, input));

  const handleRegisterImportBatch = (input: RegisterImportBatchInput) =>
    commitState(createImportOrder(state, input));

  const handleReceiveImportBatch = (input: ReceiveImportBatchInput) =>
    commitState(receiveImportBatch(state, input));

  const handleCollectReceivable = (
    receivableId: string,
    paymentMethod: PaymentMethod,
    amountPaid?: number,
  ) =>
    commitState(
      collectReceivable(state, receivableId, paymentMethod, amountPaid),
    );

  const handleReinvestDividends = (partner: PartnerName) =>
    commitState(reinvestPartnerDividends(state, partner));

  const handleRegisterOperatingExpense = (
    input: RegisterOperatingExpenseInput,
  ) => commitState(registerOperatingExpense(state, input));

  const handleRegisterCapitalInjection = (
    input: RegisterCapitalInjectionInput,
  ) => commitState(registerCapitalInjection(state, input));

  const handleReconcileCash = (input: ReconcileCashInput) =>
    commitState(reconcileCashOnHand(state, input));

  const handleAdjustInventoryCount = (input: AdjustInventoryCountInput) =>
    commitState(adjustInventoryPhysicalCount(state, input));

  const handleApplyAuditAdjustments = (input: ApplyAuditAdjustmentsInput) =>
    commitState(applyAuditAdjustments(state, input));

  const handleProcessReturnOrExchange = (input: ProcessReturnExchangeInput) =>
    commitState(processReturnOrExchange(state, input));

  const handleAttachSaleCalendarMetadata = useCallback(
    (saleId: string, eventId: string, htmlLink?: string) => {
      setState((prev) => {
        const next = attachSaleCalendarMetadata(prev, saleId, eventId, htmlLink);
        saveLocalStateBackup(next, { allowOverwriteEmpty: true });
        void writeErpState(next).catch((err: unknown) => {
          setDbError(formatFirebaseError(err));
        });
        return next;
      });
    },
    [],
  );

  const handleAttachPurchaseCalendarMetadata = useCallback(
    (batchId: string, eventId: string, htmlLink?: string) => {
      setState((prev) => {
        const next = attachPurchaseBatchCalendarMetadata(
          prev,
          batchId,
          eventId,
          htmlLink,
        );
        saveLocalStateBackup(next, { allowOverwriteEmpty: true });
        void writeErpState(next).catch((err: unknown) => {
          setDbError(formatFirebaseError(err));
        });
        return next;
      });
    },
    [],
  );

  const handleResetBaselineData = () => {
    void resetBaselineStateInFirebase()
      .then((fresh) => {
        setState(fresh);
        setDbError(null);
      })
      .catch((err: unknown) => {
        setDbError(formatFirebaseError(err));
      });
  };

  const handleResetDemoData = () => {
    void resetErpStateInFirebase()
      .then((fresh) => {
        setState(fresh);
        setDbError(null);
      })
      .catch((err: unknown) => {
        setDbError(formatFirebaseError(err));
      });
  };

  const handleApplyImportedState = async (nextState: AppState) => {
    const cleanNext: AppState = {
      ...nextState,
      userPurgedEmpty: false,
      isExplicitDemo: false,
    };
    saveLocalStateBackup(cleanNext, { allowOverwriteEmpty: true });
    setState(cleanNext);
    await writeErpState(cleanNext);
    setDbError(null);
  };

  const handlePurgeGhostData = async () => {
    const clean = await purgeAllDataInFirebase(
      state.exchangeRates.bcv,
      state.exchangeRates.usdt,
      state.exchangeRates.source,
    );
    setState(clean);
    setDbError(null);
  };

  const handleToggleCatalogEnabled = useCallback((enabled: boolean) => {
    setState((prev) => {
      const next: AppState = {
        ...prev,
        catalogEnabled: enabled,
      };
      saveLocalStateBackup(next, { allowOverwriteEmpty: true });
      void writeErpState(next).catch((err: unknown) => {
        setDbError(formatFirebaseError(err));
      });
      return next;
    });
  }, []);

  const handleSaveCatalogPhoto = useCallback(
    (modelKey: string, photoUrl: string) => {
      if (!modelKey || !photoUrl) return;
      setState((prev) => {
        const next: AppState = {
          ...prev,
          catalogPhotos: {
            ...(prev.catalogPhotos ?? {}),
            [modelKey]: photoUrl,
          },
        };
        saveLocalStateBackup(next, { allowOverwriteEmpty: true });
        void writeErpState(next).catch((err: unknown) => {
          setDbError(formatFirebaseError(err));
        });
        return next;
      });
    },
    [],
  );

  const handleRemoveCatalogPhoto = useCallback((modelKey: string) => {
    if (!modelKey) return;
    setState((prev) => {
      const updated = { ...(prev.catalogPhotos ?? {}) };
      delete updated[modelKey];
      const next: AppState = {
        ...prev,
        catalogPhotos: updated,
      };
      saveLocalStateBackup(next, { allowOverwriteEmpty: true });
      void writeErpState(next).catch((err: unknown) => {
        setDbError(formatFirebaseError(err));
      });
      return next;
    });
  }, []);

  const handleSaveCatalogKeywords = useCallback(
    (modelKey: string, keywords: string) => {
      if (!modelKey) return;
      setState((prev) => {
        const updated = { ...(prev.catalogKeywords ?? {}) };
        const trimmed = keywords.trim();
        if (trimmed) {
          updated[modelKey] = trimmed;
        } else {
          delete updated[modelKey];
        }
        const next: AppState = {
          ...prev,
          catalogKeywords: updated,
        };
        saveLocalStateBackup(next, { allowOverwriteEmpty: true });
        void writeErpState(next).catch((err: unknown) => {
          setDbError(formatFirebaseError(err));
        });
        return next;
      });
    },
    [],
  );

  if (isPublicCatalogRoute || isCatalogPreview) {
    if (isPublicCatalogRoute && isHydratingDb) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#060B16] p-6 text-center text-slate-100">
          <Loader2
            className="h-8 w-8 animate-spin text-blue-400"
            aria-hidden="true"
          />
          <p className="font-display text-base font-semibold text-white">
            Cargando Catálogo Oficial X4SPORT...
          </p>
        </div>
      );
    }

    return (
      <PublicCatalogView
        state={state}
        isPreviewMode={isCatalogPreview && !isPublicCatalogRoute}
        onExitPreview={() => setIsCatalogPreview(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#060B16] text-slate-100 flex">
      <Sidebar
        activeTab={activeTab}
        isCollapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onSelectTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          moduleTitle={MODULE_TITLES[activeTab]}
          alerts={activeAlerts}
          seenAlertIds={effectiveSeenAlertIds}
          onToggleAlertSeen={handleToggleAlertSeen}
          onMarkAllAlertsSeen={handleMarkAllAlertsSeen}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          onStartSale={() => setActiveTab('ventas')}
          onNavigateTab={setActiveTab}
        />

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {dbError && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-2.5 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
              <span>{dbError}</span>
            </div>
          )}

          {isHydratingDb ? (
            <div
              className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-slate-800 bg-[#0D1526] p-8 text-center"
              role="status"
            >
              <Loader2 className="h-7 w-7 animate-spin text-blue-400" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-200">
                Cargando datos sincronizados de X4SPORT...
              </p>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  state={state}
                  rateSync={rateSync}
                  onSyncRatesFromApi={syncRatesFromApi}
                  onUpdateRates={handleUpdateRates}
                  onNavigate={setActiveTab}
                />
              )}

              {activeTab === 'ventas' && (
                <SalesView
                  state={state}
                  calendarAuth={calendarAuth}
                  onConnectGoogleCalendar={handleConnectGoogleCalendar}
                  onDisconnectGoogleCalendar={handleDisconnectGoogleCalendar}
                  onCalendarAuthExpired={handleCalendarAuthExpired}
                  onAttachSaleCalendarMetadata={handleAttachSaleCalendarMetadata}
                  onRegisterMultiSale={handleRegisterMultiSale}
                  onSaveCustomerProfile={handleSaveCustomerProfile}
                />
              )}

              {activeTab === 'devoluciones' && (
                <ReturnsView
                  state={state}
                  onProcessReturnOrExchange={handleProcessReturnOrExchange}
                />
              )}

              {activeTab === 'inventario' && (
                <InventoryView
                  state={state}
                />
              )}

              {activeTab === 'auditoria' && (
                <AuditView
                  state={state}
                  onApplyAuditAdjustments={handleApplyAuditAdjustments}
                  onAdjustInventoryCount={handleAdjustInventoryCount}
                />
              )}

              {activeTab === 'compras' && (
                <PurchasesView
                  state={state}
                  calendarAuth={calendarAuth}
                  onConnectGoogleCalendar={handleConnectGoogleCalendar}
                  onDisconnectGoogleCalendar={handleDisconnectGoogleCalendar}
                  onCalendarAuthExpired={handleCalendarAuthExpired}
                  onAttachPurchaseCalendarMetadata={
                    handleAttachPurchaseCalendarMetadata
                  }
                  onSaveCatalogPhoto={handleSaveCatalogPhoto}
                  onRegisterImportBatch={handleRegisterImportBatch}
                  onReceiveImportBatch={handleReceiveImportBatch}
                />
              )}

              {activeTab === 'finanzas' && (
                <FinanceView
                  state={state}
                  onCollectReceivable={handleCollectReceivable}
                  onReinvestDividends={handleReinvestDividends}
                  onRegisterOperatingExpense={handleRegisterOperatingExpense}
                  onRegisterCapitalInjection={handleRegisterCapitalInjection}
                  onReconcileCash={handleReconcileCash}
                  onResetDemoData={handleResetBaselineData}
                />
              )}

              {activeTab === 'estadisticas' && <StatsView state={state} />}
              {activeTab === 'reportes' && <ReportsView state={state} />}
              {activeTab === 'cargas' && (
                <BulkImportView
                  state={state}
                  onApplyImportedState={handleApplyImportedState}
                />
              )}
              {activeTab === 'historial-precios' && (
                <SupplierPriceHistoryView state={state} />
              )}
              {activeTab === 'catalogo' && (
                <CatalogAdminView
                  state={state}
                  onToggleCatalogEnabled={handleToggleCatalogEnabled}
                  onSaveCatalogPhoto={handleSaveCatalogPhoto}
                  onRemoveCatalogPhoto={handleRemoveCatalogPhoto}
                  onSaveCatalogKeywords={handleSaveCatalogKeywords}
                  onOpenCatalogPreview={() => setIsCatalogPreview(true)}
                />
              )}
            </>
          )}
        </main>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        state={state}
        rateSync={rateSync}
        calendarAuth={calendarAuth}
        onConnectGoogleCalendar={handleConnectGoogleCalendar}
        onDisconnectGoogleCalendar={handleDisconnectGoogleCalendar}
        onToggleCatalogEnabled={handleToggleCatalogEnabled}
        onOpenCatalogAdmin={() => setActiveTab('catalogo')}
        onClose={() => setIsSettingsOpen(false)}
        onOpenExcelImport={() => setIsExcelModalOpen(true)}
        onSyncRatesFromApi={syncRatesFromApi}
        onUpdateRates={handleUpdateRates}
        onResetDemoData={handleResetDemoData}
      />

      <ExcelImportModal
        isOpen={isExcelModalOpen}
        currentRates={state.exchangeRates}
        onClose={() => setIsExcelModalOpen(false)}
        onApplyImportedState={handleApplyImportedState}
        onPurgeGhostData={handlePurgeGhostData}
      />
    </div>
  );
}
