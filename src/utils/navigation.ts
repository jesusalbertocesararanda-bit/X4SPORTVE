import type { SubModuleId, TabId } from '../types/erp';

export interface SubModuleRouteMeta {
  id: SubModuleId;
  tab: TabId;
  moduleLabel: string;
  subModuleLabel?: string;
}

export const SUBMODULE_ROUTES: Record<SubModuleId, SubModuleRouteMeta> = {
  dashboard: {
    id: 'dashboard',
    tab: 'dashboard',
    moduleLabel: 'Panel Principal',
  },
  'ventas-registrar': {
    id: 'ventas-registrar',
    tab: 'ventas',
    moduleLabel: 'Ventas',
    subModuleLabel: 'Registrar Venta',
  },
  'ventas-historial': {
    id: 'ventas-historial',
    tab: 'ventas',
    moduleLabel: 'Ventas',
    subModuleLabel: 'Historial de Ventas',
  },
  'ventas-devoluciones': {
    id: 'ventas-devoluciones',
    tab: 'devoluciones',
    moduleLabel: 'Ventas',
    subModuleLabel: 'Devoluciones y Cambios',
  },
  'ventas-cxc': {
    id: 'ventas-cxc',
    tab: 'finanzas',
    moduleLabel: 'Ventas',
    subModuleLabel: 'Cuentas por Cobrar (CxC)',
  },
  'compras-registrar': {
    id: 'compras-registrar',
    tab: 'compras',
    moduleLabel: 'Compras',
    subModuleLabel: 'Registrar Compra / Recepción',
  },
  'compras-transito': {
    id: 'compras-transito',
    tab: 'compras',
    moduleLabel: 'Compras',
    subModuleLabel: 'Pedidos en Tránsito e Historial',
  },
  'compras-precios': {
    id: 'compras-precios',
    tab: 'historial-precios',
    moduleLabel: 'Compras',
    subModuleLabel: 'Historial de Precios',
  },
  'inventario-stock': {
    id: 'inventario-stock',
    tab: 'inventario',
    moduleLabel: 'Inventario',
    subModuleLabel: 'Stock Disponible',
  },
  'inventario-auditoria': {
    id: 'inventario-auditoria',
    tab: 'auditoria',
    moduleLabel: 'Inventario',
    subModuleLabel: 'Auditoría y Conteos',
  },
  'inventario-ajustes': {
    id: 'inventario-ajustes',
    tab: 'auditoria',
    moduleLabel: 'Inventario',
    subModuleLabel: 'Ajustes de Inventario',
  },
  'finanzas-matriz': {
    id: 'finanzas-matriz',
    tab: 'finanzas',
    moduleLabel: 'Finanzas',
    subModuleLabel: 'Matriz de 4 Capas y Caja',
  },
  'finanzas-gastos': {
    id: 'finanzas-gastos',
    tab: 'finanzas',
    moduleLabel: 'Finanzas',
    subModuleLabel: 'Gastos (Operativos y Producción)',
  },
  'finanzas-socios': {
    id: 'finanzas-socios',
    tab: 'finanzas',
    moduleLabel: 'Finanzas',
    subModuleLabel: 'Reparto de Socios',
  },
  reportes: {
    id: 'reportes',
    tab: 'reportes',
    moduleLabel: 'Reportes',
  },
  estadisticas: {
    id: 'estadisticas',
    tab: 'estadisticas',
    moduleLabel: 'Estadísticas',
  },
  cargas: {
    id: 'cargas',
    tab: 'cargas',
    moduleLabel: 'Cargas Masivas',
  },
  catalogo: {
    id: 'catalogo',
    tab: 'catalogo',
    moduleLabel: 'Catálogo Público',
  },
  configuracion: {
    id: 'configuracion',
    tab: 'configuracion',
    moduleLabel: 'Configuración',
    subModuleLabel: 'Parámetros Generales',
  },
};

export function tabToDefaultSubModule(tab: TabId): SubModuleId {
  switch (tab) {
    case 'dashboard':
      return 'dashboard';
    case 'ventas':
      return 'ventas-registrar';
    case 'devoluciones':
      return 'ventas-devoluciones';
    case 'compras':
      return 'compras-registrar';
    case 'historial-precios':
      return 'compras-precios';
    case 'inventario':
      return 'inventario-stock';
    case 'auditoria':
      return 'inventario-auditoria';
    case 'finanzas':
      return 'finanzas-matriz';
    case 'reportes':
      return 'reportes';
    case 'estadisticas':
      return 'estadisticas';
    case 'cargas':
      return 'cargas';
    case 'catalogo':
      return 'catalogo';
    case 'configuracion':
      return 'configuracion';
  }
}

export function getBreadcrumbParts(subModuleId: SubModuleId): {
  moduleLabel: string;
  subModuleLabel?: string;
} {
  const meta = SUBMODULE_ROUTES[subModuleId];
  return {
    moduleLabel: meta.moduleLabel,
    subModuleLabel: meta.subModuleLabel,
  };
}
