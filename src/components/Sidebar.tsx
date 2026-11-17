import { useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileText,
  History,
  LayoutDashboard,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  UploadCloud,
  Wallet,
  X,
} from 'lucide-react';
import type { TabId } from '../types/erp';

interface SidebarProps {
  activeTab: TabId;
  isCollapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
  onSelectTab: (tab: TabId) => void;
  onOpenSettings: () => void;
}

interface SidebarGroup {
  id: string;
  label: string;
  items: Array<{
    id: TabId;
    label: string;
    icon: typeof LayoutDashboard;
  }>;
}

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: 'operaciones',
    label: 'Operaciones',
    items: [
      { id: 'dashboard', label: 'Panel Principal', icon: LayoutDashboard },
      { id: 'ventas', label: 'Ventas y Facturación', icon: ShoppingBag },
      { id: 'devoluciones', label: 'Devoluciones y Cambios', icon: ArrowLeftRight },
      { id: 'catalogo', label: 'Catálogo Público', icon: Store },
    ],
  },
  {
    id: 'mercancia',
    label: 'Mercancía y Bodega',
    items: [
      { id: 'compras', label: 'Compras y Recepción', icon: ShoppingCart },
      { id: 'inventario', label: 'Inventario Base', icon: Package },
      { id: 'auditoria', label: 'Auditoría Física', icon: ClipboardCheck },
    ],
  },
  {
    id: 'administracion',
    label: 'Administración',
    items: [
      { id: 'finanzas', label: 'Finanzas y Caja', icon: Wallet },
      { id: 'estadisticas', label: 'Estadísticas', icon: BarChart3 },
      { id: 'reportes', label: 'Reportes Consolidados', icon: FileText },
      { id: 'cargas', label: 'Cargas Masivas (.xlsx)', icon: UploadCloud },
      { id: 'historial-precios', label: 'Historial de Precios', icon: History },
    ],
  },
];

export function Sidebar({
  activeTab,
  isCollapsed,
  mobileOpen,
  onToggleCollapse,
  onCloseMobile,
  onSelectTab,
  onOpenSettings,
}: SidebarProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    operaciones: true,
    mercancia: true,
    administracion: true,
  });

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const handleNavigate = (tab: TabId) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  return (
    <>
      {mobileOpen && (
        <div
          aria-hidden="true"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs lg:hidden"
        />
      )}

      <aside
        data-testid="app-sidebar"
        aria-label="Navegación lateral X4SPORT"
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-800/90 bg-[#080F1E] transition-all duration-200 lg:sticky lg:top-0 lg:h-screen lg:shrink-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${isCollapsed ? 'w-64 lg:w-[74px]' : 'w-64'}`}
      >
        {/* Top corner brand + collapse toggle */}
        <div
          className={`flex h-16 items-center border-b border-slate-800/80 px-3 ${
            isCollapsed ? 'justify-between lg:justify-center' : 'justify-between'
          }`}
        >
          <a
            href="#dashboard"
            onClick={(e) => {
              e.preventDefault();
              handleNavigate('dashboard');
            }}
            className={`font-display text-lg font-bold tracking-tight text-white whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${
              isCollapsed ? 'lg:hidden' : ''
            }`}
          >
            X4<span className="text-blue-400">SPORT</span>
          </a>

          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid="btn-toggle-sidebar"
              onClick={onToggleCollapse}
              title={isCollapsed ? 'Expandir menú lateral' : 'Ocultar / contraer menú lateral'}
              aria-label={isCollapsed ? 'Expandir menú lateral' : 'Ocultar menú lateral'}
              className="hidden lg:inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-800 bg-[#0D1526] text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {isCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Cerrar menú lateral"
              className="inline-flex lg:hidden min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-800 bg-[#0D1526] text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Accordion module navigation */}
        <nav
          aria-label="Módulos del sistema"
          className="flex-1 overflow-y-auto px-2.5 py-4 space-y-3"
        >
          {SIDEBAR_GROUPS.map((group) => {
            const isOpen = openGroups[group.id] ?? true;

            if (isCollapsed) {
              return (
                <div
                  key={group.id}
                  className="hidden lg:flex flex-col items-center gap-1.5 border-b border-slate-800/60 pb-2.5 last:border-b-0"
                >
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-testid={`nav-item-${item.id}`}
                        title={item.label}
                        aria-label={item.label}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => handleNavigate(item.id)}
                        className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          active
                            ? 'border-blue-500/40 bg-blue-600/20 text-blue-300'
                            : 'border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              );
            }

            return (
              <div key={group.id} className="space-y-1">
                <button
                  type="button"
                  data-testid={`accordion-group-${group.id}`}
                  aria-expanded={isOpen}
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:bg-slate-800/40 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <span>{group.label}</span>
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  )}
                </button>

                {isOpen && (
                  <div className="space-y-1 pl-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-testid={`nav-item-${item.id}`}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => handleNavigate(item.id)}
                          className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            active
                              ? 'border-blue-500/40 bg-blue-600/15 text-white'
                              : 'border-transparent text-slate-300 hover:bg-slate-800/60 hover:text-white'
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 shrink-0 ${
                              active ? 'text-blue-400' : 'text-slate-400'
                            }`}
                            aria-hidden="true"
                          />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Fixed bottom Configuración button */}
        <div className="mt-auto border-t border-slate-800/90 p-2.5">
          <button
            type="button"
            data-testid="btn-sidebar-settings"
            onClick={() => {
              onOpenSettings();
              onCloseMobile();
            }}
            title="Configuración"
            aria-label="Configuración"
            className={`flex min-h-[42px] w-full items-center rounded-lg border border-slate-800 bg-[#0D1526] text-xs font-semibold text-slate-200 transition-colors hover:border-slate-700 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isCollapsed ? 'justify-center px-2 lg:px-0' : 'gap-2.5 px-3'
            }`}
          >
            <Settings className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <span className={isCollapsed ? 'lg:hidden' : ''}>Configuración</span>
          </button>
        </div>
      </aside>
    </>
  );
}
