import {
  createEmptyCleanState,
  createInitialState,
} from '../data/initialState';
import type { AppState, ExchangeRates } from '../types/erp';
import { normalizeAppState, sanitizeForFirebase } from './finance';

// Configuración de Firebase
export const firebaseConfig = {
  apiKey: 'AIzaSyAADvIq-w-2z9UGl3QEBMgQDOxCOI4VI9Q',
  authDomain: 'x4sport-sistem-maestro.firebaseapp.com',
  databaseURL: 'https://x4sport-sistem-maestro-default-rtdb.firebaseio.com',
  projectId: 'x4sport-sistem-maestro',
  storageBucket: 'x4sport-sistem-maestro.firebasestorage.app',
  messagingSenderId: '821669414352',
  appId: '1:821669414352:web:9f6205b3c60a23316565d5',
  measurementId: 'G-QZF6FCRGX8',
} as const;

export const RTDB_ERP_PATH = 'x4sport/erpState';

interface FirebaseDataSnapshot {
  exists: () => boolean;
  val: () => unknown;
}

interface FirebaseDatabaseRef {
  on: (
    eventType: 'value',
    callback: (snapshot: FirebaseDataSnapshot) => void,
    cancelCallback?: (error: Error) => void,
  ) => (snapshot: FirebaseDataSnapshot) => void;
  off: (
    eventType: 'value',
    callback?: (snapshot: FirebaseDataSnapshot) => void,
  ) => void;
  set: (value: unknown) => Promise<void>;
  update: (values: Record<string, unknown>) => Promise<void>;
  child: (path: string) => FirebaseDatabaseRef;
  transaction: (
    transactionUpdate: (currentData: unknown) => unknown,
  ) => Promise<{ committed: boolean; snapshot: FirebaseDataSnapshot }>;
}

interface FirebaseCompatGlobal {
  apps: unknown[];
  initializeApp: (config: Record<string, string>) => unknown;
  app: () => unknown;
  database: () => {
    ref: (path: string) => FirebaseDatabaseRef;
  };
}

declare global {
  interface Window {
    firebase?: FirebaseCompatGlobal;
  }
}

/**
 * Elimina cualquier dato fantasma o respaldo obsoleto en localStorage.
 */
export function purgeLegacyLocalStorage(): number {
  if (typeof window === 'undefined' || !window.localStorage) return 0;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      const lower = k.toLowerCase();
      if (
        lower.includes('x4sport') ||
        lower.includes('erp') ||
        lower.includes('inventory') ||
        lower.includes('ventas') ||
        lower.includes('finanzas')
      ) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      window.localStorage.removeItem(k);
    }
    return keysToRemove.length;
  } catch {
    return 0;
  }
}

function getFirebaseDatabase(): { ref: (path: string) => FirebaseDatabaseRef } {
  if (typeof window === 'undefined' || !window.firebase) {
    throw new Error(
      'El SDK de Firebase CDN no está disponible en este navegador.',
    );
  }

  const fb = window.firebase;
  if (!fb.apps || fb.apps.length === 0) {
    fb.initializeApp({ ...firebaseConfig });
  }
  return fb.database();
}

/**
 * Hook onValue en tiempo real contra Firebase Realtime Database (x4sport/erpState)
 * con hidratación REST rápida inicial.
 */
export function subscribeErpState(
  onState: (state: AppState) => void,
  onError: (message: string) => void,
): () => void {
  let active = true;
  let seededOnce = false;
  let receivedRealtimeSnapshot = false;
  let deliveredInitial = false;

  const deliverState = (raw: unknown, fromRealtime: boolean) => {
    if (!active) return;
    if (fromRealtime) {
      receivedRealtimeSnapshot = true;
    } else if (receivedRealtimeSnapshot) {
      return;
    }
    deliveredInitial = true;
    onState(normalizeAppState(raw));
  };

  // Hidratación inicial rápida vía REST (~200ms)
  const restUrl = `${firebaseConfig.databaseURL}/${RTDB_ERP_PATH}.json`;
  void fetch(restUrl, { cache: 'no-store' })
    .then(async (resp) => {
      if (!active || receivedRealtimeSnapshot) return;
      if (!resp.ok) return;
      const data: unknown = await resp.json();
      if (!active || receivedRealtimeSnapshot) return;
      if (data !== null && data !== undefined) {
        deliverState(data, false);
      }
    })
    .catch(() => {
      // Fallback manejado por listener onValue / timeout
    });

  const safetyTimer = setTimeout(() => {
    if (!active || deliveredInitial) return;
    deliveredInitial = true;
    onState(createInitialState());
    onError(
      'Conexión lenta con Firebase Realtime Database; mostrando datos base mientras sincroniza.',
    );
  }, 6000);

  try {
    const db = getFirebaseDatabase();
    const stateRef = db.ref(RTDB_ERP_PATH);

    const listener = stateRef.on(
      'value',
      (snapshot) => {
        if (!active) return;
        clearTimeout(safetyTimer);

        if (!snapshot.exists() || snapshot.val() === null) {
          if (!seededOnce) {
            seededOnce = true;
            const initialPayload = sanitizeForFirebase(createInitialState());
            void stateRef
              .transaction((current) =>
                current === null ? initialPayload : current,
              )
              .catch((err: unknown) => {
                if (!active) return;
                onError(formatFirebaseError(err));
              });
          }
          return;
        }

        deliverState(snapshot.val(), true);
      },
      (error) => {
        if (!active) return;
        clearTimeout(safetyTimer);
        onError(formatFirebaseError(error));
      },
    );

    return () => {
      active = false;
      clearTimeout(safetyTimer);
      stateRef.off('value', listener);
    };
  } catch (err) {
    clearTimeout(safetyTimer);
    onError(formatFirebaseError(err));
    return () => {
      active = false;
      clearTimeout(safetyTimer);
    };
  }
}

/**
 * Escritura completa atómica vía set() en Firebase RTDB.
 */
export async function writeErpState(nextState: AppState): Promise<void> {
  const db = getFirebaseDatabase();
  const payload = sanitizeForFirebase(nextState);
  await db.ref(RTDB_ERP_PATH).set(payload);
}

/**
 * Actualización parcial atómica vía update() en Firebase RTDB.
 */
export async function updateErpState(
  partial: Partial<AppState>,
): Promise<void> {
  const db = getFirebaseDatabase();
  const payload = sanitizeForFirebase(partial) as Record<string, unknown>;
  await db.ref(RTDB_ERP_PATH).update(payload);
}

export async function writeExchangeRatesOnly(
  rates: ExchangeRates,
): Promise<void> {
  await updateErpState({ exchangeRates: rates });
}

export async function resetErpStateInFirebase(): Promise<AppState> {
  purgeLegacyLocalStorage();
  const fresh = createInitialState();
  await writeErpState(fresh);
  return fresh;
}

/**
 * Elimina todo dato fantasma o de prueba en localStorage y Firebase RTDB,
 * dejando un estado limpio con los saldos fijos iniciales en USDT ($120.19 caja,
 * $263.50 CxC desglosada, $1,912.35 capital inyectado, $624.00 gastos y $317.37 ganancia neta histórica).
 */
export async function purgeAllDataInFirebase(
  bcv = 46.5,
  usdt = 54.2,
  source: ExchangeRates['source'] = 'manual',
): Promise<AppState> {
  purgeLegacyLocalStorage();
  const clean = createEmptyCleanState(undefined, bcv, usdt);
  clean.exchangeRates.source = source;
  await writeErpState(clean);
  return clean;
}

export function formatFirebaseError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (
    msg.toLowerCase().includes('permission_denied') ||
    msg.toLowerCase().includes('permission denied')
  ) {
    return 'Permiso denegado en Firebase Realtime Database. Verifica las reglas de lectura/escritura en tu consola de Firebase.';
  }
  return msg || 'Error de conexión con Firebase Realtime Database.';
}

