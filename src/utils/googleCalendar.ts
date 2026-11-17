import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type Unsubscribe,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import type { PurchaseBatchRecord, SaleRecord } from '../types/erp';

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.acls',
  'https://www.googleapis.com/auth/calendar.acls.readonly',
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.calendarlist',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.calendars',
  'https://www.googleapis.com/auth/calendar.calendars.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.events.freebusy',
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.events.owned.readonly',
  'https://www.googleapis.com/auth/calendar.events.public.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.settings.readonly',
] as const;

export const X4SPORT_TIMEZONE = 'America/Caracas';
const WORKSPACE_FIREBASE_APP_NAME = 'x4sport-workspace-oauth';

export interface GoogleCalendarAuthState {
  isConnected: boolean;
  needsAuth: boolean;
  isConnecting: boolean;
  userEmail?: string;
  userName?: string;
  error?: string;
}

export interface GoogleCalendarEventInput {
  summary: string;
  location?: string;
  description: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  reminders: {
    useDefault: boolean;
    overrides: Array<{
      method: 'popup' | 'email';
      minutes: number;
    }>;
  };
  colorId?: string;
}

export interface CreateCalendarEventResult {
  ok: boolean;
  eventId?: string;
  htmlLink?: string;
  needsAuth?: boolean;
  error?: string;
}

// Strict in-memory token caching (never stored in localStorage or sessionStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;
let workspaceAppInstance: FirebaseApp | null = null;
let workspaceAuthInstance: Auth | null = null;
let googleProviderInstance: GoogleAuthProvider | null = null;

function getWorkspaceAuth(): { auth: Auth; provider: GoogleAuthProvider } {
  if (!workspaceAppInstance) {
    const existing = getApps().find(
      (app) => app.name === WORKSPACE_FIREBASE_APP_NAME,
    );
    workspaceAppInstance =
      existing ?? initializeApp(firebaseConfig, WORKSPACE_FIREBASE_APP_NAME);
  }
  if (!workspaceAuthInstance) {
    workspaceAuthInstance = getAuth(workspaceAppInstance);
  }
  if (!googleProviderInstance) {
    const provider = new GoogleAuthProvider();
    for (const scope of GOOGLE_CALENDAR_SCOPES) {
      provider.addScope(scope);
    }
    provider.setCustomParameters({
      prompt: 'select_account',
    });
    googleProviderInstance = provider;
  }
  return { auth: workspaceAuthInstance, provider: googleProviderInstance };
}

export function initGoogleCalendarAuth(
  onAuthSuccess?: (user: User, accessToken: string) => void,
  onAuthFailure?: () => void,
): Unsubscribe {
  if (typeof window === 'undefined') {
    return () => {};
  }

  try {
    const { auth } = getWorkspaceAuth();
    return onAuthStateChanged(auth, (user: User | null) => {
      if (user) {
        if (cachedAccessToken) {
          onAuthSuccess?.(user, cachedAccessToken);
        } else if (!isSigningIn) {
          cachedAccessToken = null;
          onAuthFailure?.();
        }
      } else {
        cachedAccessToken = null;
        onAuthFailure?.();
      }
    });
  } catch {
    onAuthFailure?.();
    return () => {};
  }
}

export async function signInWithGoogleCalendar(): Promise<{
  user: User;
  accessToken: string;
}> {
  const { auth, provider } = getWorkspaceAuth();
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'No se recibió el token de acceso de Google Calendar. Intenta nuevamente y acepta los permisos.',
      );
    }
    cachedAccessToken = credential.accessToken;
    return {
      user: result.user,
      accessToken: cachedAccessToken,
    };
  } finally {
    isSigningIn = false;
  }
}

export async function signOutGoogleCalendar(): Promise<void> {
  cachedAccessToken = null;
  if (typeof window === 'undefined') return;
  try {
    const { auth } = getWorkspaceAuth();
    await signOut(auth);
  } catch {
    // Ignore sign-out errors if auth was not initialized
  }
}

export async function getCalendarAccessToken(): Promise<string | null> {
  return cachedAccessToken;
}

export function clearCachedCalendarAccessToken(): void {
  cachedAccessToken = null;
}

export function isValidIsoDate(value?: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const [y, m, d] = trimmed.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  if (!isValidIsoDate(isoDate)) {
    const today = new Date().toISOString().slice(0, 10);
    return today;
  }
  const [y, m, d] = isoDate.trim().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function shouldSchedulePurchaseCalendarEvent(
  batch: Pick<PurchaseBatchRecord, 'estimatedArrivalDate'>,
): boolean {
  return isValidIsoDate(batch.estimatedArrivalDate);
}

export function shouldScheduleSaleCalendarEvent(
  sale: Pick<SaleRecord, 'paymentStatus' | 'deliveryDate'>,
): boolean {
  return sale.paymentStatus === 'Pendiente' || isValidIsoDate(sale.deliveryDate);
}

export function buildPurchaseArrivalCalendarEvent(
  batch: PurchaseBatchRecord,
): GoogleCalendarEventInput {
  const arrivalDate = isValidIsoDate(batch.estimatedArrivalDate)
    ? batch.estimatedArrivalDate!.trim()
    : addDaysToIsoDate(batch.entryDate, batch.shippingType === 'Aéreo' ? 12 : 45);

  const itemsText = (batch.items ?? [])
    .map(
      (item) =>
        `• ${item.orderedQuantity}x ${item.model} (${item.version} · Talla ${item.size}) — Fábrica $${item.factoryUnitCost.toFixed(2)}`,
    )
    .join('\n');

  const descriptionLines = [
    `X4SPORT · Seguimiento de Lote en Tránsito`,
    `Referencia: ${batch.referenceName}`,
    `Tipo de envío: ${batch.shippingType}`,
    `Fecha de orden: ${batch.entryDate}`,
    `Fecha estimada de llegada: ${arrivalDate}`,
    `Unidades totales: ${batch.orderedTotalUnits} unidades`,
    `Costo total (Fábrica + Flete): $${batch.totalLandedCost.toFixed(2)} USDT (Fábrica: $${batch.totalFactoryCost.toFixed(2)} + Flete est.: $${batch.estimatedFreightCost.toFixed(2)})`,
    '',
    'Detalle de las unidades:',
    itemsText || '• Sin líneas detalladas',
  ];

  return {
    summary: `📦 Llegada de Lote: ${batch.referenceName}`,
    location: 'Bodega X4SPORT · Guacara, Carabobo',
    description: descriptionLines.join('\n'),
    start: {
      dateTime: `${arrivalDate}T09:00:00-04:00`,
      timeZone: X4SPORT_TIMEZONE,
    },
    end: {
      dateTime: `${arrivalDate}T10:00:00-04:00`,
      timeZone: X4SPORT_TIMEZONE,
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'email', minutes: 1440 },
      ],
    },
    colorId: '5',
  };
}

export function buildSaleCalendarEvent(
  sale: SaleRecord,
  fallbackDate?: string,
): GoogleCalendarEventInput {
  const createdIso = sale.createdAt.slice(0, 10);
  const targetDate = isValidIsoDate(sale.deliveryDate)
    ? sale.deliveryDate!.trim()
    : isValidIsoDate(fallbackDate)
      ? fallbackDate!.trim()
      : addDaysToIsoDate(createdIso, 1);

  const items =
    sale.items && sale.items.length > 0
      ? sale.items
      : [
          {
            skuId: sale.skuId,
            modelLabel: sale.modelLabel,
            team: sale.team,
            version: sale.version,
            size: sale.size,
            quantity: sale.quantity,
            unitCogs: sale.unitCogs,
            totalLineCogs: sale.unitCogs * sale.quantity,
            unitPrice: sale.finalPrice / Math.max(1, sale.quantity),
            subtotal: sale.finalPrice,
          },
        ];

  const customerDisplay =
    sale.customerName || sale.debtorName || 'Cliente Mostrador';
  const invoiceDisplay = sale.invoiceNumber || sale.id;

  const isPending = sale.paymentStatus === 'Pendiente';
  const pendingAmount = isPending ? sale.finalPrice : 0;
  const paymentMethodLabel = sale.paymentMethod ?? 'Efectivo ($)';
  const summary = `⚽ Cobro / Entrega: ${customerDisplay}`;

  const modelsDetail = items
    .map(
      (item) =>
        `• ${item.quantity}x ${item.modelLabel} (${item.version} · Talla ${item.size}) — $${item.subtotal.toFixed(2)} USDT`,
    )
    .join('\n');

  const contactParts = [
    sale.customerPhone ? `Teléfono: ${sale.customerPhone}` : null,
    sale.customerCity ? `Ciudad: ${sale.customerCity}` : null,
    sale.customerSocial ? `Red social: ${sale.customerSocial}` : null,
    sale.customerIdDoc ? `Cédula/RIF: ${sale.customerIdDoc}` : null,
  ].filter(Boolean);

  const descriptionLines = [
    `X4SPORT · Recordatorio de Cobro / Entrega`,
    `Factura: ${invoiceDisplay}`,
    `Estatus: ${isPending ? 'Pendiente / Crédito' : 'Cobrado'}`,
    `Monto pendiente: $${pendingAmount.toFixed(2)} USDT`,
    `Monto total: $${sale.finalPrice.toFixed(2)} USDT (${paymentMethodLabel})`,
    `Vendedor: ${sale.seller}`,
    '',
    `Datos del cliente:`,
    `Nombre: ${customerDisplay}`,
    ...(contactParts.length > 0
      ? contactParts
      : ['Contacto: Sin datos adicionales']),
    '',
    `Modelos de las camisetas:`,
    modelsDetail,
  ];

  return {
    summary,
    location: sale.customerCity
      ? `${sale.customerCity} · X4SPORT`
      : 'Guacara, Carabobo · X4SPORT',
    description: descriptionLines.join('\n'),
    start: {
      dateTime: `${targetDate}T09:00:00-04:00`,
      timeZone: X4SPORT_TIMEZONE,
    },
    end: {
      dateTime: `${targetDate}T09:45:00-04:00`,
      timeZone: X4SPORT_TIMEZONE,
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'email', minutes: 1440 },
      ],
    },
    colorId: isPending ? '11' : '9',
  };
}

export async function createGoogleCalendarEvent(
  eventPayload: GoogleCalendarEventInput,
  explicitToken?: string | null,
): Promise<CreateCalendarEventResult> {
  const token = explicitToken ?? (await getCalendarAccessToken());
  if (!token) {
    return {
      ok: false,
      needsAuth: true,
      error:
        'Conecta tu cuenta de Google Calendar para agendar eventos automáticamente.',
    };
  }

  try {
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventPayload),
      },
    );

    if (response.status === 401 || response.status === 403) {
      clearCachedCalendarAccessToken();
      return {
        ok: false,
        needsAuth: true,
        error:
          'Tu sesión de Google Calendar expiró o no tiene permisos suficientes. Vuelve a iniciar sesión con Google.',
      };
    }

    const data = (await response.json().catch(() => ({}))) as {
      id?: string;
      htmlLink?: string;
      error?: { message?: string };
    };

    if (!response.ok) {
      return {
        ok: false,
        error:
          data?.error?.message ??
          `Error de Google Calendar (${response.status}).`,
      };
    }

    return {
      ok: true,
      eventId: data.id,
      htmlLink: data.htmlLink,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'No se pudo conectar con Google Calendar.',
    };
  }
}
