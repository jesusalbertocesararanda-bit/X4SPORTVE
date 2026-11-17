import { useState, useMemo } from 'react';
import {
  Download,
  Filter,
  Search,
  ShoppingBag,
  ShoppingCart,
  ArrowLeftRight,
  Wallet,
} from 'lucide-react';
import type { AppState } from '../types/erp';
import { formatUSD, round2 } from '../utils/finance';

interface ReportsViewProps {
  state: AppState;
}

export function ReportsView({ state }: ReportsViewProps) {
  const [reportType, setReportType] = useState<
    'ventas' | 'compras' | 'devoluciones' | 'gastos' | 'consolidado'
  >('consolidado');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedSeller, setSelectedSeller] = useState('ALL');
  const [selectedCity, setSelectedCity] = useState('ALL');
  const [selectedVersion, setSelectedVersion] = useState('ALL');

  // Filtered sales
  const filteredSales = useMemo(() => {
    return (state.sales || []).filter((s) => {
      const matchSearch =
        !searchFilter ||
        s.modelLabel.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (s.customerName && s.customerName.toLowerCase().includes(searchFilter.toLowerCase())) ||
        (s.invoiceNumber && s.invoiceNumber.toLowerCase().includes(searchFilter.toLowerCase()));
      const matchSeller = selectedSeller === 'ALL' || s.seller === selectedSeller;
      const matchCity =
        selectedCity === 'ALL' ||
        (s.customerCity && s.customerCity.toLowerCase() === selectedCity.toLowerCase());
      const matchVersion = selectedVersion === 'ALL' || s.version === selectedVersion;
      return matchSearch && matchSeller && matchCity && matchVersion;
    });
  }, [state.sales, searchFilter, selectedSeller, selectedCity, selectedVersion]);

  // Filtered purchase batches
  const filteredPurchases = useMemo(() => {
    return (state.purchaseBatches || []).filter((p) => {
      const matchSearch =
        !searchFilter ||
        p.referenceName.toLowerCase().includes(searchFilter.toLowerCase()) ||
        p.items.some((it) => it.model.toLowerCase().includes(searchFilter.toLowerCase()));
      return matchSearch;
    });
  }, [state.purchaseBatches, searchFilter]);

  // Filtered returns
  const filteredReturns = useMemo(() => {
    return (state.returns || []).filter((r) => {
      const matchSearch =
        !searchFilter ||
        r.returnedModelLabel.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (r.customerName && r.customerName.toLowerCase().includes(searchFilter.toLowerCase()));
      return matchSearch;
    });
  }, [state.returns, searchFilter]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return (state.operatingExpenses || []).filter((e) => {
      const matchSearch =
        !searchFilter ||
        e.concept.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (e.category && e.category.toLowerCase().includes(searchFilter.toLowerCase()));
      return matchSearch;
    });
  }, [state.operatingExpenses, searchFilter]);

  const handleExportExcel = () => {
    if (typeof window === 'undefined' || !window.XLSX) {
      alert('Librería SheetJS (XLSX) no disponible.');
      return;
    }

    const XLSX = window.XLSX as any;
    const wb = XLSX.utils.book_new();

    if (reportType === 'ventas' || reportType === 'consolidado') {
      const salesData = filteredSales.map((s) => ({
        Factura: s.invoiceNumber || 'S/N',
        Fecha: s.createdAt,
        Cliente: s.customerName || 'Cliente Mostrador',
        Ciudad: s.customerCity || 'N/D',
        Teléfono: s.customerPhone || 'N/D',
        Modelo: s.modelLabel,
        Versión: s.version,
        Talla: s.size,
        Cantidad: s.quantity,
        'Precio Unitario ($)': s.items?.[0]?.unitPrice || s.finalPrice / s.quantity,
        'Total ($)': s.finalPrice,
        Vendedor: s.seller,
        Estatus: s.paymentStatus,
        'Método Pago': s.paymentMethod,
      }));
      const wsSales = XLSX.utils.json_to_sheet(salesData);
      XLSX.utils.book_append_sheet(wb, wsSales, 'Reporte Ventas');
    }

    if (reportType === 'compras' || reportType === 'consolidado') {
      const purchasesData: unknown[] = [];
      filteredPurchases.forEach((p) => {
        p.items.forEach((it) => {
          purchasesData.push({
            Referencia: p.referenceName,
            Estatus: p.status,
            Fecha: p.entryDate,
            Modelo: it.model,
            Versión: it.version,
            Talla: it.size,
            Cantidad: it.quantity,
            'Costo Landed ($)': it.landedUnitCost,
            'Total Lote ($)': round2(it.quantity * it.landedUnitCost),
            'Tasa USDT': p.usdtRate || 'N/D',
          });
        });
      });
      const wsPurchases = XLSX.utils.json_to_sheet(purchasesData);
      XLSX.utils.book_append_sheet(wb, wsPurchases, 'Reporte Compras');
    }

    if (reportType === 'devoluciones' || reportType === 'consolidado') {
      const returnsData = filteredReturns.map((r) => ({
        Tipo: r.type,
        Fecha: r.createdAt,
        Cliente: r.customerName || 'N/D',
        'Modelo Devuelto': r.returnedModelLabel,
        'Cantidad Devuelta': r.returnedQuantity,
        Reemplazo: r.replacementModelLabel || 'Ninguno (Reembolso)',
        'Diferencia ($)': r.differenceUsd,
        Motivo: r.reason,
      }));
      const wsReturns = XLSX.utils.json_to_sheet(returnsData);
      XLSX.utils.book_append_sheet(wb, wsReturns, 'Reporte Devoluciones');
    }

    if (reportType === 'gastos' || reportType === 'consolidado') {
      const expensesData = filteredExpenses.map((e) => ({
        Fecha: e.createdAt,
        Categoría: e.category || 'Gastos Operativos',
        Concepto: e.concept,
        'Monto ($)': e.amount,
        'Vía de Pago': e.paymentMethod,
      }));
      const wsExpenses = XLSX.utils.json_to_sheet(expensesData);
      XLSX.utils.book_append_sheet(wb, wsExpenses, 'Reporte Gastos');
    }

    XLSX.writeFile(wb, `X4SPORT_Reporte_${reportType.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-[#0D1526] p-5 shadow-xl sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-white sm:text-2xl">
            Reportes Consolidados Avanzados
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Filtra y exporta la información contable, de ventas, compras, devoluciones y gastos en formato Excel oficial.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-emerald-500"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            Exportar Reporte a Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Filtros avanzados */}
      <div className="rounded-2xl border border-slate-800 bg-[#080E1C] p-4 sm:p-5 space-y-4 shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Filter className="h-4 w-4 text-blue-400" aria-hidden="true" />
            <span>Filtros Cruzados del Sistema</span>
          </div>
          <div className="flex bg-[#0D1526] rounded-lg p-1 border border-slate-800 text-xs">
            {(['consolidado', 'ventas', 'compras', 'devoluciones', 'gastos'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setReportType(t)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors capitalize ${
                  reportType === t ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Buscar por texto</label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" aria-hidden="true" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Modelo, cliente, factura..."
                className="w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] pl-9 pr-3 text-xs text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Vendedor</label>
            <select
              value={selectedSeller}
              onChange={(e) => setSelectedSeller(e.target.value)}
              className="w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] px-3 text-xs text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">Todos los vendedores</option>
              <option value="Jesús">Jesús</option>
              <option value="Josué">Josué</option>
              <option value="Gabriel">Gabriel</option>
              <option value="Sin Vendedor">Sin Vendedor</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Versión / Calidad</label>
            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
              className="w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] px-3 text-xs text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">Todas las versiones</option>
              <option value="Fans">Fans</option>
              <option value="Player">Player</option>
              <option value="Retro">Retro</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Ciudad del cliente</label>
            <input
              type="text"
              value={selectedCity === 'ALL' ? '' : selectedCity}
              onChange={(e) => setSelectedCity(e.target.value.trim() || 'ALL')}
              placeholder="Ej. Guacara / Valencia"
              className="w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] px-3 text-xs text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Resultados de Ventas */}
      {(reportType === 'consolidado' || reportType === 'ventas') && (
        <div className="rounded-2xl border border-slate-800 bg-[#0D1526] p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-blue-400" aria-hidden="true" />
              <h2 className="text-base font-bold text-white">Ventas Filtradas ({filteredSales.length})</h2>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">
              Total Ingresos: {formatUSD(filteredSales.reduce((sum, s) => sum + s.finalPrice, 0))} USDT
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 uppercase tracking-wider bg-[#070D19]">
                <tr>
                  <th className="p-3">Factura / Fecha</th>
                  <th className="p-3">Cliente / Ubicación</th>
                  <th className="p-3">Prendas</th>
                  <th className="p-3">Vendedor</th>
                  <th className="p-3">Método / Estatus</th>
                  <th className="p-3 text-right">Total (USDT)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500">
                      No se encontraron ventas con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-800/40">
                      <td className="p-3 font-mono">
                        <div className="font-bold text-white">{s.invoiceNumber || 'S/N'}</div>
                        <div className="text-[10px] text-slate-400">{s.createdAt.slice(0, 16)}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-200">{s.customerName || 'Cliente Mostrador'}</div>
                        <div className="text-[10px] text-slate-400">{s.customerCity || 'Guacara'} · {s.customerPhone || 'N/D'}</div>
                      </td>
                      <td className="p-3 text-slate-300">
                        {s.items && s.items.length > 0 ? (
                          <ul className="space-y-0.5">
                            {s.items.map((it, idx) => (
                              <li key={idx} className="text-[11px]">
                                <strong className="text-white">{it.quantity}x</strong> {it.modelLabel} ({it.version} · {it.size})
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span>{s.quantity}x {s.modelLabel} ({s.version})</span>
                        )}
                      </td>
                      <td className="p-3 font-medium text-slate-200">{s.seller}</td>
                      <td className="p-3">
                        <div className="text-slate-300">{s.paymentMethod}</div>
                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold ${
                          s.paymentStatus === 'Cobrado' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        }`}>
                          {s.paymentStatus}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-400">
                        {formatUSD(s.finalPrice)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resultados de Compras */}
      {(reportType === 'consolidado' || reportType === 'compras') && (
        <div className="rounded-2xl border border-slate-800 bg-[#0D1526] p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-blue-400" aria-hidden="true" />
              <h2 className="text-base font-bold text-white">Lotes de Compra Registrados ({filteredPurchases.length})</h2>
            </div>
            <span className="text-xs font-mono font-bold text-blue-400">
              Total Invertido: {formatUSD(filteredPurchases.reduce((sum, p) => sum + p.totalLandedCost, 0))} USDT
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 uppercase tracking-wider bg-[#070D19]">
                <tr>
                  <th className="p-3">Lote / Referencia</th>
                  <th className="p-3">Estatus / Envío</th>
                  <th className="p-3">Prendas del Lote</th>
                  <th className="p-3 text-center">Total Unidades</th>
                  <th className="p-3 text-right">Costo Landed Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500">
                      No se encontraron lotes de compra con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredPurchases.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-800/40">
                      <td className="p-3 font-mono">
                        <div className="font-bold text-white">{p.referenceName}</div>
                        <div className="text-[10px] text-slate-400">{p.entryDate}</div>
                      </td>
                      <td className="p-3">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                          {p.status}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">{p.shippingType}</div>
                      </td>
                      <td className="p-3 text-slate-300">
                        <ul className="space-y-0.5">
                          {p.items.map((it, idx) => (
                            <li key={idx} className="text-[11px]">
                              <strong className="text-white">{it.quantity}x</strong> {it.model} ({it.version} · {it.size}) — {formatUSD(it.landedUnitCost)} c/u
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-white">{p.totalUnits}</td>
                      <td className="p-3 text-right font-mono font-bold text-blue-400">
                        {formatUSD(p.totalLandedCost)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resultados de Devoluciones */}
      {(reportType === 'consolidado' || reportType === 'devoluciones') && (
        <div className="rounded-2xl border border-slate-800 bg-[#0D1526] p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-amber-400" aria-hidden="true" />
              <h2 className="text-base font-bold text-white">Devoluciones y Cambios ({filteredReturns.length})</h2>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 uppercase tracking-wider bg-[#070D19]">
                <tr>
                  <th className="p-3">Operación / Fecha</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Prenda Devuelta</th>
                  <th className="p-3">Reemplazo</th>
                  <th className="p-3 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredReturns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500">
                      No se registraron devoluciones en este filtro.
                    </td>
                  </tr>
                ) : (
                  filteredReturns.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-800/40">
                      <td className="p-3 font-mono">
                        <div className="font-bold text-white">{r.type}</div>
                        <div className="text-[10px] text-slate-400">{r.createdAt.slice(0, 16)}</div>
                      </td>
                      <td className="p-3 text-slate-200">{r.customerName || 'N/D'}</td>
                      <td className="p-3 text-slate-300">{r.returnedQuantity}x {r.returnedModelLabel} ({r.returnedSize})</td>
                      <td className="p-3 text-slate-300">{r.replacementModelLabel ? `${r.replacementQuantity}x ${r.replacementModelLabel}` : 'Reembolso en efectivo'}</td>
                      <td className={`p-3 text-right font-mono font-bold ${r.differenceUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {r.differenceUsd >= 0 ? `+${formatUSD(r.differenceUsd)}` : formatUSD(r.differenceUsd)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resultados de Gastos */}
      {(reportType === 'consolidado' || reportType === 'gastos') && (
        <div className="rounded-2xl border border-slate-800 bg-[#0D1526] p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-purple-400" aria-hidden="true" />
              <h2 className="text-base font-bold text-white">Gastos Operativos ({filteredExpenses.length})</h2>
            </div>
            <span className="text-xs font-mono font-bold text-red-400">
              Total Gastos: {formatUSD(filteredExpenses.reduce((sum, e) => sum + e.amount, 0))} USDT
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 uppercase tracking-wider bg-[#070D19]">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Categoría</th>
                  <th className="p-3">Concepto</th>
                  <th className="p-3">Vía de Pago</th>
                  <th className="p-3 text-right">Monto (USDT)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500">
                      No se encontraron gastos con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-800/40">
                      <td className="p-3 font-mono text-slate-400">{e.createdAt.slice(0, 16)}</td>
                      <td className="p-3 font-medium text-slate-300">{e.category || 'Gastos Operativos'}</td>
                      <td className="p-3 font-semibold text-white">{e.concept}</td>
                      <td className="p-3 text-slate-300">{e.paymentMethod}</td>
                      <td className="p-3 text-right font-mono font-bold text-red-400">
                        -{formatUSD(e.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
