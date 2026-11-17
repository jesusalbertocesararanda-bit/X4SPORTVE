import { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  ImagePlus,
  Link2,
  MessageCircle,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type { AppState, TeamCategory } from '../types/erp';
import { normalizeVersionDisplay } from '../utils/finance';
import {
  buildShareableCatalogUrl,
  CATALOG_WHATSAPP_ADVISORS,
  compressCatalogImageFile,
  convertGoogleDriveUrlToDirect,
  extractGoogleDriveFileId,
  normalizeCatalogImageUrl,
  normalizeCatalogModelKey,
  resolveCatalogKeywords,
  resolveCatalogPhoto,
} from '../utils/publicCatalog';
import { JerseyShowcaseFallback, TeamCrest } from './TeamCrest';

interface CatalogAdminViewProps {
  state: AppState;
  onToggleCatalogEnabled: (enabled: boolean) => void;
  onSaveCatalogPhoto: (modelKey: string, photoUrl: string) => void;
  onRemoveCatalogPhoto: (modelKey: string) => void;
  onSaveCatalogKeywords: (modelKey: string, keywords: string) => void;
  onOpenCatalogPreview: () => void;
}

interface CatalogAdminModelEntry {
  key: string;
  team: TeamCategory;
  model: string;
  version: 'Fans' | 'Player' | 'Retro';
  stockAvailable: number;
  inTransitUnits: number;
  photoUrl?: string;
  keywords?: string;
}

export function CatalogAdminView({
  state,
  onToggleCatalogEnabled,
  onSaveCatalogPhoto,
  onRemoveCatalogPhoto,
  onSaveCatalogKeywords,
  onOpenCatalogPreview,
}: CatalogAdminViewProps) {
  const catalogEnabled = state.catalogEnabled !== false;
  const shareUrl = useMemo(() => buildShareableCatalogUrl(), []);

  const [copiedLink, setCopiedLink] = useState(false);
  const [adminSearch, setAdminSearch] = useState('');
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({});
  const [keywordDrafts, setKeywordDrafts] = useState<Record<string, string>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const allModelEntries = useMemo(() => {
    const map = new Map<string, CatalogAdminModelEntry>();

    for (const item of state.inventory ?? []) {
      const version = normalizeVersionDisplay(item.version);
      const key = normalizeCatalogModelKey(item.model, version);
      const existing = map.get(key);
      if (existing) {
        existing.stockAvailable += Math.max(0, item.stock);
      } else {
        map.set(key, {
          key,
          team: item.team || 'Otro',
          model: item.model.trim(),
          version,
          stockAvailable: Math.max(0, item.stock),
          inTransitUnits: 0,
          photoUrl: resolveCatalogPhoto(
            item.model,
            version,
            state.catalogPhotos,
          ),
          keywords: resolveCatalogKeywords(
            item.model,
            version,
            state.catalogKeywords,
          ),
        });
      }
    }

    for (const batch of state.purchaseBatches ?? []) {
      if (batch.status !== 'EN TRÁNSITO') continue;
      for (const item of batch.items ?? []) {
        const qty = item.orderedQuantity ?? item.quantity ?? 0;
        if (qty <= 0) continue;
        const version = normalizeVersionDisplay(item.version);
        const key = normalizeCatalogModelKey(item.model, version);
        const existing = map.get(key);
        if (existing) {
          existing.inTransitUnits += qty;
        } else {
          map.set(key, {
            key,
            team: item.team || 'Otro',
            model: item.model.trim(),
            version,
            stockAvailable: 0,
            inTransitUnits: qty,
            photoUrl: resolveCatalogPhoto(
              item.model,
              version,
              state.catalogPhotos,
            ),
            keywords: resolveCatalogKeywords(
              item.model,
              version,
              state.catalogKeywords,
            ),
          });
        }
      }
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        b.stockAvailable - a.stockAvailable ||
        a.team.localeCompare(b.team) ||
        a.model.localeCompare(b.model),
    );
  }, [
    state.catalogKeywords,
    state.catalogPhotos,
    state.inventory,
    state.purchaseBatches,
  ]);

  const filteredModels = useMemo(() => {
    const q = adminSearch.trim().toLowerCase();
    if (!q) return allModelEntries;
    return allModelEntries.filter(
      (entry) =>
        entry.model.toLowerCase().includes(q) ||
        entry.team.toLowerCase().includes(q) ||
        entry.version.toLowerCase().includes(q) ||
        (entry.keywords ?? '').toLowerCase().includes(q),
    );
  }, [adminSearch, allModelEntries]);

  const handleCopyShareUrl = async () => {
    setStatusFeedback(null);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setStatusFeedback({
        type: 'error',
        text: 'Copia manualmente el enlace desde la barra de texto.',
      });
    }
  };

  const handleUploadDevicePhoto = async (
    entryKey: string,
    modelLabel: string,
    file: File | undefined,
  ) => {
    if (!file) return;
    setStatusFeedback(null);
    setUploadingKey(entryKey);
    try {
      const compressedDataUrl = await compressCatalogImageFile(file);
      onSaveCatalogPhoto(entryKey, compressedDataUrl);
      setUrlDrafts((prev) => ({ ...prev, [entryKey]: '' }));
      setStatusFeedback({
        type: 'success',
        text: `Foto de "${modelLabel}" optimizada y guardada en el catálogo.`,
      });
    } catch (err) {
      setStatusFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'No se pudo procesar la foto seleccionada.',
      });
    } finally {
      setUploadingKey(null);
    }
  };

  const handleSaveUrl = (entry: CatalogAdminModelEntry) => {
    setStatusFeedback(null);
    const raw = (urlDrafts[entry.key] ?? '').trim();
    if (!raw) {
      setStatusFeedback({
        type: 'error',
        text: 'Pega un enlace de Google Drive o una URL de imagen válida.',
      });
      return;
    }
    const isDrive = extractGoogleDriveFileId(raw) !== null;
    const normalized = normalizeCatalogImageUrl(raw);
    onSaveCatalogPhoto(entry.key, normalized);
    setUrlDrafts((prev) => ({ ...prev, [entry.key]: normalized }));
    setStatusFeedback({
      type: 'success',
      text: isDrive
        ? `Enlace de Google Drive optimizado automáticamente a imagen directa (${normalized}) para "${entry.model}".`
        : `Enlace de imagen guardado para "${entry.model} (${entry.version})".`,
    });
  };

  const handleSaveKeywords = (entry: CatalogAdminModelEntry) => {
    setStatusFeedback(null);
    const value = (keywordDrafts[entry.key] ?? entry.keywords ?? '').trim();
    onSaveCatalogKeywords(entry.key, value);
    setStatusFeedback({
      type: 'success',
      text: `Etiquetas de búsqueda actualizadas para "${entry.model}".`,
    });
  };

  const shareWhatsAppHref = `https://wa.me/?text=${encodeURIComponent(
    `⚽ ¡Revisa nuestro catálogo actualizado en tiempo real de camisetas X4SPORT! ${shareUrl}`,
  )}`;

  const availableModelsCount = allModelEntries.filter(
    (m) => m.stockAvailable > 0,
  ).length;
  const transitModelsCount = allModelEntries.filter(
    (m) => m.inTransitUnits > 0,
  ).length;

  return (
    <div className="space-y-6">
      {/* Header + Interruptor Principal */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">
            Catálogo Público para Clientes
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Sincronizado en tiempo real con tu inventario FIFO ({availableModelsCount} modelos disponibles · {transitModelsCount} en camino).
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-[#080E1C] px-4 py-3 shrink-0">
          <div className="text-right">
            <span
              data-testid="catalog-switch-status"
              className={`block text-xs font-bold ${
                catalogEnabled ? 'text-emerald-400' : 'text-slate-400'
              }`}
            >
              {catalogEnabled ? 'Catálogo ACTIVO' : 'Catálogo PAUSADO'}
            </span>
            <span className="block text-[11px] text-slate-500">
              Acceso público
            </span>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={catalogEnabled}
            aria-label="Activar o desactivar acceso público al catálogo"
            data-testid="catalog-master-switch"
            onClick={() => onToggleCatalogEnabled(!catalogEnabled)}
            className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
              catalogEnabled
                ? 'border-blue-400 bg-blue-600'
                : 'border-slate-700 bg-slate-800'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                catalogEnabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Enlace Compartible + Rotación WhatsApp */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="space-y-3 rounded-xl border border-slate-800 bg-[#0D1526] p-5 lg:col-span-7">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-blue-400" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-white">
              Enlace Compartible para WhatsApp
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Envía este enlace directo a tus clientes. Si un modelo llega a 0 unidades en inventario, desaparece automáticamente de los disponibles.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              readOnly
              aria-label="Enlace público del catálogo X4SPORT"
              data-testid="catalog-share-url-input"
              value={shareUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="font-mono-num min-h-[42px] flex-1 rounded-lg border border-slate-700 bg-[#070D19] px-3 py-2 text-xs text-blue-200 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="button"
              data-testid="btn-copy-catalog-url"
              onClick={() => void handleCopyShareUrl()}
              className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-600/20 px-4 py-2 text-xs font-semibold text-blue-200 hover:bg-blue-600/30 hover:text-white whitespace-nowrap shrink-0"
            >
              {copiedLink ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  ¡Copiado!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copiar Enlace
                </>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              data-testid="btn-preview-public-catalog"
              onClick={onOpenCatalogPreview}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 whitespace-nowrap"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              Ver Vista Cliente
            </button>

            <a
              href={shareWhatsAppHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-600/15 px-4 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-600/25 hover:text-white whitespace-nowrap"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Enviar por WhatsApp
            </a>

            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-700 bg-[#080E1C] px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white whitespace-nowrap"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Abrir en pestaña nueva
            </a>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-slate-800 bg-[#0D1526] p-5 lg:col-span-5">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-white">
              Rotación Automática de Leads WhatsApp
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Cada vez que un cliente presiona &ldquo;Comprar&rdquo; o &ldquo;Apartar&rdquo;, el sistema alterna automáticamente entre ambos socios:
          </p>
          <div className="space-y-2 pt-1">
            {CATALOG_WHATSAPP_ADVISORS.map((adv, idx) => (
              <div
                key={adv.id}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#080E1C] px-3.5 py-2.5 text-xs"
              >
                <span className="font-semibold text-white">
                  Turno {idx + 1} · {adv.name}
                </span>
                <span className="font-mono-num text-emerald-300">
                  {adv.phoneDisplay}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {statusFeedback && (
        <div
          role="status"
          data-testid="catalog-admin-feedback"
          className={`rounded-xl px-4 py-3 text-xs font-medium ${
            statusFeedback.type === 'error'
              ? 'border border-red-500/35 bg-red-500/10 text-red-200'
              : 'border border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          {statusFeedback.text}
        </div>
      )}

      {/* Gestor de Fotos y Palabras Clave */}
      <section className="space-y-4 rounded-xl border border-slate-800 bg-[#0D1526] p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-white flex items-center gap-2">
              <ImagePlus className="h-5 w-5 text-blue-400" aria-hidden="true" />
              Gestión de Fotos y Etiquetas de Búsqueda
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Sube fotos desde tu teléfono/PC o pega un enlace de Google Drive / URL directa para cada modelo.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={adminSearch}
              onChange={(e) => setAdminSearch(e.target.value)}
              placeholder="Filtrar modelos..."
              aria-label="Filtrar modelos en gestor de fotos"
              className="w-full min-h-[40px] rounded-lg border border-slate-700 bg-[#070D19] pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {filteredModels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-[#080E1C] p-8 text-center text-xs text-slate-400">
            No hay modelos registrados en inventario ni pedidos en tránsito todavía.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredModels.map((entry) => {
              const urlVal = urlDrafts[entry.key] ?? entry.photoUrl ?? '';
              const kwVal = keywordDrafts[entry.key] ?? entry.keywords ?? '';
              const isUploading = uploadingKey === entry.key;

              return (
                <article
                  key={entry.key}
                  data-testid={`catalog-admin-item-${entry.key}`}
                  className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#080E1C] p-4 sm:flex-row"
                >
                  <div className="h-36 w-full shrink-0 overflow-hidden rounded-lg border border-slate-800 bg-[#060B16] sm:h-40 sm:w-32">
                    {entry.photoUrl ? (
                      <img
                        src={entry.photoUrl}
                        alt={entry.model}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <JerseyShowcaseFallback
                        team={entry.team}
                        model={entry.model}
                        version={entry.version}
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <TeamCrest team={entry.team} className="h-5 w-5 shrink-0" />
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-white">
                            {entry.model}
                          </h3>
                          <p className="text-[11px] text-slate-400">
                            {entry.team} · {entry.version} ·{' '}
                            <span className="font-mono-num text-emerald-300">
                              {entry.stockAvailable} stock
                            </span>
                            {entry.inTransitUnits > 0 && (
                              <span className="font-mono-num text-amber-300">
                                {' '}
                                · {entry.inTransitUnits} en camino
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {entry.photoUrl && (
                        <button
                          type="button"
                          onClick={() => onRemoveCatalogPhoto(entry.key)}
                          title="Quitar foto"
                          aria-label={`Quitar foto de ${entry.model}`}
                          className="rounded-lg border border-red-500/30 bg-red-500/10 p-1.5 text-red-300 hover:bg-red-500/20 shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    {/* Subida desde dispositivo móvil / PC */}
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-600/15 px-3 py-1 text-[11px] font-semibold text-blue-200 hover:bg-blue-600/25 hover:text-white">
                        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                        {isUploading ? 'Procesando...' : 'Subir foto (Móvil/PC)'}
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          disabled={isUploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            void handleUploadDevicePhoto(entry.key, entry.model, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>

                    {/* Enlace Google Drive o URL */}
                    <div className="space-y-1">
                      <div className="flex gap-1.5">
                        <input
                          type="url"
                          value={urlVal.startsWith('data:image/') ? '' : urlVal}
                          onChange={(e) =>
                            setUrlDrafts((prev) => ({
                              ...prev,
                              [entry.key]: e.target.value,
                            }))
                          }
                          placeholder="Pega enlace de Google Drive (compartir) o URL..."
                          aria-label={`URL de foto para ${entry.model}`}
                          className="min-h-[34px] flex-1 rounded-lg border border-slate-700 bg-[#070D19] px-2.5 py-1 text-[11px] text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveUrl(entry)}
                          className="min-h-[34px] rounded-lg border border-blue-500/40 bg-blue-600/20 px-2.5 py-1 text-[11px] font-semibold text-blue-200 hover:bg-blue-600/30 hover:text-white shrink-0 transition-colors"
                        >
                          Guardar URL
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        ☁️ Soporta enlaces de Google Drive (<span className="text-slate-300 font-mono">drive.google.com/file/d/...</span>): se convierten a visualización directa (<span className="text-slate-300 font-mono">lh3.googleusercontent.com/d/...</span>) ahorrando almacenamiento local.
                      </p>
                    </div>

                    {/* Etiquetas / jugadores para buscador */}
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={kwVal}
                        onChange={(e) =>
                          setKeywordDrafts((prev) => ({
                            ...prev,
                            [entry.key]: e.target.value,
                          }))
                        }
                        placeholder="Etiquetas / jugadores (ej. Lamine Yamal, 19)"
                        aria-label={`Etiquetas de búsqueda para ${entry.model}`}
                        className="min-h-[34px] flex-1 rounded-lg border border-slate-700 bg-[#070D19] px-2.5 py-1 text-[11px] text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveKeywords(entry)}
                        className="min-h-[34px] rounded-lg border border-slate-700 bg-[#0D1526] px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800 hover:text-white shrink-0"
                      >
                        Etiquetas
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
