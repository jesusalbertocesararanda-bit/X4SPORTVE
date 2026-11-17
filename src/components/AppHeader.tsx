import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  Clock,
  Menu,
  Package,
  RotateCcw,
  ShoppingBag,
  X,
} from 'lucide-react';
import type { TabId } from '../types/erp';
import type { OperationalAlert } from '../utils/finance';
import { getUnseenAlertCount } from '../utils/notifications';

interface AppHeaderProps {
  moduleTitle: string;
  alerts: OperationalAlert[];
  seenAlertIds: string[];
  onToggleAlertSeen: (alertId: string) => void;
  onMarkAllAlertsSeen: () => void;
  onOpenMobileSidebar: () => void;
  onStartSale: () => void;
  onNavigateTab: (tab: TabId) => void;
}

export function AppHeader({
  moduleTitle,
  alerts,
  seenAlertIds,
  onToggleAlertSeen,
  onMarkAllAlertsSeen,
  onOpenMobileSidebar,
  onStartSale,
  onNavigateTab,
}: AppHeaderProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <header
      data-testid="app-header"
      className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#080F1E]/95 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            data-testid="btn-mobile-menu"
            onClick={onOpenMobileSidebar}
            aria-label="Abrir menú lateral"
            className="inline-flex lg:hidden min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-800 bg-[#0D1526] text-slate-200 hover:bg-slate-800 shrink-0"
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </button>

          <h2
            data-testid="header-module-title"
            className="font-display truncate text-base font-semibold tracking-tight text-white sm:text-lg"
          >
            {moduleTitle}
          </h2>
        </div>

        {/* ÚNICAMENTE dos botones a la derecha: Hacer Venta y Notificaciones */}
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
            <span>Hacer Venta</span>
          </button>

          <button
            type="button"
            data-testid="btn-header-notifications"
            aria-expanded={notifOpen}
            aria-haspopup="dialog"
            aria-label={
              unseenCount > 0
                ? `Notificaciones (${unseenCount} no vistas)`
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
              className="absolute right-0 top-12 z-50 w-[330px] sm:w-[410px] rounded-xl border border-slate-700 bg-[#0D1526] shadow-2xl overflow-hidden"
            >
              <div className="flex items-start justify-between gap-2 border-b border-slate-800 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">
                      Alertas del Sistema
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
                          ? `${unseenCount} sin ver`
                          : 'Todas vistas'}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Stock bajo (&lt; 5 uds) y retrasos en tránsito · Tacha para marcar vista
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
                    Marcar todas como vistas
                  </button>
                </div>
              )}

              {alerts.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Sin alertas pendientes. Todos los modelos tienen stock ≥ 5 unidades y los envíos están dentro del plazo.
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
                            : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onNavigateTab(alert.targetTab);
                            setNotifOpen(false);
                          }}
                          className="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                        >
                          {alert.kind === 'transit_delay' ? (
                            <Clock
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
                            <p
                              className={`text-xs font-semibold ${
                                isSeen
                                  ? 'line-through text-slate-400'
                                  : 'text-white'
                              }`}
                            >
                              {alert.title}
                            </p>
                            <p
                              className={`mt-0.5 text-[11px] ${
                                isSeen
                                  ? 'line-through text-slate-500'
                                  : 'text-red-300'
                              }`}
                            >
                              {alert.description}
                            </p>
                            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-blue-300">
                              <Package className="h-3 w-3" aria-hidden="true" />
                              Ir a{' '}
                              {alert.targetTab === 'compras'
                                ? 'Compras'
                                : 'Inventario'}
                            </span>
                          </div>
                        </button>

                        <button
                          type="button"
                          data-testid={`btn-toggle-alert-${alert.id}`}
                          aria-pressed={isSeen}
                          aria-label={
                            isSeen
                              ? `Desmarcar "${alert.title}" como no vista`
                              : `Tachar "${alert.title}" y marcar como vista`
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
                              <span>Vista</span>
                            </>
                          ) : (
                            <>
                              <Check className="h-3 w-3" aria-hidden="true" />
                              <span>Tachar</span>
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
