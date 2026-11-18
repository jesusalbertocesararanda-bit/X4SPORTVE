import { useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
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
import type { SubModuleId } from '../types/erp';
import type { ERPUser } from '../utils/auth';

interface SidebarProps {
  activeSubModule: SubModuleId;
  isCollapsed: boolean;
  mobileOpen: boolean;
  currentUser: ERPUser | null;
  isSynced: boolean;
  storeName?: string;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
  onSelectSubModule: (subModule: SubModuleId) => void;
  onLogout: () => void;
}

interface TreeBranchNode {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  children: Array<{
    id: SubModuleId;
    label: string;
  }>;
}

interface StandaloneNode {
  id: SubModuleId;
  label: string;
  icon: typeof LayoutDashboard;
}

const TREE_MODULES: TreeBranchNode[] = [
  {
    id: 'tree-ventas',
    label: 'Ventas',
    icon: ShoppingBag,
    children: [
      { id: 'ventas-registrar', label: 'Registrar Venta' },
      { id: 'ventas-historial', label: 'Historial de Ventas' },
      { id: 'ventas-devoluciones', label: 'Devoluciones y Cambios' },
      { id: 'ventas-cxc', label: 'Cuentas por Cobrar (CxC)' },
    ],
  },
  {
    id: 'tree-compras',
    label: 'Compras',
    icon: ShoppingCart,
    children: [
      { id: 'compras-registrar', label: 'Registrar Compra / Recepción' },
      { id: 'compras-transito', label: 'Pedidos en Tránsito e Historial' },
      { id: 'compras-precios', label: 'Historial de Precios' },
    ],
  },
  {
    id: 'tree-inventario',
    label: 'Inventario',
    icon: Package,
    children: [
      { id: 'inventario-stock', label: 'Stock Disponible' },
      { id: 'inventario-auditoria', label: 'Auditoría y Conteos' },
      { id: 'inventario-ajustes', label: 'Ajustes de Inventario' },
    ],
  },
  {
    id: 'tree-finanzas',
    label: 'Finanzas',
    icon: Wallet,
    children: [
      { id: 'finanzas-matriz', label: 'Matriz de 4 Capas y Caja' },
      { id: 'finanzas-gastos', label: 'Gastos (Operativos y Producción)' },
      { id: 'finanzas-socios', label: 'Reparto de Socios' },
    ],
  },
];

const STANDALONE_MODULES: StandaloneNode[] = [
  { id: 'reportes', label: 'Reportes', icon: FileText },
  { id: 'estadisticas', label: 'Estadísticas', icon: BarChart3 },
  { id: 'cargas', label: 'Cargas Masivas', icon: UploadCloud },
  { id: 'catalogo', label: 'Catálogo Público', icon: Store },
];

export function Sidebar({
  activeSubModule,
  isCollapsed,
  mobileOpen,
  currentUser,
  isSynced,
  storeName = 'X4SPORT',
  onToggleCollapse,
  onCloseMobile,
  onSelectSubModule,
  onLogout,
}: SidebarProps) {
  const [expandedBranches, setExpandedBranches] = useState<
    Record<string, boolean>
  >({
    'tree-ventas': true,
    'tree-compras': true,
    'tree-inventario': true,
    'tree-finanzas': true,
  });

  const toggleBranch = (branchId: string) => {
    setExpandedBranches((prev) => ({
      ...prev,
      [branchId]: !prev[branchId],
    }));
  };

  const handleNavigate = (subModule: SubModuleId) => {
    onSelectSubModule(subModule);
    onCloseMobile();
  };

  return (
    <>
      {mobileOpen && (
        <div
          aria-hidden="true"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/75 backdrop-blur-xs lg:hidden"
        />
      )}

      <aside
        data-testid="app-sidebar"
        aria-label="Navegación lateral X4SPORT"
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-800/90 bg-[#080F1E] transition-all duration-300 ease-in-out lg:sticky lg:top-0 lg:h-screen lg:shrink-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${isCollapsed ? 'w-72 lg:w-[74px]' : 'w-72'}`}
      >
        {/* Esquina superior izquierda: Toggle colapsable + Brand */}
        <div
          className={`flex h-16 items-center border-b border-slate-800/80 px-3 ${
            isCollapsed ? 'justify-between lg:justify-center' : 'justify-between'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              data-testid="btn-toggle-sidebar"
              onClick={onToggleCollapse}
              title={
                isCollapsed
                  ? 'Desplegar barra lateral'
                  : 'Ocultar / contraer barra lateral'
              }
              aria-label={
                isCollapsed ? 'Desplegar barra lateral' : 'Ocultar barra lateral'
              }
              className="hidden lg:inline-flex min-h-[38px] min-w-[38px] shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-[#0D1526] text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {isCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            <a
              href="#dashboard"
              onClick={(e) => {
                e.preventDefault();
                handleNavigate('dashboard');
              }}
              className={`font-display text-lg font-bold tracking-tight text-white whitespace-nowrap truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${
                isCollapsed ? 'lg:hidden' : ''
              }`}
            >
              {storeName === 'X4SPORT' ? (
                <>
                  X4<span className="text-blue-400">SPORT</span>
                </>
              ) : (
                storeName
              )}
            </a>
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Cerrar menú lateral"
            className="inline-flex lg:hidden min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-800 bg-[#0D1526] text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Árbol jerárquico de módulos y sub-módulos */}
        <nav
          aria-label="Árbol de módulos del sistema"
          className="flex-1 overflow-y-auto px-2.5 py-3.5 space-y-2"
        >
          {/* Panel Principal */}
          <button
            type="button"
            data-testid="nav-item-dashboard"
            title="Panel Principal"
            aria-label="Panel Principal"
            aria-current={activeSubModule === 'dashboard' ? 'page' : undefined}
            onClick={() => handleNavigate('dashboard')}
            className={`flex min-h-[40px] w-full items-center rounded-lg border text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isCollapsed
                ? 'justify-center px-2 lg:h-10 lg:w-10 lg:mx-auto lg:px-0'
                : 'gap-2.5 px-3 py-2'
            } ${
              activeSubModule === 'dashboard'
                ? 'border-blue-500/40 bg-blue-600/15 text-white'
                : 'border-transparent text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <LayoutDashboard
              className={`h-4 w-4 shrink-0 ${
                activeSubModule === 'dashboard'
                  ? 'text-blue-400'
                  : 'text-slate-400'
              }`}
              aria-hidden="true"
            />
            <span className={isCollapsed ? 'lg:hidden' : 'truncate'}>
              Panel Principal
            </span>
          </button>

          {/* Árboles desplegables: Ventas, Compras, Inventario, Finanzas */}
          <div className="space-y-1.5 pt-1">
            {TREE_MODULES.map((branch) => {
              const Icon = branch.icon;
              const isBranchActive = branch.children.some(
                (c) => c.id === activeSubModule,
              );
              const isOpen = expandedBranches[branch.id] ?? true;

              if (isCollapsed) {
                return (
                  <div
                    key={branch.id}
                    className="hidden lg:flex justify-center"
                  >
                    <button
                      type="button"
                      data-testid={`nav-branch-collapsed-${branch.id}`}
                      title={`${branch.label} (clic para abrir)`}
                      aria-label={branch.label}
                      onClick={() => {
                        onToggleCollapse();
                        setExpandedBranches((prev) => ({
                          ...prev,
                          [branch.id]: true,
                        }));
                      }}
                      className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        isBranchActive
                          ? 'border-blue-500/40 bg-blue-600/20 text-blue-300'
                          : 'border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    </button>
                  </div>
                );
              }

              return (
                <div key={branch.id} className="space-y-1">
                  <button
                    type="button"
                    data-testid={`tree-branch-${branch.id}`}
                    aria-expanded={isOpen}
                    onClick={() => toggleBranch(branch.id)}
                    className={`flex min-h-[38px] w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      isBranchActive
                        ? 'bg-slate-800/60 text-white'
                        : 'text-slate-200 hover:bg-slate-800/40 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          isBranchActive ? 'text-blue-400' : 'text-slate-400'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{branch.label}</span>
                    </span>
                    {isOpen ? (
                      <ChevronDown
                        className="h-3.5 w-3.5 shrink-0 text-slate-400"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronRight
                        className="h-3.5 w-3.5 shrink-0 text-slate-400"
                        aria-hidden="true"
                      />
                    )}
                  </button>

                  {isOpen && (
                    <div className="ml-[19px] border-l border-slate-700/80 pl-3 space-y-1 py-0.5">
                      {branch.children.map((child) => {
                        const childActive = activeSubModule === child.id;
                        return (
                          <button
                            key={child.id}
                            type="button"
                            data-testid={`nav-item-${child.id}`}
                            aria-current={childActive ? 'page' : undefined}
                            onClick={() => handleNavigate(child.id)}
                            className={`relative flex min-h-[34px] w-full items-center rounded-lg border px-2.5 py-1.5 text-left text-[11.5px] font-medium transition-colors before:content-[''] before:absolute before:-left-3 before:top-1/2 before:h-px before:w-2.5 before:bg-slate-700/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                              childActive
                                ? 'border-blue-500/40 bg-blue-600/15 text-blue-200 font-semibold'
                                : 'border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-100'
                            }`}
                          >
                            <span className="truncate">{child.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Módulos independientes: Reportes, Estadísticas, Cargas Masivas, Catálogo Público */}
          <div className="border-t border-slate-800/70 pt-2.5 space-y-1">
            {STANDALONE_MODULES.map((item) => {
              const Icon = item.icon;
              const active = activeSubModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`nav-item-${item.id}`}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => handleNavigate(item.id)}
                  className={`flex min-h-[38px] w-full items-center rounded-lg border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    isCollapsed
                      ? 'justify-center px-2 lg:h-10 lg:w-10 lg:mx-auto lg:px-0'
                      : 'gap-2.5 px-3 py-2'
                  } ${
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
                  <span className={isCollapsed ? 'lg:hidden' : 'truncate'}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Footer de Sidebar: Usuario activo + Cerrar Sesión + Configuración fija al final */}
        <div className="mt-auto border-t border-slate-800/90 p-2.5 space-y-2">
          {currentUser && (
            <div
              className={`rounded-lg border border-slate-800/90 bg-[#0D1526] p-2 ${
                isCollapsed ? 'lg:flex lg:flex-col lg:items-center lg:gap-2' : ''
              }`}
            >
              <div
                className={`flex items-center gap-2 ${
                  isCollapsed ? 'lg:justify-center' : 'justify-between'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      isSynced
                        ? 'bg-emerald-500 animate-pulse'
                        : 'bg-amber-500 animate-ping'
                    }`}
                    title={
                      isSynced
                        ? 'Sincronizado en tiempo real con Firebase'
                        : 'Sincronizando...'
                    }
                  />
                  <span
                    className={`text-xs font-semibold text-white truncate ${
                      isCollapsed ? 'lg:hidden' : ''
                    }`}
                  >
                    {currentUser.name}
                  </span>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold shrink-0 ${
                    isCollapsed ? 'lg:hidden' : ''
                  }`}
                >
                  {currentUser.role === 'admin' ? 'Admin' : 'Socio'}
                </span>
              </div>

              <button
                type="button"
                data-testid="btn-logout"
                onClick={() => {
                  onCloseMobile();
                  onLogout();
                }}
                title="Cerrar Sesión"
                aria-label="Cerrar Sesión"
                className={`mt-2 flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-md border border-red-500/25 bg-red-500/10 text-[11px] font-semibold text-red-200 transition-colors hover:bg-red-500/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${
                  isCollapsed ? 'lg:mt-0 lg:h-8 lg:w-8 lg:px-0' : 'px-2.5 py-1'
                }`}
              >
                <LogOut
                  className="h-3.5 w-3.5 shrink-0 text-red-400"
                  aria-hidden="true"
                />
                <span className={isCollapsed ? 'lg:hidden' : ''}>
                  Cerrar Sesión
                </span>
              </button>
            </div>
          )}

          <button
            type="button"
            data-testid="btn-sidebar-settings"
            onClick={() => handleNavigate('configuracion')}
            title="Configuración"
            aria-label="Configuración"
            aria-current={
              activeSubModule === 'configuracion' ? 'page' : undefined
            }
            className={`flex min-h-[42px] w-full items-center rounded-lg border text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isCollapsed
                ? 'justify-center px-2 lg:h-10 lg:w-10 lg:mx-auto lg:px-0'
                : 'gap-2.5 px-3'
            } ${
              activeSubModule === 'configuracion'
                ? 'border-blue-500/45 bg-blue-600/20 text-white'
                : 'border-slate-800 bg-[#0D1526] text-slate-200 hover:border-slate-700 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Settings
              className={`h-4 w-4 shrink-0 ${
                activeSubModule === 'configuracion'
                  ? 'text-blue-400'
                  : 'text-slate-400'
              }`}
              aria-hidden="true"
            />
            <span className={isCollapsed ? 'lg:hidden' : ''}>Configuración</span>
          </button>
        </div>
      </aside>
    </>
  );
}
