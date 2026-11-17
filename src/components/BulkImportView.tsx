import { useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { AppState } from '../types/erp';

interface BulkImportViewProps {
  state: AppState;
  onApplyImportedState: (newState: AppState) => Promise<void>;
}

export function BulkImportView({}: BulkImportViewProps) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleDownloadTemplate = (type: 'compras' | 'ventas' | 'gastos') => {
    if (typeof window === 'undefined' || !window.XLSX) {
      alert('Librería SheetJS no disponible.');
      return;
    }

    const XLSX = window.XLSX as any;
    const wb = XLSX.utils.book_new();

    let sampleData: unknown[] = [];
    let sheetName = '';

    if (type === 'compras') {
      sheetName = 'Compras';
      sampleData = [
        {
          Modelo: 'Barcelona Local 25/26',
          Versión: 'Fans',
          Talla: 'M',
          Cantidad: 50,
          'Costo Unitario (USDT)': 6.50,
          'Precio Venta (USDT)': 25.00,
          Fecha: '2026-11-01',
          'Tasa USDT': 1068.56,
          'Tasa BCV': 915.75,
          Referencia: 'Lote Alibaba Noviembre',
        },
      ];
    } else if (type === 'ventas') {
      sheetName = 'Ventas';
      sampleData = [
        {
          Modelo: 'Real Madrid Local 25/26',
          Versión: 'Player',
          Talla: 'L',
          Cantidad: 2,
          Cliente: 'Carlos Mendoza',
          Ciudad: 'Guacara',
          Teléfono: '0414-1234567',
          Vendedor: 'Jesús',
          Fecha: '2026-11-16',
          'Precio Unitario (USDT)': 30.00,
          'Total (USDT)': 60.00,
          'Estatus Pago': 'Cobrado',
          'Método Pago': 'Efectivo ($)',
        },
      ];
    } else {
      sheetName = 'Gastos';
      sampleData = [
        {
          Fecha: '2026-11-16',
          Categoría: 'Gastos de Comercialización/Publicidad',
          Concepto: 'Campaña Instagram Ads',
          'Monto (USDT)': 25.00,
          'Vía de Pago': 'Binance USDT',
        },
      ];
    }

    const ws = XLSX.utils.json_to_sheet(sampleData);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `X4SPORT_Plantilla_${sheetName}_Oficial.xlsx`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setFeedback(null);

    try {
      const dataBuffer = await file.arrayBuffer();
      if (!window.XLSX) {
        throw new Error('Librería SheetJS no cargada.');
      }
      const XLSX = window.XLSX as any;
      const workbook = XLSX.read(dataBuffer, { type: 'array', cellDates: true });
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('El archivo Excel no contiene pestañas válidas.');
      }

      setFeedback({
        type: 'success',
        text: `Archivo "${file.name}" leído con éxito (${workbook.SheetNames.length} pestañas detectadas). Usa el módulo de Importación Principal en Configuración para procesar respaldos completos.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al procesar el archivo Excel.',
      });
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-[#0D1526] p-5 shadow-xl">
        <h1 className="font-display text-xl font-bold text-white sm:text-2xl">
          Cargas Masivas de Datos (.xlsx)
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Descarga plantillas oficiales con la estructura exacta de X4SPORT y carga archivos para inserción rápida.
        </p>
      </div>

      {feedback && (
        <div
          role="status"
          className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-xs font-medium ${
            feedback.type === 'error'
              ? 'border border-red-500/35 bg-red-500/10 text-red-200'
              : 'border border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Plantilla Compras */}
        <div className="rounded-2xl border border-slate-800 bg-[#080E1C] p-5 space-y-4 shadow-lg flex flex-col justify-between">
          <div className="space-y-2">
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-2.5 w-fit text-blue-400">
              <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-base font-bold text-white">Plantilla de Compras</h2>
            <p className="text-xs text-slate-400">
              Formato estándar para registrar lotes de inventario, costos unitarios y tasas USDT por lote.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleDownloadTemplate('compras')}
            className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#0D1526] px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white"
          >
            <Download className="h-4 w-4 text-blue-400" aria-hidden="true" />
            Descargar Plantilla Compras
          </button>
        </div>

        {/* Plantilla Ventas */}
        <div className="rounded-2xl border border-slate-800 bg-[#080E1C] p-5 space-y-4 shadow-lg flex flex-col justify-between">
          <div className="space-y-2">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 w-fit text-emerald-400">
              <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-base font-bold text-white">Plantilla de Ventas</h2>
            <p className="text-xs text-slate-400">
              Formato estándar para registrar facturación histórica, cliente, ciudad, vendedor y pagos.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleDownloadTemplate('ventas')}
            className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#0D1526] px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white"
          >
            <Download className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            Descargar Plantilla Ventas
          </button>
        </div>

        {/* Plantilla Gastos */}
        <div className="rounded-2xl border border-slate-800 bg-[#080E1C] p-5 space-y-4 shadow-lg flex flex-col justify-between">
          <div className="space-y-2">
            <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-2.5 w-fit text-purple-400">
              <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-base font-bold text-white">Plantilla de Gastos</h2>
            <p className="text-xs text-slate-400">
              Formato estándar para registrar gastos operativos clasificados, publicidad y retiros de socios.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleDownloadTemplate('gastos')}
            className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#0D1526] px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white"
          >
            <Download className="h-4 w-4 text-purple-400" aria-hidden="true" />
            Descargar Plantilla Gastos
          </button>
        </div>
      </div>

      {/* Zona de subida de archivo */}
      <div className="rounded-2xl border border-dashed border-slate-700 bg-[#080E1C] p-8 text-center space-y-4 shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
          <Upload className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold text-white">Subir Archivo Excel para Carga Masiva</h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Selecciona tu archivo `.xlsx` o `.xls` completado con la estructura oficial. El sistema validará los campos y actualizará las tablas.
          </p>
        </div>

        <div>
          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500">
            <span>{loading ? 'Procesando archivo...' : 'Seleccionar Archivo Excel'}</span>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              disabled={loading}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
