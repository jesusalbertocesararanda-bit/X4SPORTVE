import { round2 } from './finance';

export interface LiveRatesResult {
  ok: boolean;
  bcv?: number;
  usdt?: number;
  updatedAt?: string;
  providerLabel?: string;
  error?: string;
}

interface DolarApiEntry {
  fuente?: string;
  nombre?: string;
  promedio?: number;
  fechaActualizacion?: string;
}

export function parseDolarApiPayload(data: unknown): {
  bcv: number;
  usdt: number;
  updatedAt: string;
} | null {
  if (!Array.isArray(data)) return null;

  const entries = data as DolarApiEntry[];
  const oficial = entries.find(
    (e) =>
      e.fuente?.toLowerCase() === 'oficial' ||
      e.nombre?.toLowerCase() === 'dólar' ||
      e.nombre?.toLowerCase() === 'oficial',
  );
  const paralelo = entries.find(
    (e) =>
      e.fuente?.toLowerCase() === 'paralelo' ||
      e.nombre?.toLowerCase() === 'paralelo',
  );

  const bcv = round2(Number(oficial?.promedio ?? 0));
  const usdt = round2(Number(paralelo?.promedio ?? 0));

  if (!Number.isFinite(bcv) || bcv <= 0 || !Number.isFinite(usdt) || usdt <= 0) {
    return null;
  }

  return {
    bcv,
    usdt,
    updatedAt:
      paralelo?.fechaActualizacion ??
      oficial?.fechaActualizacion ??
      new Date().toISOString(),
  };
}

export async function fetchVenezuelaExchangeRates(): Promise<LiveRatesResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);

  try {
    const response = await fetch('https://ve.dolarapi.com/v1/dolares', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (response.ok) {
      const json: unknown = await response.json();
      const parsed = parseDolarApiPayload(json);
      if (parsed) {
        return {
          ok: true,
          bcv: parsed.bcv,
          usdt: parsed.usdt,
          updatedAt: parsed.updatedAt,
          providerLabel: 'DolarAPI VE (BCV / Paralelo)',
        };
      }
    }

    return {
      ok: false,
      error: 'No se pudo obtener respuesta válida de la API de tasas.',
    };
  } catch {
    return {
      ok: false,
      error: 'Sin conexión con la API pública; puedes ajustar las tasas manualmente.',
    };
  } finally {
    clearTimeout(timer);
  }
}
