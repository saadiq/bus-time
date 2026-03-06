/**
 * Shared MTA API utilities for direct server-side calls
 * These functions call the MTA API directly, avoiding internal HTTP calls
 * which can fail in Vercel preview environments with authentication enabled.
 */

export interface StopInfoResult {
  name: string;
  id: string;
  lat: number;
  lon: number;
  direction: string;
}

// --- In-memory cache for stop info (30-minute TTL) ---

interface CacheEntry {
  data: StopInfoResult;
  expiresAt: number;
}

const STOP_INFO_TTL_MS = 30 * 60 * 1000; // 30 minutes
const STOP_INFO_CACHE_MAX = 500;
const stopInfoCache = new Map<string, CacheEntry>();

function getCachedStopInfo(stopId: string): StopInfoResult | null {
  const entry = stopInfoCache.get(stopId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    stopInfoCache.delete(stopId);
    return null;
  }
  return entry.data;
}

function setCachedStopInfo(stopId: string, data: StopInfoResult): void {
  if (stopInfoCache.size >= STOP_INFO_CACHE_MAX) {
    const firstKey = stopInfoCache.keys().next().value;
    if (firstKey) stopInfoCache.delete(firstKey);
  }
  stopInfoCache.set(stopId, { data, expiresAt: Date.now() + STOP_INFO_TTL_MS });
}

/**
 * Fetch stop information directly from MTA API.
 * Results are cached in-memory for 30 minutes since stop names rarely change.
 * @param stopId - The MTA stop ID (e.g., "MTA_304213")
 * @returns Stop info or null if not found
 */
export async function fetchStopInfo(stopId: string): Promise<StopInfoResult | null> {
  // Check cache first
  const cached = getCachedStopInfo(stopId);
  if (cached) return cached;

  const apiKey = process.env.MTA_API_KEY;
  if (!apiKey) {
    console.error('MTA_API_KEY environment variable is not set');
    return null;
  }

  try {
    const url = `https://bustime.mta.info/api/where/stop/${encodeURIComponent(stopId)}.json?key=${apiKey}`;

    const response = await fetch(url, {
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(`Failed to fetch stop info for ${stopId}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.code && data.code !== 200) {
      console.error(`MTA API error for stop ${stopId}: ${data.text || 'Unknown error'}`);
      return null;
    }

    if (!data.data) {
      console.error(`Missing data in MTA API response for stop ${stopId}`);
      return null;
    }

    const entry = data.data;
    const result: StopInfoResult = {
      name: entry.name || 'Unknown Stop',
      id: entry.id || stopId,
      lat: entry.lat || 0,
      lon: entry.lon || 0,
      direction: entry.direction || '',
    };

    // Store in cache
    setCachedStopInfo(stopId, result);

    return result;
  } catch (error) {
    console.error(`Error fetching stop info for ${stopId}:`, error);
    return null;
  }
}
