import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  MessageCircle,
  Search,
  ShoppingBag,
  X,
} from 'lucide-react';
import type { AppState, JerseySize } from '../types/erp';
import { ALL_JERSEY_SIZES, formatUSD, formatVES } from '../utils/finance';
import {
  advanceWhatsAppTurnIndex,
  buildCatalogWhatsAppHref,
  buildPublicCatalogGroups,
  buildUpcomingTransitCards,
  calculateCatalogBsPrice,
  filterPublicCatalogGroups,
  filterUpcomingTransitCards,
  getCurrentWhatsAppTurnIndex,
  isRateValid,
  type PublicCatalogProduct,
  type PublicCatalogTeamGroup,
  type PublicTransitCard,
} from '../utils/publicCatalog';
import { X4SPORT_LOGO_SRC } from '../utils/receiptJpg';
import { JerseyShowcaseFallback, TeamCrest } from './TeamCrest';

interface PublicCatalogViewProps {
  state: AppState;
  isPreviewMode?: boolean;
  onExitPreview?: () => void;
}

type VersionFilter = 'Todas' | 'Player' | 'Fans' | 'Retro';
type SizeFilter = 'Todas' | JerseySize;

const VERSION_FILTERS: VersionFilter[] = ['Todas', 'Player', 'Fans', 'Retro'];
const SIZE_FILTERS: SizeFilter[] = ['Todas', ...ALL_JERSEY_SIZES];

function CatalogProductCard({
  product,
  usdtRate,
  waTurnIndex,
  onWhatsAppClick,
}: {
  product: PublicCatalogProduct;
  usdtRate: number;
  waTurnIndex: number;
  onWhatsAppClick: () => void;
}) {
  const [selectedSize, setSelectedSize] = useState<JerseySize>(
    product.sizes[0]?.size ?? 'M',
  );
  const [imgError, setImgError] = useState(false);

  const activeSizeInfo =
    product.sizes.find((s) => s.size === selectedSize) ?? product.sizes[0];
  const currentPrice = activeSizeInfo?.salePrice ?? product.minPrice;
  const currentStock = activeSizeInfo?.stock ?? product.totalStock;
  const currentSizeLabel = activeSizeInfo?.size ?? 'M';

  const { advisor, href } = buildCatalogWhatsAppHref(waTurnIndex, {
    model: product.model,
    version: product.version,
    size: currentSizeLabel,
    isTransit: false,
  });

  const showPhoto = Boolean(product.photoUrl && !imgError);

  return (
    <article
      data-testid={`catalog-card-${product.key}`}
      className="flex w-[268px] sm:w-[288px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#0D1526] transition-transform duration-150 hover:-translate-y-0.5 hover:border-blue-500/45"
    >
      {/* 4:3 Imagen / Showcase */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#070D19]">
        {showPhoto ? (
          <img
            src={product.photoUrl}
            alt={`${product.model} (${product.version})`}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <JerseyShowcaseFallback
            team={product.team}
            model={product.model}
            version={product.version}
          />
        )}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#0D1526] to-transparent"
          aria-hidden="true"
        />
      </div>

      {/* Cuerpo */}
      <div className="flex flex-1 flex-col justify-between p-4 pt-2.5 space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-400">
            <span className="truncate">
              {product.version} · {product.team}
            </span>
            <span className="font-mono-num text-slate-500 shrink-0">
              {product.totalStock} uds
            </span>
          </div>

          <h3 className="line-clamp-2 min-h-[2.75rem] font-display text-base font-semibold leading-snug text-white">
            {product.model}
          </h3>

          {/* Selector interactivo de tallas disponibles */}
          <div>
            <span className="sr-only">Tallas disponibles</span>
            <div className="flex flex-wrap gap-1.5">
              {product.sizes.map((szOption) => {
                const isSelected = szOption.size === currentSizeLabel;
                return (
                  <button
                    key={szOption.size}
                    type="button"
                    data-testid={`size-btn-${product.key}-${szOption.size}`}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedSize(szOption.size)}
                    className={`min-h-[32px] min-w-[36px] rounded-md border px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                      isSelected
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : 'border-slate-700 bg-[#080E1C] text-slate-300 hover:border-slate-500 hover:text-white'
                    }`}
                  >
                    {szOption.size}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Urgencia, Precio y CTA WhatsApp */}
        <div className="space-y-3 border-t border-slate-800/80 pt-3">
          <p
            data-testid="catalog-stock-badge"
            className={`text-xs font-semibold ${
              currentStock <= 5 ? 'text-amber-300' : 'text-emerald-300'
            }`}
          >
            🔥 ¡Quedan {currentStock} en stock!
          </p>

          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span
              data-testid="catalog-price-usd"
              className="font-mono-num text-xl font-bold text-white"
            >
              {formatUSD(currentPrice)}{' '}
              <span className="text-xs font-semibold text-slate-400">USDT</span>
            </span>
            {calculateCatalogBsPrice(currentPrice, usdtRate) !== null ? (
              <span
                data-testid="catalog-price-bs"
                className="font-mono-num text-xs font-semibold text-blue-300"
              >
                {formatVES(calculateCatalogBsPrice(currentPrice, usdtRate)!)}
              </span>
            ) : (
              <span
                data-testid="catalog-price-bs-updating"
                className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300 border border-amber-500/25"
                title="Tasa de cambio no disponible o en actualización"
              >
                ⚠️ Precio en Bs en actualización
              </span>
            )}
          </div>

          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="catalog-buy-btn"
            data-advisor={advisor.name}
            data-wa-number={advisor.waNumber}
            onClick={onWhatsAppClick}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 whitespace-nowrap"
          >
            <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Comprar por WhatsApp
          </a>
        </div>
      </div>
    </article>
  );
}

function CatalogTransitCard({
  card,
  usdtRate,
  waTurnIndex,
  onWhatsAppClick,
}: {
  card: PublicTransitCard;
  usdtRate: number;
  waTurnIndex: number;
  onWhatsAppClick: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const firstSize = card.sizes[0]?.size ?? 'M';
  const { advisor, href } = buildCatalogWhatsAppHref(waTurnIndex, {
    model: card.model,
    version: card.version,
    size: firstSize,
    isTransit: true,
  });

  const showPhoto = Boolean(card.photoUrl && !imgError);

  return (
    <article
      data-testid={`transit-card-${card.key}`}
      className="flex w-[268px] sm:w-[288px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#0D1526] transition-transform duration-150 hover:-translate-y-0.5 hover:border-amber-500/40"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#070D19]">
        {showPhoto ? (
          <img
            src={card.photoUrl}
            alt={`${card.model} (${card.version}) en camino`}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover opacity-90"
          />
        ) : (
          <JerseyShowcaseFallback
            team={card.team}
            model={card.model}
            version={card.version}
          />
        )}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#0D1526] to-transparent"
          aria-hidden="true"
        />
      </div>

      <div className="flex flex-1 flex-col justify-between p-4 pt-2.5 space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-amber-300">
            <span className="inline-flex items-center gap-1 truncate">
              <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
              En camino · {card.shippingType}
            </span>
            <span className="font-mono-num text-slate-400 shrink-0">
              {card.totalIncomingUnits} uds
            </span>
          </div>

          <h3 className="line-clamp-2 min-h-[2.75rem] font-display text-base font-semibold leading-snug text-white">
            {card.model}
          </h3>

          <p className="text-xs text-slate-400">
            {card.version} · Tallas:{' '}
            <strong className="font-mono-num text-slate-200">
              {card.sizes.map((s) => `${s.size} (${s.incomingQty})`).join(', ')}
            </strong>
          </p>

          <div className="space-y-1">
            <p
              data-testid="transit-eta-days"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300"
            >
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {card.estimatedArrivalLabel}
            </p>
            {(card.estimatedArrivalDate || card.entryDate) && (
              <p className="inline-flex items-center gap-1.5 text-[11px] text-blue-300 block">
                <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                {card.estimatedArrivalDate
                  ? `Llegada estimada: ${card.estimatedArrivalDate}`
                  : `Despacho registrado: ${card.entryDate}`}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3 border-t border-slate-800/80 pt-3">
          {card.salePrice ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span
                data-testid="transit-price-usd"
                className="font-mono-num text-lg font-bold text-white"
              >
                {formatUSD(card.salePrice)}{' '}
                <span className="text-xs font-semibold text-slate-400">USDT</span>
              </span>
              {calculateCatalogBsPrice(card.salePrice, usdtRate) !== null ? (
                <span
                  data-testid="transit-price-bs"
                  className="font-mono-num text-xs font-semibold text-blue-300"
                >
                  {formatVES(calculateCatalogBsPrice(card.salePrice, usdtRate)!)}
                </span>
              ) : (
                <span
                  data-testid="transit-price-bs-updating"
                  className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300 border border-amber-500/25"
                  title="Tasa de cambio no disponible o en actualización"
                >
                  ⚠️ Precio en Bs en actualización
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Precio referencial al llegar</p>
          )}

          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="catalog-reserve-btn"
            data-advisor={advisor.name}
            data-wa-number={advisor.waNumber}
            onClick={onWhatsAppClick}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-amber-500/45 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-500/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 whitespace-nowrap"
          >
            <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Apartar por WhatsApp
          </a>
        </div>
      </div>
    </article>
  );
}

function TeamHorizontalRow({
  group,
  usdtRate,
  waTurnIndex,
  onWhatsAppClick,
}: {
  group: PublicCatalogTeamGroup;
  usdtRate: number;
  waTurnIndex: number;
  onWhatsAppClick: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const scrollRow = (dir: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  return (
    <section
      aria-labelledby={`team-row-${group.team}`}
      data-testid={`catalog-team-row-${group.team}`}
      className="space-y-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <TeamCrest team={group.team} className="h-8 w-8 shrink-0" />
          <div className="min-w-0">
            <h2
              id={`team-row-${group.team}`}
              className="truncate font-display text-lg font-bold tracking-tight text-white sm:text-xl"
            >
              {group.team}
            </h2>
            <p className="text-xs text-slate-400">
              {group.products.length}{' '}
              {group.products.length === 1 ? 'modelo' : 'modelos'} ·{' '}
              <span className="font-mono-num text-slate-300">
                {group.totalUnits} disponibles
              </span>
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => scrollRow(-1)}
            aria-label={`Desplazar ${group.team} a la izquierda`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-[#0D1526] text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => scrollRow(1)}
            aria-label={`Desplazar ${group.team} a la derecha`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-[#0D1526] text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 scroll-smooth"
      >
        {group.products.map((product) => (
          <CatalogProductCard
            key={product.key}
            product={product}
            usdtRate={usdtRate}
            waTurnIndex={waTurnIndex}
            onWhatsAppClick={onWhatsAppClick}
          />
        ))}
      </div>
    </section>
  );
}

export function PublicCatalogView({
  state,
  isPreviewMode = false,
  onExitPreview,
}: PublicCatalogViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [versionFilter, setVersionFilter] = useState<VersionFilter>('Todas');
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>('Todas');
  const [logoError, setLogoError] = useState(false);
  const [waTurnIndex, setWaTurnIndex] = useState<number>(() =>
    getCurrentWhatsAppTurnIndex(),
  );

  const transitScrollerRef = useRef<HTMLDivElement | null>(null);

  const handleAdvanceWhatsAppTurn = () => {
    const next = advanceWhatsAppTurnIndex();
    setWaTurnIndex(next);
  };

  const usdtRate = state.exchangeRates.usdt;
  const catalogEnabled = state.catalogEnabled !== false;

  const teamGroups = useMemo(() => buildPublicCatalogGroups(state), [state]);
  const transitCards = useMemo(() => buildUpcomingTransitCards(state), [state]);

  const filteredGroups = useMemo(
    () =>
      filterPublicCatalogGroups(
        teamGroups,
        searchQuery,
        versionFilter,
        sizeFilter,
      ),
    [searchQuery, sizeFilter, teamGroups, versionFilter],
  );

  const filteredTransitCards = useMemo(
    () =>
      filterUpcomingTransitCards(
        transitCards,
        searchQuery,
        versionFilter,
        sizeFilter,
      ),
    [searchQuery, sizeFilter, transitCards, versionFilter],
  );

  const totalAvailableUnits = useMemo(
    () => teamGroups.reduce((sum, g) => sum + g.totalUnits, 0),
    [teamGroups],
  );

  const totalIncomingUnits = useMemo(
    () => transitCards.reduce((sum, c) => sum + c.totalIncomingUnits, 0),
    [transitCards],
  );

  const fallbackContact = buildCatalogWhatsAppHref(waTurnIndex, {
    model: 'Catálogo X4SPORT',
    version: 'Player',
    size: 'M',
  });

  return (
    <div
      data-testid="public-catalog-storefront"
      className="min-h-screen bg-[#060B16] text-slate-100"
    >
      {/* Barra superior fija con Logo X4SPORT y Tasa BCV vigente (compacta <15% móvil) */}
      <header className="sticky top-0 z-40 border-b border-slate-800/90 bg-[#060B16]/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            {!logoError ? (
              <img
                src={X4SPORT_LOGO_SRC}
                alt="Logo X4SPORT"
                onError={() => setLogoError(true)}
                className="h-8 w-8 rounded-lg object-cover border border-slate-700 shrink-0"
              />
            ) : null}
            <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
              X4<span className="text-blue-400">SPORT</span>
            </span>
          </div>

          <div
            data-testid="catalog-rate-bar"
            className="flex items-center gap-2 text-xs text-slate-200 whitespace-nowrap"
          >
            <span className="hidden sm:inline text-slate-400">
              Tasa USDT hoy (Ref. Bs):
            </span>
            <span className="sm:hidden text-slate-400">Tasa USDT:</span>
            {isRateValid(usdtRate) ? (
              <strong className="font-mono-num text-sm font-bold text-blue-300">
                Bs. {usdtRate.toFixed(2)} / USDT
              </strong>
            ) : (
              <span className="text-[11px] text-amber-300 font-medium">
                ⚠️ En actualización
              </span>
            )}
          </div>

          {isPreviewMode && onExitPreview && (
            <button
              type="button"
              data-testid="btn-exit-catalog-preview"
              onClick={onExitPreview}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0D1526] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Volver al ERP
            </button>
          )}
        </div>
      </header>

      {!catalogEnabled ? (
        <main className="mx-auto flex max-w-2xl flex-col items-center justify-center px-4 py-20 text-center">
          <div className="w-full rounded-2xl border border-slate-800 bg-[#0D1526] p-8 space-y-4">
            <ShoppingBag
              className="mx-auto h-10 w-10 text-blue-400"
              aria-hidden="true"
            />
            <h1 className="font-display text-2xl font-bold text-white text-balance">
              Catálogo Temporalmente en Actualización
            </h1>
            <p className="text-sm text-slate-400">
              Estamos actualizando nuestro inventario en vivo en Guacara. Escríbenos directamente por WhatsApp para consultar tallas y modelos disponibles hoy.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <a
                href={fallbackContact.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleAdvanceWhatsAppTurn}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Consultar por WhatsApp
              </a>
              {isPreviewMode && onExitPreview && (
                <button
                  type="button"
                  onClick={onExitPreview}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-700 bg-[#080E1C] px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
                >
                  Volver al Panel Admin
                </button>
              )}
            </div>
          </div>
        </main>
      ) : (
        <main className="mx-auto max-w-7xl space-y-10 px-4 py-6 sm:px-6 sm:py-8">
          {/* Hero compacto + Buscador Inteligente */}
          <section className="space-y-5 rounded-2xl border border-slate-800 bg-gradient-to-br from-[#0D172B] via-[#0B1222] to-[#080D19] p-5 sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1.5">
                <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl text-balance">
                  Catálogo Oficial de Camisetas X4SPORT
                </h1>
                <p className="text-xs sm:text-sm text-slate-300">
                  Stock en tiempo real · Guacara, Carabobo · Pagos vía Binance USDT, Zelle, Efectivo ($) y Bolívares (Tasa USDT).
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-300 shrink-0">
                <span>
                  <strong className="font-mono-num text-white">
                    {totalAvailableUnits}
                  </strong>{' '}
                  disponibles hoy
                </span>
                {totalIncomingUnits > 0 && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                    <span>
                      <strong className="font-mono-num text-amber-300">
                        {totalIncomingUnits}
                      </strong>{' '}
                      en camino
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Barra de búsqueda inteligente */}
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <label htmlFor="catalog-search-input" className="sr-only">
                Buscar camisetas por modelo, jugador, talla o versión
              </label>
              <input
                id="catalog-search-input"
                data-testid="catalog-search-input"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar modelo, jugador (Lamine Yamal, Bellingham, Mbappé), talla (M, L, XL) o versión..."
                className="w-full min-h-[46px] rounded-xl border border-slate-700 bg-[#060B16] pl-10 pr-10 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Controles rápidos de filtro: Versión & Talla */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <span className="mr-1 text-xs font-medium text-slate-400 whitespace-nowrap">
                  Versión:
                </span>
                {VERSION_FILTERS.map((ver) => {
                  const active = versionFilter === ver;
                  return (
                    <button
                      key={ver}
                      type="button"
                      data-testid={`filter-version-${ver}`}
                      aria-pressed={active}
                      onClick={() => setVersionFilter(ver)}
                      className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                        active
                          ? 'bg-blue-600 text-white'
                          : 'border border-slate-800 bg-[#080E1C] text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      {ver}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <span className="mr-1 text-xs font-medium text-slate-400 whitespace-nowrap">
                  Talla:
                </span>
                {SIZE_FILTERS.map((sz) => {
                  const active = sizeFilter === sz;
                  return (
                    <button
                      key={sz}
                      type="button"
                      data-testid={`filter-size-${sz}`}
                      aria-pressed={active}
                      onClick={() => setSizeFilter(sz)}
                      className={`min-h-[36px] rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                        active
                          ? 'bg-blue-600 text-white'
                          : 'border border-slate-800 bg-[#080E1C] text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      {sz}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Filas horizontales por Equipo (Stock disponible en tiempo real) */}
          {filteredGroups.length === 0 ? (
            <section className="rounded-xl border border-slate-800 bg-[#0D1526] p-8 text-center space-y-3">
              <p className="text-base font-semibold text-white">
                {teamGroups.length === 0
                  ? 'No hay franelas en stock inmediato en este momento'
                  : 'Ninguna camiseta coincide con tu búsqueda'}
              </p>
              <p className="text-xs text-slate-400">
                {teamGroups.length === 0
                  ? 'Revisa la sección de Próximamente / En Camino o escríbenos por WhatsApp para encargos.'
                  : 'Prueba otro nombre de equipo, jugador, versión o talla.'}
              </p>
              {(searchQuery || versionFilter !== 'Todas' || sizeFilter !== 'Todas') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setVersionFilter('Todas');
                    setSizeFilter('Todas');
                  }}
                  className="inline-flex min-h-[40px] items-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  Mostrar todo el catálogo
                </button>
              )}
            </section>
          ) : (
            <div className="space-y-9">
              {filteredGroups.map((group) => (
                <TeamHorizontalRow
                  key={group.team}
                  group={group}
                  usdtRate={usdtRate}
                  waTurnIndex={waTurnIndex}
                  onWhatsAppClick={handleAdvanceWhatsAppTurn}
                />
              ))}
            </div>
          )}

          {/* Sección separada: Próximamente / En Camino (Lotes en Tránsito) */}
          <section
            aria-labelledby="upcoming-transit-heading"
            data-testid="catalog-upcoming-section"
            className="space-y-4 border-t border-slate-800/90 pt-8"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2
                  id="upcoming-transit-heading"
                  className="font-display text-xl font-bold tracking-tight text-white sm:text-2xl"
                >
                  Próximamente / En Camino
                </h2>
                <p className="mt-0.5 text-xs sm:text-sm text-slate-400">
                  Modelos de próximos envíos internacionales listos para apartar por WhatsApp antes de que lleguen a bodega.
                </p>
              </div>

              {filteredTransitCards.length > 0 && (
                <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      transitScrollerRef.current?.scrollBy({
                        left: -320,
                        behavior: 'smooth',
                      })
                    }
                    aria-label="Desplazar próximos lanzamientos a la izquierda"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-[#0D1526] text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      transitScrollerRef.current?.scrollBy({
                        left: 320,
                        behavior: 'smooth',
                      })
                    }
                    aria-label="Desplazar próximos lanzamientos a la derecha"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-[#0D1526] text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>

            {filteredTransitCards.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 bg-[#0D1526]/60 p-6 text-center text-xs text-slate-400">
                {transitCards.length === 0
                  ? 'No hay envíos en tránsito pendientes por llegar en este momento.'
                  : 'Ningún modelo en camino coincide con el filtro actual.'}
              </div>
            ) : (
              <div
                ref={transitScrollerRef}
                className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 scroll-smooth"
              >
                {filteredTransitCards.map((card) => (
                  <CatalogTransitCard
                    key={card.key}
                    card={card}
                    usdtRate={usdtRate}
                    waTurnIndex={waTurnIndex}
                    onWhatsAppClick={handleAdvanceWhatsAppTurn}
                  />
                ))}
              </div>
            )}
          </section>

          <footer className="border-t border-slate-800/80 pt-6 pb-8 text-center text-xs text-slate-500">
            X4SPORT · Indumentaria Deportiva · Guacara, Carabobo, Venezuela
          </footer>
        </main>
      )}
    </div>
  );
}
