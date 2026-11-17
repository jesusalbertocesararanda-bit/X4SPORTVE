import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Clock,
  Menu,
  Package,
  ShoppingBag,
  X,
} from 'lucide-react';
import type { TabId } from '../types/erp';
import type { OperationalAlert } from '../utils/finance';

interface AppHeaderProps {
  moduleTitle: string;
  alerts: OperationalAlert[];
  onOpenMobileSidebar: () => void;
  onStartSale: () => void;
  onNavigateTab: (tab: TabId) => void;
}

export function AppHeader({
  moduleTitle,
  alerts,
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

  const alertCount = alerts.length;

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
            onClick={() => setNotifOpen((prev) => !prev)}
            className={`relative inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
              alertCount > 0
                ? 'border-red-500/45 bg-red-500/10 text-red-200 hover:bg-red-500/20'
                : 'border-slate-700 bg-[#0D1526] text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Bell className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Notificaciones</span>
            {alertCount > 0 && (
              <span
                data-testid="notifications-badge"
                className="font-mono-num inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white"
              >
                {alertCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div
              role="dialog"
              aria-label="Centro de alertas operativas"
              data-testid="notifications-popover"
              className="absolute right-0 top-12 z-50 w-[320px] sm:w-[380px] rounded-xl border border-slate-700 bg-[#0D1526] shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Alertas del Sistema
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Stock bajo (&lt; 5 uds) y retrasos en tránsito
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  aria-label="Cerrar notificaciones"
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {alerts.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Sin alertas pendientes. Todos los modelos tienen stock ≥ 5 unidades y los envíos están dentro del plazo.
                </div>
              ) : (
                <ul className="max-h-80 divide-y divide-slate-800/80 overflow-y-auto">
                  {alerts.map((alert) => (
                    <li key={alert.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onNavigateTab(alert.targetTab);
                          setNotifOpen(false);
                        }}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-800/50"
                      >
                        {alert.kind === 'transit_delay' ? (
                          <Clock
                            className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
                            aria-hidden="true"
                          />
                        ) : (
                          <AlertTriangle
                            className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
                            aria-hidden="true"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white">
                            {alert.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-red-300">
                            {alert.description}
                          </p>
                          <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-blue-300">
                            <Package className="h-3 w-3" aria-hidden="true" />
                            Ir a {alert.targetTab === 'compras' ? 'Compras' : 'Inventario'}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
