import { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { AppState } from '../types/erp';
import {
  downloadExcelTemplateWithSheetJS,
  parseExcelFileWithSheetJS,
} from '../utils/excelImport';
import type { ExcelImportPreview } from '../utils/excelImport';
import { formatUSD } from '../utils/finance';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyImportedState: (nextState: AppState) => Promise<void>;
  onPurgeGhostData: () => Promise<void>;
}

const COMPRAS_FIELD_LABELS: Record<string, string> = {
  model: 'Modelo exacto',
  size: 'Talla',
  version: 'Versión',
  quantity: 'Cantidad',
  unitCost: 'Costo unitario',
  salePrice: 'Precio de venta',
  date: 'Fecha',
  bcvRate: 'Tasa BCV',
  reference: 'Lote / Ref.',
};

const VENTAS_FIELD_LABELS: Record<string, string> = {
  model: 'Modelo',
  size: 'Talla',
  version: 'Versión',
  quantity: 'Cantidad',
  customer: 'Comprador',
  seller: 'Vendedor',
  date: 'Fecha',
  totalPrice: 'Total ($)',
  unitPrice: 'Precio unit.',
  paymentStatus: 'Estado',
  paymentMethod: 'Método pago',
};

export function ExcelImportModal({
  isOpen,
  onClose,
  onApplyImportedState,
  onPurgeGhostData,
}: ExcelImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [preview, setPreview] = useState<ExcelImportPreview | null>(null);
  const [pendingState, setPendingState] = useState<AppState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);

  if (!isOpen) return null;

  const processFile = async (file: File) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setSelectedFileName(file.name);
    setIsParsing(true);
    try {
      const result = await parseExcelFileWithSheetJS(file);
      if (!result.ok || !result.preview || !result.state) {
        setPreview(null);
        setPendingState(null);
        setErrorMsg(
          result.error ?? 'No se pudo procesar el archivo Excel seleccionado.',
        );
        return;
      }
      setPreview(result.preview);
      setPendingState(result.state);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingState) return;
    setIsSaving(true);
    setErrorMsg(null);
    try {
      await onApplyImportedState(pendingState);
      setSuccessMsg(
        'Respaldo Excel sincronizado en Firebase Realtime Database. Todos los dispositivos ya muestran los datos reales.',
      );
      setPreview(null);
      setPendingState(null);
      setSelectedFileName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo escribir en Firebase Realtime Database.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmPurge = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    try {
      await onPurgeGhostData();
      setConfirmPurge(false);
      setPreview(null);
      setPendingState(null);
      setSelectedFileName(null);
      setSuccessMsg(
        'Datos fantasma eliminados de localStorage y Firebase Realtime Database. Base de datos limpia.',
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Error al limpiar Firebase Realtime Database.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="excel-sync-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-800 bg-[#0D1526] p-5 shadow-2xl sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-emerald-400">
              <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="excel-sync-title"
                className="font-display text-lg font-bold text-white sm:text-xl"
              >
                Sincronizar y Cargar Respaldo Excel (.xlsx)
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Mapeo automático de pestañas Compras, Ventas (motor FIFO) y Finanzas / Resumen directo a Firebase.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal de importación Excel"
            className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-700 bg-[#080E1C] p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-200"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="rounded-xl border border-dashed border-slate-700 bg-[#080E1C] p-5 text-center space-y-3">
          <input
            ref={fileInputRef}
            id="excel-file-input"
            data-testid="excel-file-input"
            type="file"
            accept=".xlsx,.xls,.xlsm,.csv"
            onChange={handleFileChange}
            className="sr-only"
          />

          <div className="flex flex-col items-center gap-2">
            <Upload className="h-7 w-7 text-blue-400" aria-hidden="true" />
            <p className="text-sm font-semibold text-white">
              {selectedFileName
                ? `Archivo cargado: ${selectedFileName}`
                : 'Selecciona tu archivo Excel oficial de X4SPORT (.xlsx)'}
            </p>
            <p className="max-w-lg text-xs text-slate-400">
              Detecta automáticamente encabezados en <strong className="text-slate-200">Compras</strong>,{' '}
              <strong className="text-slate-200">Ventas</strong> y{' '}
              <strong className="text-slate-200">Finanzas / Resumen</strong>, preservando nombres exactos y aplicando consumo FIFO.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <label
              htmlFor="excel-file-input"
              className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {isParsing ? 'Analizando Excel...' : 'Seleccionar Archivo .xlsx'}
            </label>

            <button
              type="button"
              data-testid="btn-download-excel-template"
              onClick={() => {
                setErrorMsg(null);
                const ok = downloadExcelTemplateWithSheetJS();
                if (!ok) {
                  setErrorMsg(
                    'La librería SheetJS (xlsx CDN) aún está cargando o no hay conexión.',
                  );
                }
              }}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-700 bg-[#0D1526] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <Download className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              Descargar Plantilla (.xlsx)
            </button>
          </div>
        </div>

        {preview && (
          <div
            data-testid="excel-preview-panel"
            className="space-y-4 rounded-xl border border-slate-800 bg-[#080E1C] p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Vista Previa del Mapeo Automático y Cálculo FIFO
                </h3>
                <p className="text-[11px] text-slate-400">
                  Hojas detectadas: Compras →{' '}
                  <strong className="text-slate-200">
                    {preview.detectedSheets.compras ?? 'No detectada'}
                  </strong>{' '}
                  · Ventas →{' '}
                  <strong className="text-slate-200">
                    {preview.detectedSheets.ventas ?? 'No detectada'}
                  </strong>{' '}
                  · Finanzas →{' '}
                  <strong className="text-slate-200">
                    {preview.detectedSheets.finanzas ?? 'Valores base ($120.19 / $263.50)'}
                  </strong>
                </p>
              </div>
              <span className="font-mono-num text-xs font-semibold text-blue-300">
                Tasa BCV: {preview.bcvRate.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
              <div className="rounded-lg border border-slate-800 bg-[#0D1526] p-3">
                <p className="text-slate-400">Compras / Stock Base</p>
                <p className="font-mono-num mt-1 text-base font-bold text-white">
                  {preview.comprasUnitsTotal} uds
                </p>
                <p className="font-mono-num text-[11px] text-slate-400">
                  {preview.comprasRowsParsed} filas · {formatUSD(preview.comprasCostTotal)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#0D1526] p-3">
                <p className="text-slate-400">Ventas FIFO Procesadas</p>
                <p className="font-mono-num mt-1 text-base font-bold text-emerald-400">
                  {preview.ventasUnitsSold} uds
                </p>
                <p className="font-mono-num text-[11px] text-slate-400">
                  COGS {formatUSD(preview.ventasFifoCogsTotal)} · Utilidad{' '}
                  {formatUSD(preview.ventasNetProfitTotal)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#0D1526] p-3">
                <p className="text-slate-400">Stock Final Bodega</p>
                <p className="font-mono-num mt-1 text-base font-bold text-white">
                  {preview.resultingStockUnits} uds
                </p>
                <p className="text-[11px] text-slate-400">
                  {preview.resultingSkusCount} SKUs exactos
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#0D1526] p-3">
                <p className="text-slate-400">Caja y CxC Reales</p>
                <p className="font-mono-num mt-1 text-base font-bold text-white">
                  {formatUSD(preview.cashOnHand)}
                </p>
                <p className="font-mono-num text-[11px] text-amber-300">
                  CxC: {formatUSD(preview.receivablesTotal)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-[11px]">
              <div className="rounded-lg border border-slate-800/80 bg-[#0D1526] p-3">
                <p className="font-semibold text-slate-200 mb-1.5">
                  Columnas mapeadas en Compras
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(preview.mappedColumns.compras).length === 0 ? (
                    <span className="text-slate-500">Sin columnas mapeadas</span>
                  ) : (
                    Object.entries(preview.mappedColumns.compras).map(([k, col]) => (
                      <span
                        key={k}
                        className="rounded border border-slate-700 bg-[#080E1C] px-2 py-0.5 text-slate-300"
                      >
                        {COMPRAS_FIELD_LABELS[k] ?? k}:{' '}
                        <strong className="text-blue-300">{col}</strong>
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800/80 bg-[#0D1526] p-3">
                <p className="font-semibold text-slate-200 mb-1.5">
                  Columnas mapeadas en Ventas
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(preview.mappedColumns.ventas).length === 0 ? (
                    <span className="text-slate-500">Sin columnas mapeadas</span>
                  ) : (
                    Object.entries(preview.mappedColumns.ventas).map(([k, col]) => (
                      <span
                        key={k}
                        className="rounded border border-slate-700 bg-[#080E1C] px-2 py-0.5 text-slate-300"
                      >
                        {VENTAS_FIELD_LABELS[k] ?? k}:{' '}
                        <strong className="text-emerald-300">{col}</strong>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            {preview.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-1">
                <p className="font-semibold">Observaciones del mapeo:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                  {preview.warnings.slice(0, 5).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setPendingState(null);
                }}
                className="min-h-[42px] rounded-lg border border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancelar Vista Previa
              </button>
              <button
                type="button"
                data-testid="btn-confirm-excel-import"
                disabled={isSaving}
                onClick={() => void handleConfirmImport()}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
              >
                <Database className="h-4 w-4" aria-hidden="true" />
                {isSaving
                  ? 'Sincronizando a Firebase...'
                  : 'Confirmar e Importar a Firebase (Reemplazar Todo)'}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-slate-400">
            ¿Quieres empezar desde cero sin datos de prueba anteriores?
          </p>

          {!confirmPurge ? (
            <button
              type="button"
              data-testid="btn-purge-ghost-data"
              onClick={() => setConfirmPurge(true)}
              className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Eliminar Datos Fantasma
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="btn-confirm-purge-ghost-data"
                disabled={isSaving}
                onClick={() => void handleConfirmPurge()}
                className="min-h-[38px] rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
              >
                Confirmar Limpieza Total
              </button>
              <button
                type="button"
                onClick={() => setConfirmPurge(false)}
                className="min-h-[38px] rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
