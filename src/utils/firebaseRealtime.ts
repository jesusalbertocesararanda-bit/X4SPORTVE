import {
  createDemoSeedState,
  createEmptyCleanState,
  createInitialState,
} from '../data/initialState';
import type { AppState, ExchangeRates } from '../types/erp';
import {
  isAccidentalDemoCatalogOnly,
  migrateLegacyStateToCurrent,
  normalizeAppState,
  recoverStartupErpState,
  sanitizeForFirebase,
} from './finance';

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
export const LOCAL_BACKUP_KEY = 'x4sport_erp_backup_v2';

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
 * Lee en modo SOLO LECTURA cualquier respaldo previo en localStorage (sin borrar ni sobrescribir nada)
 * para migrar automáticamente estructuras anteriores de X4SPORT al formato actual.
 */
export function readLocalStorageRecoveryCandidates(): unknown[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  const candidates: unknown[] = [];
  try {
    const primaryRaw = window.localStorage.getItem(LOCAL_BACKUP_KEY);
    if (primaryRaw) {
      candidates.push(primaryRaw);
    }
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || k === LOCAL_BACKUP_KEY) continue;
      const lower = k.toLowerCase();
      if (
        lower.includes('x4sport') ||
        lower.includes('erp') ||
        lower.includes('inventory') ||
        lower.includes('inventario') ||
        lower.includes('ventas') ||
        lower.includes('finanzas')
      ) {
        const raw = window.localStorage.getItem(k);
        if (raw) candidates.push(raw);
      }
    }
  } catch {
    // Lectura segura ante restricciones del navegador
  }
  return candidates;
}

/**
 * Persiste en localStorage el estado real completo de la app.
 * Nunca guarda ítems genéricos de prueba no autorizados ni sobrescribe un inventario
 * real previo con un arreglo vacío transitorio antes de hidratar Firebase.
 */
export function saveLocalStateBackup(
  state: AppState,
  options?: { allowOverwriteEmpty?: boolean },
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if (isAccidentalDemoCatalogOnly(state)) return;

  if (
    !options?.allowOverwriteEmpty &&
    (!state.inventory || state.inventory.length === 0) &&
    !state.userPurgedEmpty
  ) {
    try {
      const existingRaw = window.localStorage.getItem(LOCAL_BACKUP_KEY);
      if (existingRaw) {
        const existingMigrated = migrateLegacyStateToCurrent(existingRaw);
        if (
          existingMigrated &&
          existingMigrated.inventory.length > 0 &&
          !isAccidentalDemoCatalogOnly(existingMigrated)
        ) {
          return;
        }
      }
    } catch {
      // Continuar con guardado seguro
    }
  }

  try {
    window.localStorage.setItem(
      LOCAL_BACKUP_KEY,
      JSON.stringify(sanitizeForFirebase(state)),
    );
  } catch {
    // Ignorar errores de cuota llena
  }
}

/**
 * Conservada por compatibilidad de API: ya no destruye localStorage automáticamente
 * para respetar el blindaje anti-borrado de datos del usuario.
 */
export function purgeLegacyLocalStorage(): number {
  return 0;
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
 * con hidratación REST rápida inicial y recuperación/migración automática no destructiva.
 */
export function subscribeErpState(
  onState: (state: AppState) => void,
  onError: (message: string) => void,
): () => void {
  let active = true;
  let seededOnce = false;
  let syncedRecoveryOnce = false;
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

    const normalized = normalizeAppState(raw);
    const { state: recovered, needsFirebaseSync } = recoverStartupErpState(
      normalized,
      readLocalStorageRecoveryCandidates(),
    );

    saveLocalStateBackup(recovered, { allowOverwriteEmpty: needsFirebaseSync });

    onState(recovered);

    if (fromRealtime && needsFirebaseSync && !syncedRecoveryOnce) {
      syncedRecoveryOnce = true;
      void writeErpState(recovered).catch(() => {
        // Reintentará en la próxima escritura si la red está momentáneamente offline
      });
    }
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
    const { state: fallbackRecovered, needsFirebaseSync } = recoverStartupErpState(
      createInitialState(),
      readLocalStorageRecoveryCandidates(),
    );
    saveLocalStateBackup(fallbackRecovered, { allowOverwriteEmpty: needsFirebaseSync });
    onState(fallbackRecovered);
    onError(
      'Conexión lenta con Firebase Realtime Database; mostrando datos recuperados mientras sincroniza.',
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
            const { state: initialRecovered } = recoverStartupErpState(
              createInitialState(),
              readLocalStorageRecoveryCandidates(),
            );
            const initialPayload = sanitizeForFirebase(initialRecovered);
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
 * Escritura completa atómica vía set() en Firebase RTDB + respaldo directo en localStorage.
 */
export async function writeErpState(nextState: AppState): Promise<void> {
  saveLocalStateBackup(nextState, { allowOverwriteEmpty: true });
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

export async function resetBaselineStateInFirebase(): Promise<AppState> {
  const fresh = createInitialState();
  await writeErpState(fresh);
  return fresh;
}

export async function resetErpStateInFirebase(): Promise<AppState> {
  const demo = createDemoSeedState();
  await writeErpState(demo);
  return demo;
}

/**
 * Reinicia explícitamente la nube a un estado sin inventario manteniendo los saldos fijos iniciales
 * ($135.19 caja, $263.50 CxC desglosada, $1,912.35 capital, $624.00 gastos y $317.37 ganancia neta histórica),
 * sin borrar el respaldo histórico existente en localStorage.
 */
export async function purgeAllDataInFirebase(
  bcv = 46.5,
  usdt = 54.2,
  source: ExchangeRates['source'] = 'manual',
): Promise<AppState> {
  const clean = createEmptyCleanState(undefined, bcv, usdt);
  clean.exchangeRates.source = source;
  clean.userPurgedEmpty = true;
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

