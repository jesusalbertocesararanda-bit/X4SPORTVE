import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  Clock,
  CreditCard,
  Menu,
  Package,
  RotateCcw,
  ShoppingBag,
  X,
} from 'lucide-react';
import type { AlertThresholdsConfig, SubModuleId } from '../types/erp';
import type { OperationalAlert } from '../utils/finance';
import { getUnseenAlertCount } from '../utils/notifications';

interface AppHeaderProps {
  moduleLabel: string;
  subModuleLabel?: string;
  alerts: OperationalAlert[];
  alertThresholds: AlertThresholdsConfig;
  seenAlertIds: string[];
  onToggleAlertSeen: (alertId: string) => void;
  onMarkAllAlertsSeen: () => void;
  onOpenMobileSidebar: () => void;
  onStartSale: () => void;
  onNavigateAlert: (alert: OperationalAlert) => void;
}

export function AppHeader({
  moduleLabel,
  subModuleLabel,
  alerts,
  alertThresholds,
  seenAlertIds,
  onToggleAlertSeen,
  onMarkAllAlertsSeen,
  onOpenMobileSidebar,
  onStartSale,
  onNavigateAlert,
}: AppHeaderProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Auto-hide topbar on scroll down, show immediately on scroll up
  useEffect(() => {
    const handleScroll = () => {
      if (notifOpen) {
        setIsVisible(true);
        return;
      }
      const currentY = window.scrollY;
      const lastY = lastScrollYRef.current;

      if (currentY <= 40) {
        setIsVisible(true);
      } else if (currentY > lastY + 8) {
        setIsVisible(false);
      } else if (currentY < lastY - 8) {
        setIsVisible(true);
      }
      lastScrollYRef.current = currentY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [notifOpen]);

  // Reset visible when route changes
  useEffect(() => {
    setIsVisible(true);
  }, [moduleLabel, subModuleLabel]);

  useEffect(() => {
    if (!notifOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setNotifOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [notifOpen]);

  const seenSet = new Set(seenAlertIds);
  const unseenCount = getUnseenAlertCount(alerts, seenAlertIds);

  const getAlertDestinationLabel = (alert: OperationalAlert): string => {
    const sub: SubModuleId | undefined = alert.targetSubModule;
    if (sub === 'ventas-cxc' || alert.kind === 'overdue_receivable') {
      return 'Ir a Ventas > CxC';
    }
    if (sub === 'compras-transito' || alert.kind === 'transit_delay') {
      return 'Ir a Compras > Pedidos en Tránsito';
    }
    return 'Ir a Inventario > Stock Disponible';
  };

  return (
    <header
      data-testid="app-header"
      data-visible={isVisible ? 'true' : 'false'}
      className={`sticky top-0 z-30 border-b border-slate-800/90 bg-[#080F1E]/95 backdrop-blur-md transition-transform duration-300 ${
        isVisible ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        {/* Izquierda: toggle móvil + breadcrumb dinámico */}
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            data-testid="btn-mobile-menu"
            onClick={onOpenMobileSidebar}
            aria-label="Abrir menú lateral"
            className="inline-flex lg:hidden min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-800 bg-[#0D1526] text-slate-200 hover:bg-slate-800 shrink-0"
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </button>

          <nav
            aria-label="Ruta actual"
            data-testid="header-module-title"
            className="flex min-w-0 items-center gap-1.5 text-sm sm:text-base"
          >
            <span
              className={`font-display truncate tracking-tight ${
                subModuleLabel
                  ? 'font-medium text-slate-400'
                  : 'font-semibold text-white'
              }`}
            >
              {moduleLabel}
            </span>
            {subModuleLabel && (
              <>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-slate-600"
                  aria-hidden="true"
                />
                <span className="font-display truncate font-semibold tracking-tight text-white">
                  {subModuleLabel}
                </span>
              </>
            )}
          </nav>
        </div>

        {/* Derecha: ÚNICAMENTE dos botones: Nueva Venta y Notificaciones */}
        <div
          ref={popoverRef}
          className="relative flex items-center gap-2.5 shrink-0"
        >
          <button
            type="button"
            data-testid="btn-header-make-sale"
            onClick={onStartSale}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 active:scale-[0.98] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <ShoppingBag className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Nueva Venta</span>
          </button>

          <button
            type="button"
            data-testid="btn-header-notifications"
            aria-expanded={notifOpen}
            aria-haspopup="dialog"
            aria-label={
              unseenCount > 0
                ? `Notificaciones (${unseenCount} no leídas)`
                : 'Notificaciones (sin alertas pendientes)'
            }
            onClick={() => setNotifOpen((prev) => !prev)}
            className={`relative inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
              unseenCount > 0
                ? 'border-red-500/45 bg-red-500/10 text-red-200 hover:bg-red-500/20'
                : 'border-slate-700 bg-[#0D1526] text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Bell className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Notificaciones</span>
            {unseenCount > 0 && (
              <span
                data-testid="notifications-badge"
                className="font-mono-num inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white"
              >
                {unseenCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div
              role="dialog"
              aria-label="Centro de alertas operativas"
              data-testid="notifications-popover"
              className="absolute right-0 top-12 z-50 w-[330px] sm:w-[420px] rounded-xl border border-slate-700 bg-[#0D1526] shadow-2xl overflow-hidden"
            >
              <div className="flex items-start justify-between gap-2 border-b border-slate-800 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">
                      Notificaciones en Tiempo Real
                    </h3>
                    {alerts.length > 0 && (
                      <span
                        data-testid="notifications-unseen-summary"
                        className={`font-mono-num rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                          unseenCount > 0
                            ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {unseenCount > 0
                          ? `${unseenCount} sin leer`
                          : 'Todas leídas'}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Stock (≤{alertThresholds.lowStockThreshold}), CxC (&gt;
                    {alertThresholds.receivableOverdueDays}d) y Tránsito (M&gt;
                    {alertThresholds.maritimeTransitMaxDays}d / A&gt;
                    {alertThresholds.airTransitMaxDays}d)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  aria-label="Cerrar notificaciones"
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white shrink-0"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {alerts.length > 0 && unseenCount > 0 && (
                <div className="flex items-center justify-end border-b border-slate-800/80 bg-[#080E1C] px-4 py-1.5">
                  <button
                    type="button"
                    data-testid="btn-mark-all-alerts-seen"
                    onClick={onMarkAllAlertsSeen}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-blue-300 transition-colors hover:bg-blue-500/15 hover:text-white"
                  >
                    <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Marcar todas como leídas
                  </button>
                </div>
              )}

              {alerts.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Sin alertas pendientes. Stock, Cuentas por Cobrar y envíos están dentro de los umbrales configurados.
                </div>
              ) : (
                <ul className="max-h-80 divide-y divide-slate-800/80 overflow-y-auto">
                  {alerts.map((alert) => {
                    const isSeen = seenSet.has(alert.id);
                    return (
                      <li
                        key={alert.id}
                        data-seen={isSeen ? 'true' : 'false'}
                        className={`flex items-start gap-2 px-3 py-2.5 transition-colors ${
                          isSeen
                            ? 'bg-[#070C17]/80 opacity-65'
                            : 'bg-blue-950/15 hover:bg-slate-800/40'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (!isSeen) {
                              onToggleAlertSeen(alert.id);
                            }
                            onNavigateAlert(alert);
                            setNotifOpen(false);
                          }}
                          className="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                        >
                          {alert.kind === 'transit_delay' ? (
                            <Clock
                              className={`mt-0.5 h-4 w-4 shrink-0 ${
                                isSeen ? 'text-slate-500' : 'text-amber-400'
                              }`}
                              aria-hidden="true"
                            />
                          ) : alert.kind === 'overdue_receivable' ? (
                            <CreditCard
                              className={`mt-0.5 h-4 w-4 shrink-0 ${
                                isSeen ? 'text-slate-500' : 'text-red-400'
                              }`}
                              aria-hidden="true"
                            />
                          ) : (
                            <AlertTriangle
                              className={`mt-0.5 h-4 w-4 shrink-0 ${
                                isSeen ? 'text-slate-500' : 'text-red-400'
                              }`}
                              aria-hidden="true"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {!isSeen && (
                                <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                              )}
                              <p
                                className={`text-xs font-semibold truncate ${
                                  isSeen ? 'text-slate-400' : 'text-white'
                                }`}
                              >
                                {alert.title}
                              </p>
                            </div>
                            <p
                              className={`mt-0.5 text-[11px] ${
                                isSeen ? 'text-slate-500' : 'text-red-300'
                              }`}
                            >
                              {alert.description}
                            </p>
                            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-blue-300">
                              <Package className="h-3 w-3" aria-hidden="true" />
                              {getAlertDestinationLabel(alert)}
                            </span>
                          </div>
                        </button>

                        <button
                          type="button"
                          data-testid={`btn-toggle-alert-${alert.id}`}
                          aria-pressed={isSeen}
                          aria-label={
                            isSeen
                              ? `Marcar "${alert.title}" como no leída`
                              : `Marcar "${alert.title}" como leída`
                          }
                          onClick={() => onToggleAlertSeen(alert.id)}
                          className={`mt-1 inline-flex min-h-[30px] shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                            isSeen
                              ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:bg-slate-800 hover:text-slate-200'
                              : 'border-slate-700 bg-[#080E1C] text-slate-300 hover:border-blue-500/50 hover:bg-blue-600/20 hover:text-white'
                          }`}
                        >
                          {isSeen ? (
                            <>
                              <RotateCcw className="h-3 w-3" aria-hidden="true" />
                              <span>Leída</span>
                            </>
                          ) : (
                            <>
                              <Check className="h-3 w-3" aria-hidden="true" />
                              <span>Leer</span>
                            </>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
