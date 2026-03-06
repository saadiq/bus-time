// SIRI response interfaces and parsing utilities for MTA Bus Time API

import { BusResponse } from '@/types';

// --- SIRI API Response Interfaces ---

export interface MonitoredCall {
  ExpectedArrivalTime: string;
  NumberOfStopsAway?: number;
  ArrivalProximityText?: string;
  AimedArrivalTime: string;
  Extensions?: {
    Distances?: {
      PresentableDistance?: string;
      DistanceFromCall?: number;
      StopsFromCall?: number;
      CallDistanceAlongRoute?: number;
    };
  };
}

export interface MonitoredVehicleJourney {
  VehicleRef: string;
  MonitoredCall: MonitoredCall;
  DestinationName: string[];
  ProgressStatus?: string[];
  LineRef?: string;
  PublishedLineName?: string[];
  OnwardCalls?: {
    OnwardCall: Array<{
      StopPointRef: string;
      ExpectedArrivalTime: string;
    }>;
  };
}

export interface MonitoredStopVisit {
  MonitoredVehicleJourney: MonitoredVehicleJourney;
}

export interface StopMonitoringDelivery {
  MonitoredStopVisit: MonitoredStopVisit[];
}

export interface ServiceDelivery {
  StopMonitoringDelivery: StopMonitoringDelivery[];
}

export interface SiriResponse {
  Siri: {
    ServiceDelivery: ServiceDelivery;
  };
}

// --- Parsing helpers ---

function parseArrivalTime(timeStr: string, label: string): { date: Date; iso: string } | null {
  try {
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      return { date: d, iso: d.toISOString() };
    }
    console.warn(`Invalid ${label} time format: ${timeStr}`);
  } catch (e) {
    console.error(`Error parsing ${label} time:`, e);
  }
  return null;
}

function extractStopsAway(journey: MonitoredVehicleJourney): number {
  const mc = journey.MonitoredCall;

  // First: NumberOfStopsAway direct field
  if (mc?.NumberOfStopsAway !== undefined) {
    const val = typeof mc.NumberOfStopsAway === "number"
      ? mc.NumberOfStopsAway
      : parseInt(String(mc.NumberOfStopsAway), 10);
    if (!isNaN(val)) return val;
  }

  // Second: Extensions.Distances.StopsFromCall
  const stopsFromCall = mc?.Extensions?.Distances?.StopsFromCall;
  if (stopsFromCall !== undefined) {
    const val = typeof stopsFromCall === "number"
      ? stopsFromCall
      : parseInt(String(stopsFromCall), 10);
    if (!isNaN(val)) return val;
  }

  // Third: Parse from PresentableDistance (e.g. "2 stops away")
  const presentable = mc?.Extensions?.Distances?.PresentableDistance;
  if (presentable) {
    const match = presentable.match(/^(\d+)/);
    if (match && match[1]) return parseInt(match[1], 10);
    if (presentable.toLowerCase().includes("at stop")) return 0;
  }

  return 0;
}

function findDestinationArrival(
  journey: MonitoredVehicleJourney,
  destinationId: string,
  originArrivalDate: Date | null
): { arrival: string | null; found: boolean } {
  if (!journey.OnwardCalls?.OnwardCall) {
    return { arrival: null, found: false };
  }

  const onwardCalls = journey.OnwardCalls.OnwardCall;

  // Build ID variations for flexible matching
  const variations = [
    destinationId,
    destinationId.replace("MTA_", ""),
    `MTA_${destinationId.replace("MTA_", "")}`,
  ];

  // Exact match first, then try variations
  let destCall = onwardCalls.find((c) => c.StopPointRef === destinationId);
  if (!destCall) {
    for (const variant of variations) {
      destCall = onwardCalls.find((c) => c.StopPointRef === variant);
      if (destCall) break;
    }
  }

  if (destCall?.ExpectedArrivalTime) {
    const parsed = parseArrivalTime(destCall.ExpectedArrivalTime, "destination arrival");
    if (parsed) return { arrival: parsed.iso, found: true };
  }

  // Fallback: use last onward call if it's after the origin arrival
  if (onwardCalls.length > 0) {
    const lastCall = onwardCalls[onwardCalls.length - 1];
    if (lastCall?.ExpectedArrivalTime) {
      const parsed = parseArrivalTime(lastCall.ExpectedArrivalTime, "last call arrival");
      if (parsed && originArrivalDate && parsed.date > originArrivalDate) {
        return { arrival: parsed.iso, found: false };
      }
    }
  }

  return { arrival: null, found: false };
}

function proximityText(stopsAway: number): string {
  if (stopsAway === 0) return "at stop";
  if (stopsAway === 1) return "1 stop away";
  if (stopsAway > 1) return `${stopsAway} stops away`;
  return "en route";
}

// --- Main entry point ---

export interface ParseResult {
  buses: BusResponse[];
  hasError: boolean;
}

/**
 * Parse a SIRI StopMonitoring response into a flat list of BusResponse objects.
 * Filters by busLine, excludes out-of-service vehicles, and resolves destination arrival times.
 */
export function parseSiriResponse(
  data: SiriResponse,
  busLine: string,
  destinationId: string
): ParseResult {
  const deliveries = data.Siri?.ServiceDelivery?.StopMonitoringDelivery || [];

  if (!deliveries.length || !deliveries[0].MonitoredStopVisit) {
    return { buses: [], hasError: false };
  }

  const visits = deliveries[0].MonitoredStopVisit;

  const filteredVisits = visits.filter((visit) => {
    const correctRoute = visit.MonitoredVehicleJourney.LineRef === busLine;
    const inService = !visit.MonitoredVehicleJourney.ProgressStatus;
    return correctRoute && inService;
  });

  const buses: BusResponse[] = filteredVisits.map((visit) => {
    const journey = visit.MonitoredVehicleJourney;
    const vehicleRef = journey.VehicleRef;

    // Origin arrival
    const originParsed = journey.MonitoredCall?.ExpectedArrivalTime
      ? parseArrivalTime(journey.MonitoredCall.ExpectedArrivalTime, `origin for bus ${vehicleRef}`)
      : null;

    const originStopsAway = extractStopsAway(journey);

    const destination = Array.isArray(journey.DestinationName)
      ? journey.DestinationName[0] || "Unknown"
      : journey.DestinationName || "Unknown";

    // Destination arrival
    const { arrival: destinationArrival, found: destinationFound } =
      findDestinationArrival(journey, destinationId, originParsed?.date ?? null);

    return {
      vehicleRef,
      originArrival: originParsed?.iso ?? null,
      originStopsAway,
      destinationArrival,
      proximity: proximityText(originStopsAway),
      destination,
      isEstimated: destinationArrival !== null && !destinationFound,
    };
  });

  return { buses, hasError: false };
}
