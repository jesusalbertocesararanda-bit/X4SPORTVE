import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Globe,
  RefreshCcw,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react';
import type { RateSyncInfo } from '../App';
import type { AppState } from '../types/erp';

interface SettingsModalProps {
  isOpen: boolean;
  state: AppState;
  rateSync: RateSyncInfo;
  onClose: () => void;
  onOpenExcelImport: () => void;
  onSyncRatesFromApi: () => Promise<{ ok: boolean; error?: string }>;
  onUpdateRates: (bcv: number, usdt: number) => { ok: boolean; error?: string };
  onResetDemoData: () => void;
}

export function SettingsModal({
  isOpen,
  state,
  rateSync,
  onClose,
  onOpenExcelImport,
  onSyncRatesFromApi,
  onUpdateRates,
  onResetDemoData,
}: SettingsModalProps) {
  const [bcvInput, setBcvInput] = useState(state.exchangeRates.bcv.toFixed(2));
  const [usdtInput, setUsdtInput] = useState(state.exchangeRates.usdt.toFixed(2));
  const [downloadingHtml, setDownloadingHtml] = useState(false);
  const [confirmDemoReset, setConfirmDemoReset] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    setBcvInput(state.exchangeRates.bcv.toFixed(2));
    setUsdtInput(state.exchangeRates.usdt.toFixed(2));
  }, [state.exchangeRates.bcv, state.exchangeRates.usdt]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSaveRates = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = onUpdateRates(Number(bcvInput), Number(usdtInput));
    if (!res.ok) {
      setFeedback({
        type: 'error',
        text: res.error ?? 'Error al guardar las tasas.',
      });
      return;
    }
    setFeedback({
      type: 'success',
      text: 'Tasas BCV / USDT actualizadas en Firebase Realtime Database.',
    });
  };

  const handleDownloadStandaloneHtml = async () => {
    setFeedback(null);
    if (window.location.protocol === 'file:') {
      setFeedback({
        type: 'success',
        text: 'Ya estás ejecutando el archivo HTML portátil completo de X4SPORT.',
      });
      return;
    }

    setDownloadingHtml(true);
    try {
      const response = await fetch('/x4sport-standalone.html', {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('No se encontró el paquete HTML autocontenido.');
      }
      const htmlText = await response.text();
      if (!htmlText.toLowerCase().includes('<!doctype html>')) {
        throw new Error('El archivo generado no tiene formato HTML válido.');
      }
      const blob = new Blob([htmlText], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'index.html';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({
        type: 'success',
        text: 'Archivo autocontenido index.html descargado para Netlify Drop.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'No se pudo descargar el archivo index.html.',
      });
    } finally {
      setDownloadingHtml(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      data-testid="settings-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-[#0D1526] p-5 shadow-2xl sm:p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-2.5 text-blue-400">
              <Settings className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="settings-modal-title"
                className="font-display text-lg font-bold text-white sm:text-xl"
              >
                Configuración del Sistema X4SPORT
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Respaldo Excel, tasas BCV/USDT, exportación portátil y mantenimiento de base de datos.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar configuración"
            className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-700 bg-[#080E1C] p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {feedback && (
          <div
            role="status"
            className={`flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-medium ${
              feedback.type === 'error'
                ? 'border border-red-500/35 bg-red-500/10 text-red-200'
                : 'border border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
            }`}
          >
            {feedback.type === 'success' && (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Respaldo Excel & Portabilidad */}
        <section className="space-y-3 rounded-xl border border-slate-800 bg-[#080E1C] p-4">
          <h3 className="text-sm font-semibold text-white">
            Respaldo Excel (.xlsx) y Exportación HTML
          </h3>
          <p className="text-xs text-slate-400">
            Importa tu hoja de cálculo oficial con mapeo automático a Firebase o descarga el paquete autocontenido.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              type="button"
              data-testid="btn-open-excel-import"
              onClick={() => {
                onClose();
                onOpenExcelImport();
              }}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-600/15 px-4 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-600/25 hover:text-white"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              Sincronizar y Cargar Respaldo Excel (.xlsx)
            </button>

            <button
              type="button"
              onClick={() => void handleDownloadStandaloneHtml()}
              disabled={downloadingHtml}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-700 bg-[#0D1526] px-4 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-60"
            >
              <Download className="h-4 w-4 text-blue-400" aria-hidden="true" />
              {downloadingHtml
                ? 'Generando...'
                : 'Descargar index.html (Netlify Drop)'}
            </button>
          </div>
        </section>

        {/* Tasas de cambio */}
        <section className="space-y-3 rounded-xl border border-slate-800 bg-[#080E1C] p-4">
          <h3 className="text-sm font-semibold text-white">
            Tasas de Cambio Globales (BCV / USDT)
          </h3>
          <form onSubmit={handleSaveRates} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="settings-bcv"
                className="block text-xs font-medium text-slate-300"
              >
                Tasa BCV (Bs/USD)
              </label>
              <input
                id="settings-bcv"
                type="number"
                step="0.01"
                min="0.01"
                value={bcvInput}
                onChange={(e) => setBcvInput(e.target.value)}
                className="font-mono-num mt-1 w-full min-h-[42px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="settings-usdt"
                className="block text-xs font-medium text-slate-300"
              >
                Tasa USDT (Bs/USDT)
              </label>
              <input
                id="settings-usdt"
                type="number"
                step="0.01"
                min="0.01"
                value={usdtInput}
                onChange={(e) => setUsdtInput(e.target.value)}
                className="font-mono-num mt-1 w-full min-h-[42px] rounded-lg border border-slate-700 bg-[#070D19] px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2 flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => void onSyncRatesFromApi()}
                disabled={rateSync.status === 'loading'}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-700 bg-[#0D1526] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-60"
              >
                <Globe className="h-4 w-4" aria-hidden="true" />
                {rateSync.status === 'loading' ? 'Sincronizando...' : 'Sincronizar API'}
              </button>
              <button
                type="submit"
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Guardar Tasas
              </button>
            </div>
          </form>
        </section>

        {/* Restaurar inventario demo */}
        <section className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#080E1C] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Datos de Demostración (176 unidades)
            </h3>
            <p className="text-xs text-slate-400">
              Restaura el catálogo de prueba de 176 franelas si deseas probar ventas o matriz de stock.
            </p>
          </div>
          {!confirmDemoReset ? (
            <button
              type="button"
              onClick={() => setConfirmDemoReset(true)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-700 bg-[#0D1526] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Restaurar Catálogo Demo
            </button>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onResetDemoData();
                  setConfirmDemoReset(false);
                  setFeedback({
                    type: 'success',
                    text: 'Catálogo de demostración restaurado en Firebase.',
                  });
                }}
                className="min-h-[38px] rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setConfirmDemoReset(false)}
                className="min-h-[38px] rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
