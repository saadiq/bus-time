import { BusStop, Direction } from '@/types';

export interface StopReference {
  id: string;
  code?: string;
  name?: string;
  lat?: number;
  lon?: number;
  [key: string]: unknown;
}

export interface StopGroup {
  id?: { id: string } | string;
  name?: { name: string; names?: string[] };
  stopIds?: string[];
  [key: string]: unknown;
}

export interface MTAApiResponse {
  code?: number;
  text?: string;
  data?: {
    entry?: {
      stopGroupings?: Array<{
        stopGroups?: StopGroup[];
      }>;
      references?: {
        stops?: StopReference[];
      };
    };
    references?: {
      stops?: StopReference[];
    };
  };
}

/**
 * Build a stops map from MTA API references.
 * Checks both entry.references.stops and data.references.stops.
 */
export function buildStopsMap(data: MTAApiResponse): Record<string, StopReference> {
  const stopsMap: Record<string, StopReference> = {};
  const entry = data.data?.entry;

  const refStops =
    entry?.references?.stops ??
    data.data?.references?.stops;

  if (Array.isArray(refStops)) {
    for (const stop of refStops) {
      if (stop.id) {
        stopsMap[stop.id] = stop;
      }
    }
  }

  return stopsMap;
}

/**
 * Collect all unique stop IDs from stopGroupings.
 */
function collectStopIds(
  stopGroupings: Array<{ stopGroups?: StopGroup[] }>
): Set<string> {
  const allStopIds = new Set<string>();
  for (const grouping of stopGroupings) {
    for (const group of grouping.stopGroups ?? []) {
      const ids = Array.isArray(group.stopIds)
        ? group.stopIds
        : group.stopIds
          ? [group.stopIds]
          : [];
      for (const id of ids) {
        allStopIds.add(id);
      }
    }
  }
  return allStopIds;
}

/**
 * Fetch individual stop details for stops missing from the references section.
 * Mutates `stopsMap` in place.
 */
export async function fetchMissingStops(
  stopGroupings: Array<{ stopGroups?: StopGroup[] }>,
  apiKey: string,
  stopsMap: Record<string, StopReference>
): Promise<void> {
  const allStopIds = collectStopIds(stopGroupings);

  const stopPromises = Array.from(allStopIds).map(async (stopId) => {
    try {
      const stopUrl = `https://bustime.mta.info/api/where/stop/${encodeURIComponent(
        stopId
      )}.json?key=${apiKey}&version=2`;
      const response = await fetch(stopUrl, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });

      if (!response.ok) {
        console.warn(`Failed to fetch stop ${stopId}: ${response.status}`);
        return;
      }

      const stopData = await response.json();
      if (stopData.code === 200 && stopData.data?.entry) {
        const stop = stopData.data.entry;
        stopsMap[stopId] = {
          id: stopId,
          code: stop.code || "",
          name: stop.name || "Unknown Stop",
          lat: stop.lat || 0,
          lon: stop.lon || 0,
        };
      }
    } catch (err) {
      console.warn(`Error fetching stop ${stopId}:`, err);
    }
  });

  await Promise.all(stopPromises);
}

/**
 * Extract direction ID from a StopGroup.
 */
function extractDirectionId(group: StopGroup): string {
  if (!group.id) return "";
  return typeof group.id === "string" ? group.id : group.id.id || "";
}

/**
 * Extract direction name from a StopGroup.
 */
function extractDirectionName(group: StopGroup): string {
  if (!group.name) return "";
  if (typeof group.name === "string") return group.name;
  return group.name.name || group.name.names?.[0] || "";
}

/**
 * Process stopGroupings into directions and stops arrays.
 */
export function processStopGroupings(
  stopGroupings: Array<{ stopGroups?: StopGroup[] }>,
  stopsMap: Record<string, StopReference>
): { directions: Direction[]; stops: BusStop[] } {
  const directions: Direction[] = [];
  const stops: BusStop[] = [];
  let sequence = 1;

  for (const grouping of stopGroupings) {
    for (const group of grouping.stopGroups ?? []) {
      const directionId = extractDirectionId(group);
      const directionName = extractDirectionName(group);

      if (!directionId || !directionName) continue;

      directions.push({ id: directionId, name: directionName });

      const stopIds = Array.isArray(group.stopIds)
        ? group.stopIds
        : group.stopIds
          ? [group.stopIds]
          : [];

      for (const stopId of stopIds) {
        const details = stopsMap[stopId];
        if (!details) continue;
        stops.push({
          id: stopId,
          code: details.code || "",
          name: details.name || "Unknown Stop",
          direction: directionName,
          sequence: sequence++,
          lat: details.lat || 0,
          lon: details.lon || 0,
        });
      }
    }
  }

  return { directions, stops };
}
