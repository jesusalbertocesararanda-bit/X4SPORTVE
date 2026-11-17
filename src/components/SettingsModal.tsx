import { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Globe,
  Plus,
  RefreshCcw,
  RefreshCw,
  Settings,
  ShieldAlert,
  Store,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { RateSyncInfo } from '../App';
import type { AppState, AuthorizedUserRecord } from '../types/erp';
import {
  canAccessConfiguration,
  getMergedAuthorizedUsers,
  MAIN_ADMIN_EMAIL,
  type ERPUser,
} from '../utils/auth';
import type { GoogleCalendarAuthState } from '../utils/googleCalendar';
import { buildShareableCatalogUrl } from '../utils/publicCatalog';
import { GoogleCalendarBanner } from './GoogleCalendarBanner';

interface SettingsModalProps {
  isOpen: boolean;
  currentUser: ERPUser | null;
  state: AppState;
  rateSync: RateSyncInfo;
  calendarAuth: GoogleCalendarAuthState;
  onConnectGoogleCalendar: () => Promise<boolean>;
  onDisconnectGoogleCalendar: () => Promise<void>;
  onToggleCatalogEnabled: (enabled: boolean) => void;
  onOpenCatalogAdmin: () => void;
  onClose: () => void;
  onOpenExcelImport: () => void;
  onSyncRatesFromApi: () => Promise<{ ok: boolean; error?: string }>;
  onUpdateRates: (bcv: number, usdt: number) => { ok: boolean; error?: string };
  onResetDemoData: () => void;
  onUpdateAuthorizedUsers?: (users: AuthorizedUserRecord[]) => void;
}

export function SettingsModal({
  isOpen,
  currentUser,
  state,
  rateSync,
  calendarAuth,
  onConnectGoogleCalendar,
  onDisconnectGoogleCalendar,
  onToggleCatalogEnabled,
  onOpenCatalogAdmin,
  onClose,
  onOpenExcelImport,
  onSyncRatesFromApi,
  onUpdateRates,
  onResetDemoData,
  onUpdateAuthorizedUsers,
}: SettingsModalProps) {
  const [bcvInput, setBcvInput] = useState(state.exchangeRates.bcv.toFixed(2));
  const [usdtInput, setUsdtInput] = useState(state.exchangeRates.usdt.toFixed(2));
  const [downloadingHtml, setDownloadingHtml] = useState(false);
  const [confirmDemoReset, setConfirmDemoReset] = useState(false);
  const [copiedCatalogUrl, setCopiedCatalogUrl] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Form for pre-registering a new authorized user
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'partner' | 'admin'>('partner');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [showAddUserForm, setShowAddUserForm] = useState(false);

  const catalogEnabled = state.catalogEnabled !== false;
  const shareableCatalogUrl = buildShareableCatalogUrl();

  const handleCopyCatalogUrl = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareableCatalogUrl);
      }
      setCopiedCatalogUrl(true);
      setTimeout(() => setCopiedCatalogUrl(false), 2000);
    } catch {
      setFeedback({
        type: 'success',
        text: `Enlace del catálogo público: ${shareableCatalogUrl}`,
      });
    }
  };

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

  // Strict check: Only MAIN_ADMIN_EMAIL can enter Configuration
  if (!canAccessConfiguration(currentUser)) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        data-testid="settings-modal-restricted"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      >
        <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-[#0D1526] p-6 shadow-2xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-red-500/40 bg-red-500/15 p-2.5 text-red-400">
              <ShieldAlert className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white">
                Control de Seguridad ERP (SAP)
              </h2>
              <p className="text-xs text-red-300">
                Acceso restringido: Solo Administrador Principal ({MAIN_ADMIN_EMAIL})
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#080E1C] p-4 text-xs text-slate-300 leading-relaxed space-y-2">
            <p>
              El módulo de <strong>Configuración del Sistema</strong> contiene funciones críticas (gestión de usuarios y socios, tasas globales, conexión de Google Calendar y respaldos).
            </p>
            <p className="text-slate-400">
              Tu usuario actual (<span className="text-white font-medium">{currentUser?.name ?? 'Invitado'}</span> &lt;{currentUser?.email ?? 'sin sesión'}&gt;) no posee permisos de Administrador Principal.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[42px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors"
          >
            Entendido, volver al ERP
          </button>
        </div>
      </div>
    );
  }

  const authorizedUsersList = getMergedAuthorizedUsers(state.authorizedUsers);

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

  const handleAddAuthorizedUser = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const cleanEmail = newUserEmail.trim().toLowerCase();
    const cleanName = newUserName.trim();

    if (!cleanEmail || !cleanName) {
      setFeedback({
        type: 'error',
        text: 'Ingresa el nombre completo y correo electrónico del usuario.',
      });
      return;
    }

    const currentUsers = getMergedAuthorizedUsers(state.authorizedUsers);
    const existing = currentUsers.find(
      (u) => u.email.toLowerCase() === cleanEmail,
    );

    if (existing) {
      setFeedback({
        type: 'error',
        text: `El correo "${cleanEmail}" ya está registrado como ${existing.name}.`,
      });
      return;
    }

    const newUser: AuthorizedUserRecord = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      email: cleanEmail,
      name: cleanName,
      role: newUserRole,
      title: newUserRole === 'admin' ? 'Administrador Principal' : 'Socio Operativo',
      phone: newUserPhone.trim() || undefined,
      firstLoginPending: true,
      avatarBg: newUserRole === 'admin' ? 'bg-blue-600' : 'bg-emerald-600',
      createdAt: new Date().toISOString(),
    };

    const updated = [...currentUsers, newUser];
    if (onUpdateAuthorizedUsers) {
      onUpdateAuthorizedUsers(updated);
    }

    setNewUserName('');
    setNewUserEmail('');
    setNewUserPhone('');
    setNewUserRole('partner');
    setShowAddUserForm(false);
    setFeedback({
      type: 'success',
      text: `Usuario "${cleanName}" pre-registrado exitosamente. Al iniciar sesión por primera vez, el sistema le pedirá verificar su correo con código OTP y definir su contraseña personal.`,
    });
  };

  const handleDeleteUser = (targetEmail: string) => {
    const cleanEmail = targetEmail.trim().toLowerCase();
    if (
      cleanEmail === MAIN_ADMIN_EMAIL.toLowerCase() ||
      cleanEmail === 'jesus@x4sport.app'
    ) {
      setFeedback({
        type: 'error',
        text: 'No es posible eliminar al Administrador Principal del sistema.',
      });
      return;
    }

    const currentUsers = getMergedAuthorizedUsers(state.authorizedUsers);
    const filtered = currentUsers.filter(
      (u) => u.email.toLowerCase() !== cleanEmail,
    );

    if (onUpdateAuthorizedUsers) {
      onUpdateAuthorizedUsers(filtered);
    }

    setFeedback({
      type: 'success',
      text: `Usuario con correo "${targetEmail}" eliminado del sistema.`,
    });
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
                Administrador Principal: <span className="text-white font-medium">{MAIN_ADMIN_EMAIL}</span>
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

        {/* Sección: Gestión de Usuarios y Socios Autorizados (Roles SAP) */}
        <section className="space-y-4 rounded-xl border border-slate-800 bg-[#080E1C] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Users className="h-4 w-4 text-blue-400" aria-hidden="true" />
                Gestión de Usuarios y Socios Autorizados (Roles SAP)
              </h3>
              <p className="mt-0.5 text-xs text-slate-400">
                Pre-registra nuevos socios y colaboradores. En su primer login crearán su contraseña mediante verificación OTP.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddUserForm((prev) => !prev)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-600/15 px-3 py-1.5 text-xs font-semibold text-blue-200 hover:bg-blue-600/25 hover:text-white transition-colors"
            >
              {showAddUserForm ? (
                <>
                  <X className="h-3.5 w-3.5" />
                  <span>Cancelar</span>
                </>
              ) : (
                <>
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Pre-registrar Usuario</span>
                </>
              )}
            </button>
          </div>

          {/* Formulario de pre-registro */}
          {showAddUserForm && (
            <form
              onSubmit={handleAddAuthorizedUser}
              className="rounded-xl border border-blue-500/30 bg-[#070D19] p-4 space-y-3"
            >
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                <Plus className="h-3.5 w-3.5 text-blue-400" />
                Pre-registro de Nuevo Usuario ERP
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Carlos Mendoza"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="w-full min-h-[38px] rounded-lg border border-slate-700 bg-[#0D1526] px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Correo Electrónico *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="carlos@x4sport.app o gmail"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="w-full min-h-[38px] rounded-lg border border-slate-700 bg-[#0D1526] px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Rol en el ERP
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) =>
                      setNewUserRole(e.target.value as 'partner' | 'admin')
                    }
                    className="w-full min-h-[38px] rounded-lg border border-slate-700 bg-[#0D1526] px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="partner">Socio Operativo</option>
                    <option value="admin">Administrador Secundario</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Teléfono / WhatsApp
                  </label>
                  <input
                    type="text"
                    placeholder="+58 412-..."
                    value={newUserPhone}
                    onChange={(e) => setNewUserPhone(e.target.value)}
                    className="w-full min-h-[38px] rounded-lg border border-slate-700 bg-[#0D1526] px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="submit"
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors shadow-sm"
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  <span>Guardar Pre-registro</span>
                </button>
              </div>
            </form>
          )}

          {/* Tabla / Lista de usuarios */}
          <div className="rounded-xl border border-slate-800 bg-[#070D19] overflow-hidden">
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/80">
              {authorizedUsersList.map((u) => {
                const isMainAdmin =
                  u.email.toLowerCase() === MAIN_ADMIN_EMAIL.toLowerCase();
                return (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-3 p-3 hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`h-8 w-8 rounded-lg ${
                          u.avatarBg || 'bg-blue-600'
                        } flex items-center justify-center text-white text-xs font-bold shrink-0`}
                      >
                        {u.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-white truncate">
                            {u.name}
                          </p>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {u.role === 'admin' ? 'Admin' : 'Socio'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">
                          {u.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {u.firstLoginPending ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          🟡 Primer ingreso pendiente
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          🟢 Activo
                        </span>
                      )}

                      {!isMainAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u.email)}
                          title={`Eliminar acceso a ${u.name}`}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Integración Google Calendar */}
        <GoogleCalendarBanner
          variant="card"
          authState={calendarAuth}
          onConnect={onConnectGoogleCalendar}
          onDisconnect={onDisconnectGoogleCalendar}
        />

        {/* Catálogo Público para Clientes */}
        <section className="space-y-3 rounded-xl border border-slate-800 bg-[#080E1C] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Store className="h-4 w-4 text-blue-400" aria-hidden="true" />
                Catálogo Público Interactivo (WhatsApp)
              </h3>
              <p className="mt-0.5 text-xs text-slate-400">
                Activa o pausa el enlace público para clientes sincronizado en tiempo real con el inventario FIFO.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={catalogEnabled}
              aria-label="Activar catálogo público para clientes"
              data-testid="settings-catalog-switch"
              onClick={() => onToggleCatalogEnabled(!catalogEnabled)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                catalogEnabled
                  ? 'border-emerald-400/50 bg-emerald-600'
                  : 'border-slate-600 bg-slate-800'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  catalogEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleCopyCatalogUrl()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0D1526] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white"
            >
              {copiedCatalogUrl ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
              )}
              {copiedCatalogUrl ? '¡Enlace copiado!' : 'Copiar Enlace'}
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCatalogAdmin();
              }}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-600/15 px-3 py-1.5 text-xs font-semibold text-blue-200 hover:bg-blue-600/25 hover:text-white"
            >
              Gestionar Fotos y Vista Previa
            </button>
          </div>
        </section>

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
