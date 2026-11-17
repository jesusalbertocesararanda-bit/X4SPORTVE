import type {
  AppState,
  JerseySize,
  JerseyVersion,
  PurchaseBatchRecord,
  TeamCategory,
} from '../types/erp';
import {
  ALL_JERSEY_SIZES,
  normalizeVersionDisplay,
  round2,
} from './finance';

export interface CatalogWhatsAppAdvisor {
  id: 'jesus' | 'josue';
  name: string;
  phoneDisplay: string;
  waNumber: string;
}

export const CATALOG_WHATSAPP_ADVISORS: readonly CatalogWhatsAppAdvisor[] = [
  {
    id: 'jesus',
    name: 'Jesús César',
    phoneDisplay: '+58 412-4612132',
    waNumber: '584124612132',
  },
  {
    id: 'josue',
    name: 'Josué Ojeda',
    phoneDisplay: '+58 412-4588754',
    waNumber: '584124588754',
  },
] as const;

export const WHATSAPP_TURN_STORAGE_KEY = 'x4sport_wa_turn_v1';

export const CANONICAL_CATALOG_TEAM_ORDER = [
  'Barcelona',
  'Real Madrid',
  'Manchester City',
  'PSG',
  'Selecciones',
] as const;

const BUILTIN_PLAYER_ALIASES: Array<{ keywords: string[]; teamHint: string; modelHints?: string[] }> = [
  {
    keywords: ['lamine', 'yamal', 'pedri', 'gavi', 'lewandowski', 'raphinha', 'cubarsi', 'olmo', 'messi barcelona', 'barca', 'fcb', 'culer'],
    teamHint: 'Barcelona',
  },
  {
    keywords: ['bellingham', 'mbappe', 'vinicius', 'vini', 'rodrygo', 'valverde', 'camavinga', 'modric', 'arda guler', 'madrid', 'rma', 'merengue'],
    teamHint: 'Real Madrid',
  },
  {
    keywords: ['haaland', 'foden', 'de bruyne', 'rodri', 'grealish', 'bernardo', 'guardiola', 'city', 'mci', 'citizens'],
    teamHint: 'Manchester City',
  },
  {
    keywords: ['dembele', 'barcola', 'hakimi', 'vitinha', 'neymar', 'paris', 'psg'],
    teamHint: 'PSG',
  },
  {
    keywords: ['messi', 'di maria', 'julian alvarez', 'lautaro', 'escaloni', 'albiceleste', 'argentina'],
    teamHint: 'Selecciones',
    modelHints: ['argentina'],
  },
  {
    keywords: ['soteldo', 'rondon', 'aramburu', 'herrera', 'savarino', 'machis', 'vinotinto', 'venezuela'],
    teamHint: 'Selecciones',
    modelHints: ['venezuela', 'vinotinto'],
  },
  {
    keywords: ['lamine yamal espana', 'nico williams', 'rodri espana', 'espana', 'roja'],
    teamHint: 'Selecciones',
    modelHints: ['espana', 'españa'],
  },
  {
    keywords: ['vinicius brasil', 'neymar brasil', 'raphinha brasil', 'endrick', 'brasil', 'canarinha'],
    teamHint: 'Selecciones',
    modelHints: ['brasil'],
  },
];

export interface PublicCatalogSizeOption {
  size: JerseySize;
  stock: number;
  salePrice: number;
}

export interface PublicCatalogProduct {
  key: string;
  team: TeamCategory;
  model: string;
  version: 'Fans' | 'Player' | 'Retro';
  totalStock: number;
  sizes: PublicCatalogSizeOption[];
  minPrice: number;
  maxPrice: number;
  photoUrl?: string;
  keywords?: string;
  searchIndexText: string;
}

export interface PublicCatalogTeamGroup {
  team: TeamCategory;
  totalUnits: number;
  products: PublicCatalogProduct[];
}

export interface PublicTransitSizeOption {
  size: JerseySize;
  incomingQty: number;
  salePrice?: number;
}

export interface PublicTransitCard {
  key: string;
  team: TeamCategory;
  model: string;
  version: 'Fans' | 'Player' | 'Retro';
  totalIncomingUnits: number;
  sizes: PublicTransitSizeOption[];
  entryDate?: string;
  estimatedArrivalDate?: string;
  estimatedDaysRemaining?: number;
  estimatedArrivalLabel: string;
  shippingType: PurchaseBatchRecord['shippingType'];
  referenceName: string;
  salePrice?: number;
  photoUrl?: string;
  keywords?: string;
  searchIndexText: string;
}

export function calculateCatalogBsPrice(
  priceUsd: number,
  usdtRate: number,
): number {
  const safeUsd = Number.isFinite(priceUsd) ? Math.max(0, priceUsd) : 0;
  const safeRate = Number.isFinite(usdtRate) ? Math.max(0, usdtRate) : 0;
  return round2(safeUsd * safeRate);
}

function parseIsoDateUtcMs(iso?: string): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return null;
  const [y, m, d] = iso.trim().split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  return Number.isFinite(ms) ? ms : null;
}

export function computeTransitDaysRemaining(
  params: {
    entryDate?: string;
    estimatedArrivalDate?: string;
    shippingType: PurchaseBatchRecord['shippingType'];
  },
  referenceDateIso?: string,
): { daysRemaining?: number; label: string } {
  const refIso = referenceDateIso ?? new Date().toISOString().slice(0, 10);
  const refMs = parseIsoDateUtcMs(refIso);
  if (refMs === null) {
    return { label: 'Próximo arribo' };
  }

  let targetMs = parseIsoDateUtcMs(params.estimatedArrivalDate);
  if (targetMs === null) {
    const entryMs = parseIsoDateUtcMs(params.entryDate);
    if (entryMs !== null) {
      const slaDays = params.shippingType === 'Marítimo' ? 80 : 15;
      targetMs = entryMs + slaDays * 86_400_000;
    }
  }

  if (targetMs === null) {
    return { label: 'Próximo arribo' };
  }

  const daysRemaining = Math.round((targetMs - refMs) / 86_400_000);
  if (daysRemaining > 1) {
    return {
      daysRemaining,
      label: `Llega en ~${daysRemaining} días`,
    };
  }
  if (daysRemaining === 1) {
    return {
      daysRemaining: 1,
      label: 'Llega mañana (~1 día)',
    };
  }
  if (daysRemaining === 0) {
    return {
      daysRemaining: 0,
      label: 'Llegada estimada hoy',
    };
  }
  return {
    daysRemaining,
    label: 'Por arribar esta semana',
  };
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCatalogModelKey(
  model: string,
  version?: JerseyVersion | string,
): string {
  const cleanModel = model.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!version) return cleanModel;
  const ver = normalizeVersionDisplay(version as JerseyVersion);
  return `${cleanModel}::${ver}`;
}

export function resolveCatalogPhoto(
  model: string,
  version: JerseyVersion | string,
  photosMap?: Record<string, string>,
): string | undefined {
  if (!photosMap) return undefined;
  const exactKey = normalizeCatalogModelKey(model, version);
  const exact = photosMap[exactKey];
  if (exact && exact.trim()) return exact.trim();

  const modelOnlyKey = normalizeCatalogModelKey(model);
  const byModel = photosMap[modelOnlyKey];
  if (byModel && byModel.trim()) return byModel.trim();

  // Case-insensitive fallback in case legacy keys exist
  const targetExactLower = exactKey.toLowerCase();
  const targetModelLower = modelOnlyKey.toLowerCase();
  for (const [k, v] of Object.entries(photosMap)) {
    const kl = k.trim().toLowerCase();
    if ((kl === targetExactLower || kl === targetModelLower) && v.trim()) {
      return v.trim();
    }
  }
  return undefined;
}

export function resolveCatalogKeywords(
  model: string,
  version: JerseyVersion | string,
  keywordsMap?: Record<string, string>,
): string | undefined {
  if (!keywordsMap) return undefined;
  const exactKey = normalizeCatalogModelKey(model, version);
  const modelOnlyKey = normalizeCatalogModelKey(model);
  const hit = keywordsMap[exactKey] ?? keywordsMap[modelOnlyKey];
  return hit && hit.trim() ? hit.trim() : undefined;
}

/**
 * Normaliza enlaces de imagen (Google Drive share URLs -> thumbnail público directo)
 * manteniendo intactas URLs directas HTTPS y Data URLs base64.
 */
export function normalizeCatalogImageUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:image/')) return trimmed;

  // Google Drive: /file/d/<ID>/view...
  const fileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (fileMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w1000`;
  }

  // Google Drive: ?id=<ID> or &id=<ID>
  if (/drive\.google\.com/i.test(trimmed)) {
    const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
    if (idMatch?.[1]) {
      return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w1000`;
    }
  }

  return trimmed;
}

function buildSearchIndexForProduct(params: {
  team: string;
  model: string;
  version: 'Fans' | 'Player' | 'Retro';
  sizes: string[];
  customKeywords?: string;
}): string {
  const baseNormalized = normalizeSearchText(
    [
      params.team,
      params.model,
      params.version,
      params.version === 'Fans' ? 'fan fans aficionado' : '',
      params.sizes.join(' '),
      params.customKeywords ?? '',
    ].join(' '),
  );

  const aliasTokens: string[] = [];
  const teamNorm = normalizeSearchText(params.team);
  const modelNorm = normalizeSearchText(params.model);

  for (const rule of BUILTIN_PLAYER_ALIASES) {
    const teamMatches = normalizeSearchText(rule.teamHint) === teamNorm;
    const modelMatches =
      !rule.modelHints ||
      rule.modelHints.some((hint) => modelNorm.includes(normalizeSearchText(hint)));
    if (teamMatches && modelMatches) {
      aliasTokens.push(...rule.keywords);
    }
  }

  return `${baseNormalized} ${aliasTokens.join(' ')}`.trim();
}

export function buildPublicCatalogGroups(
  state: AppState,
): PublicCatalogTeamGroup[] {
  const grouped = new Map<
    string,
    {
      team: TeamCategory;
      model: string;
      version: 'Fans' | 'Player' | 'Retro';
      sizeMap: Map<JerseySize, { stock: number; salePrice: number }>;
    }
  >();

  for (const item of state.inventory ?? []) {
    if (!item || item.stock <= 0) continue;
    const version = normalizeVersionDisplay(item.version);
    const key = normalizeCatalogModelKey(item.model, version);

    let entry = grouped.get(key);
    if (!entry) {
      entry = {
        team: item.team || 'Otro',
        model: item.model.trim(),
        version,
        sizeMap: new Map(),
      };
      grouped.set(key, entry);
    }

    const existingSize = entry.sizeMap.get(item.size);
    if (existingSize) {
      existingSize.stock += item.stock;
      existingSize.salePrice = item.salePrice;
    } else {
      entry.sizeMap.set(item.size, {
        stock: item.stock,
        salePrice: item.salePrice,
      });
    }
  }

  const byTeam = new Map<TeamCategory, PublicCatalogProduct[]>();

  for (const [key, entry] of grouped.entries()) {
    const sizes: PublicCatalogSizeOption[] = ALL_JERSEY_SIZES.filter((sz) => {
      const info = entry.sizeMap.get(sz);
      return Boolean(info && info.stock > 0);
    }).map((sz) => {
      const info = entry.sizeMap.get(sz)!;
      return {
        size: sz,
        stock: info.stock,
        salePrice: round2(info.salePrice),
      };
    });

    if (sizes.length === 0) continue;
    const totalStock = sizes.reduce((sum, s) => sum + s.stock, 0);
    if (totalStock <= 0) continue;

    const prices = sizes.map((s) => s.salePrice);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const photoUrl = resolveCatalogPhoto(
      entry.model,
      entry.version,
      state.catalogPhotos,
    );
    const keywords = resolveCatalogKeywords(
      entry.model,
      entry.version,
      state.catalogKeywords,
    );

    const product: PublicCatalogProduct = {
      key,
      team: entry.team,
      model: entry.model,
      version: entry.version,
      totalStock,
      sizes,
      minPrice,
      maxPrice,
      photoUrl,
      keywords,
      searchIndexText: buildSearchIndexForProduct({
        team: entry.team,
        model: entry.model,
        version: entry.version,
        sizes: sizes.map((s) => s.size),
        customKeywords: keywords,
      }),
    };

    const list = byTeam.get(entry.team) ?? [];
    list.push(product);
    byTeam.set(entry.team, list);
  }

  const orderedTeams: TeamCategory[] = [
    ...CANONICAL_CATALOG_TEAM_ORDER.filter((t) => byTeam.has(t)),
    ...Array.from(byTeam.keys())
      .filter(
        (t) =>
          !CANONICAL_CATALOG_TEAM_ORDER.includes(
            t as (typeof CANONICAL_CATALOG_TEAM_ORDER)[number],
          ),
      )
      .sort((a, b) => a.localeCompare(b)),
  ];

  return orderedTeams.map((team) => {
    const products = (byTeam.get(team) ?? []).sort(
      (a, b) =>
        a.model.localeCompare(b.model) || a.version.localeCompare(b.version),
    );
    return {
      team,
      totalUnits: products.reduce((sum, p) => sum + p.totalStock, 0),
      products,
    };
  });
}

export function buildUpcomingTransitCards(
  state: AppState,
  referenceDateIso?: string,
): PublicTransitCard[] {
  const map = new Map<string, PublicTransitCard>();

  for (const batch of state.purchaseBatches ?? []) {
    if (batch.status !== 'EN TRÁNSITO') continue;
    const etaMeta = computeTransitDaysRemaining(
      {
        entryDate: batch.entryDate,
        estimatedArrivalDate: batch.estimatedArrivalDate,
        shippingType: batch.shippingType,
      },
      referenceDateIso,
    );
    for (const item of batch.items ?? []) {
      const qty = item.orderedQuantity ?? item.quantity ?? 0;
      if (qty <= 0) continue;
      const version = normalizeVersionDisplay(item.version);
      const modelKey = normalizeCatalogModelKey(item.model, version);
      const groupKey = `${batch.id}::${modelKey}`;

      let card = map.get(groupKey);
      if (!card) {
        const photoUrl = resolveCatalogPhoto(
          item.model,
          version,
          state.catalogPhotos,
        );
        const keywords = resolveCatalogKeywords(
          item.model,
          version,
          state.catalogKeywords,
        );
        card = {
          key: groupKey,
          team: item.team || 'Otro',
          model: item.model.trim(),
          version,
          totalIncomingUnits: 0,
          sizes: [],
          entryDate: batch.entryDate,
          estimatedArrivalDate: batch.estimatedArrivalDate,
          estimatedDaysRemaining: etaMeta.daysRemaining,
          estimatedArrivalLabel: etaMeta.label,
          shippingType: batch.shippingType,
          referenceName: batch.referenceName,
          salePrice: item.salePrice,
          photoUrl,
          keywords,
          searchIndexText: '',
        };
        map.set(groupKey, card);
      }

      card.totalIncomingUnits += qty;
      if (item.salePrice && !card.salePrice) {
        card.salePrice = item.salePrice;
      }
      const existingSize = card.sizes.find((s) => s.size === item.size);
      if (existingSize) {
        existingSize.incomingQty += qty;
      } else {
        card.sizes.push({
          size: item.size,
          incomingQty: qty,
          salePrice: item.salePrice,
        });
      }
    }
  }

  const cards = Array.from(map.values()).map((card) => {
    const sortedSizes = ALL_JERSEY_SIZES.map((sz) =>
      card.sizes.find((s) => s.size === sz),
    ).filter((s): s is PublicTransitSizeOption => Boolean(s));
    return {
      ...card,
      sizes: sortedSizes,
      searchIndexText: buildSearchIndexForProduct({
        team: card.team,
        model: card.model,
        version: card.version,
        sizes: sortedSizes.map((s) => s.size),
        customKeywords: `${card.keywords ?? ''} ${card.referenceName} en camino proximamente`,
      }),
    };
  });

  return cards.sort((a, b) => {
    const da = a.estimatedArrivalDate ?? '9999-12-31';
    const db = b.estimatedArrivalDate ?? '9999-12-31';
    return da.localeCompare(db) || a.model.localeCompare(b.model);
  });
}

function matchesTokens(
  searchIndexText: string,
  availableSizes: JerseySize[],
  productVersion: 'Fans' | 'Player' | 'Retro',
  query: string,
  versionFilter: 'Todas' | 'Player' | 'Fans' | 'Retro',
  sizeFilter: 'Todas' | JerseySize,
): boolean {
  if (versionFilter !== 'Todas' && productVersion !== versionFilter) {
    return false;
  }
  if (sizeFilter !== 'Todas' && !availableSizes.includes(sizeFilter)) {
    return false;
  }

  const qNorm = normalizeSearchText(query);
  if (!qNorm) return true;

  const tokens = qNorm.split(' ').filter(Boolean);
  return tokens.every((token) => {
    // Exact size token check (avoid 's' matching every word containing 's')
    if (['s', 'm', 'l', 'xl', 'xxl'].includes(token)) {
      return availableSizes.some((sz) => sz.toLowerCase() === token);
    }
    if (token === 'fan') {
      return productVersion === 'Fans' || searchIndexText.includes('fan');
    }
    return searchIndexText.includes(token);
  });
}

export function filterPublicCatalogGroups(
  groups: PublicCatalogTeamGroup[],
  query: string,
  versionFilter: 'Todas' | 'Player' | 'Fans' | 'Retro' = 'Todas',
  sizeFilter: 'Todas' | JerseySize = 'Todas',
): PublicCatalogTeamGroup[] {
  const out: PublicCatalogTeamGroup[] = [];
  for (const group of groups) {
    const filteredProducts = group.products.filter((prod) =>
      matchesTokens(
        prod.searchIndexText,
        prod.sizes.map((s) => s.size),
        prod.version,
        query,
        versionFilter,
        sizeFilter,
      ),
    );
    if (filteredProducts.length > 0) {
      out.push({
        team: group.team,
        totalUnits: filteredProducts.reduce((sum, p) => sum + p.totalStock, 0),
        products: filteredProducts,
      });
    }
  }
  return out;
}

export function filterUpcomingTransitCards(
  cards: PublicTransitCard[],
  query: string,
  versionFilter: 'Todas' | 'Player' | 'Fans' | 'Retro' = 'Todas',
  sizeFilter: 'Todas' | JerseySize = 'Todas',
): PublicTransitCard[] {
  return cards.filter((card) =>
    matchesTokens(
      card.searchIndexText,
      card.sizes.map((s) => s.size),
      card.version,
      query,
      versionFilter,
      sizeFilter,
    ),
  );
}

let inMemoryTurnIndex = 0;

export function getAdvisorForTurnIndex(index: number): CatalogWhatsAppAdvisor {
  const safe =
    ((Math.floor(index) % CATALOG_WHATSAPP_ADVISORS.length) +
      CATALOG_WHATSAPP_ADVISORS.length) %
    CATALOG_WHATSAPP_ADVISORS.length;
  return CATALOG_WHATSAPP_ADVISORS[safe];
}

export function getCurrentWhatsAppTurnIndex(storage?: Storage | null): number {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
          ? window.localStorage
          : null;
    if (!store) return inMemoryTurnIndex;
    const raw = store.getItem(WHATSAPP_TURN_STORAGE_KEY);
    if (raw === null) return inMemoryTurnIndex;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed) % CATALOG_WHATSAPP_ADVISORS.length;
    }
  } catch {
    // Fallback to in-memory rotation
  }
  return inMemoryTurnIndex;
}

export function advanceWhatsAppTurnIndex(storage?: Storage | null): number {
  const current = getCurrentWhatsAppTurnIndex(storage);
  const next = (current + 1) % CATALOG_WHATSAPP_ADVISORS.length;
  inMemoryTurnIndex = next;
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
          ? window.localStorage
          : null;
    store?.setItem(WHATSAPP_TURN_STORAGE_KEY, String(next));
  } catch {
    // Ignore storage restriction
  }
  return next;
}

export function buildCatalogWhatsAppMessage(params: {
  model: string;
  version: JerseyVersion | string;
  size?: JerseySize | string;
  isTransit?: boolean;
}): string {
  const versionLabel = normalizeVersionDisplay(params.version as JerseyVersion);
  const sizePart = params.size ? `Talla ${params.size}` : 'Talla por confirmar';
  const descriptor = `${params.model}, Versión ${versionLabel}, ${sizePart}`;
  if (params.isTransit) {
    return `¡Hola! 👋 Me interesa apartar la franela ${descriptor} que viene en camino en el catálogo de X4SPORT. ¿Cuándo llega?`;
  }
  return `¡Hola! 👋 Me interesa la franela ${descriptor} que vi en el catálogo de X4SPORT. ¿Está disponible?`;
}

export function buildCatalogWhatsAppHref(
  turnIndex: number,
  params: {
    model: string;
    version: JerseyVersion | string;
    size?: JerseySize | string;
    isTransit?: boolean;
  },
): { advisor: CatalogWhatsAppAdvisor; href: string; message: string } {
  const advisor = getAdvisorForTurnIndex(turnIndex);
  const message = buildCatalogWhatsAppMessage(params);
  const href = `https://wa.me/${advisor.waNumber}?text=${encodeURIComponent(message)}`;
  return { advisor, href, message };
}

export function isPublicCatalogModeFromLocation(locationLike?: {
  search?: string;
  hash?: string;
  pathname?: string;
}): boolean {
  const loc =
    locationLike ??
    (typeof window !== 'undefined' ? window.location : undefined);
  if (!loc) return false;

  const search = loc.search ?? '';
  if (search) {
    const params = new URLSearchParams(search);
    const val = params.get('catalogo');
    if (val === '1' || val === 'true') return true;
  }

  const hash = (loc.hash ?? '').toLowerCase();
  if (hash === '#catalogo' || hash === '#/catalogo') return true;

  const pathname = (loc.pathname ?? '').toLowerCase();
  if (pathname === '/catalogo' || pathname.endsWith('/catalogo')) return true;

  return false;
}

export function buildShareableCatalogUrl(locationLike?: {
  protocol?: string;
  origin?: string;
  pathname?: string;
}): string {
  const loc =
    locationLike ??
    (typeof window !== 'undefined' ? window.location : undefined);
  if (!loc) return '?catalogo=1';
  if (loc.protocol === 'file:') {
    return `${loc.pathname ?? ''}#catalogo`;
  }
  const baseOrigin = loc.origin && loc.origin !== 'null' ? loc.origin : '';
  const basePath = loc.pathname && loc.pathname !== '/' ? loc.pathname : '/';
  return `${baseOrigin}${basePath}?catalogo=1`;
}

export async function compressCatalogImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecciona un archivo de imagen válido (JPG, PNG o WebP).');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      const img = new Image();
      img.onerror = () =>
        reject(new Error('La imagen seleccionada no es compatible.'));
      img.onload = () => {
        const maxSide = 720;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
