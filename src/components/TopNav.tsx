import { useEffect, useRef } from 'react';
import {
  BarChart3,
  ClipboardCheck,
  LayoutDashboard,
  Package,
  ShoppingBag,
  ShoppingCart,
  Wallet,
} from 'lucide-react';
import type { TabId } from '../types/erp';

interface TopNavProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  onOpenExcelImport: () => void;
  lowStockCount: number;
  pendingReceivablesCount: number;
}

const TABS: Array<{
  id: TabId;
  label: string;
  ariaLabel?: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'ventas', label: 'Ventas', icon: ShoppingBag },
  { id: 'inventario', label: 'Inventario', icon: Package },
  {
    id: 'auditoria',
    label: 'Auditoría',
    ariaLabel: 'Auditoría de Inventario',
    icon: ClipboardCheck,
  },
  { id: 'compras', label: 'Compras', icon: ShoppingCart },
  { id: 'finanzas', label: 'Finanzas', icon: Wallet },
  { id: 'estadisticas', label: 'Estadísticas', icon: BarChart3 },
];

export function TopNav({
  activeTab,
  onSelectTab,
  onOpenExcelImport,
  lowStockCount,
  pendingReceivablesCount,
}: TopNavProps) {
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const activeBtn = navRef.current?.querySelector<HTMLButtonElement>(
      '[aria-selected="true"]',
    );
    activeBtn?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [activeTab]);

  return (
    <header className="border-b border-slate-800/90 bg-[#080F1E]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-2.5 px-4 py-3 sm:px-6 xl:flex-row xl:items-center xl:justify-between xl:gap-3 xl:py-3.5">
        <div className="flex items-center justify-between gap-3">
          <a
            href="#dashboard"
            onClick={(e) => {
              e.preventDefault();
              onSelectTab('dashboard');
            }}
            className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            X4<span className="text-blue-400">SPORT</span>
          </a>

          <div className="flex items-center gap-2 xl:hidden">
            <button
              type="button"
              onClick={() => onSelectTab('ventas')}
              className="min-h-[38px] rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 active:scale-[0.98] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              Nueva Venta
            </button>
          </div>
        </div>

        <nav
          ref={navRef}
          aria-label="Módulos principales"
          role="tablist"
          className="flex items-center gap-0.5 overflow-x-auto pb-0.5 xl:pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const badgeCount =
              tab.id === 'dashboard' && lowStockCount > 0
                ? lowStockCount
                : tab.id === 'finanzas' && pendingReceivablesCount > 0
                  ? pendingReceivablesCount
                  : null;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={tab.ariaLabel ?? tab.label}
                onClick={() => onSelectTab(tab.id)}
                className={`group relative flex min-h-[40px] items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 xl:px-1.5 2xl:px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isActive
                    ? 'bg-blue-600/15 text-white border border-blue-500/40'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                  aria-hidden="true"
                />
                <span>{tab.label}</span>
                {badgeCount !== null && (
                  <span className="hidden 2xl:inline font-mono-num text-xs text-slate-300">
                    ({badgeCount})
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-2 xl:flex-nowrap xl:justify-end shrink-0">
          <button
            type="button"
            data-testid="btn-open-excel-import"
            onClick={onOpenExcelImport}
            className="inline-flex min-h-[38px] w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-600/15 px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-600/25 hover:text-white whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            📥 Sincronizar y Cargar Respaldo Excel (.xlsx)
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('ventas')}
            className="hidden xl:inline-flex min-h-[38px] items-center justify-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 active:scale-[0.98] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            Nueva Venta
          </button>
        </div>
      </div>
    </header>
  );
}
