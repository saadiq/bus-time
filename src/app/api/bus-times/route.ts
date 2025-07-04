// src/app/api/bus-times/route.ts
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { validateBusLineId, validateStopId, ValidationError, isRateLimited, getClientId } from '@/lib/validation';
import { BusData, ApiResponse } from '@/types';

// Rate limiting storage
const requestMap = new Map<string, number[]>();

const _MTA_API_BASE = "https://bustime.mta.info/api/siri/stop-monitoring.json";
const _DEFAULT_ORIGIN_STOP_ID = "MTA_304213"; // Gates-Bedford
const _DEFAULT_DESTINATION_STOP_ID = "MTA_302434"; // Joralemon-Court
const _DEFAULT_LINE_REF = "MTA NYCT_B52";

// Stop name mappings
const STOP_NAMES: Record<string, string> = {
  MTA_304213: "Gates-Bedford",
  MTA_302434: "Joralemon-Court",
  // Add more stop names as needed
};

// Parse stop name from ID (fallback when not in STOP_NAMES)
function _parseStopNameFromId(stopId: string): string {
  if (STOP_NAMES[stopId]) return STOP_NAMES[stopId];

  const code = stopId.replace("MTA_", "");

  // Extract borough information from stop ID pattern
  if (code.startsWith("3")) {
    return `Brooklyn Stop #${code.substring(1)}`;
  } else if (code.startsWith("4")) {
    return `Bronx Stop #${code.substring(1)}`;
  } else if (code.startsWith("5")) {
    return `Queens Stop #${code.substring(1)}`;
  } else if (code.startsWith("6")) {
    return `Staten Island Stop #${code.substring(1)}`;
  } else if (code.startsWith("30")) {
    return `Manhattan Stop #${code.substring(2)}`;
  } else {
    return `Stop #${code}`;
  }
}

// Simple validation function
const _isValidStopId = (stopId: string): boolean => {
  return stopId.startsWith("MTA_");
};

const _isValidLineRef = (lineRef: string): boolean => {
  return lineRef.includes("MTA");
};

interface MonitoredCall {
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

interface MonitoredVehicleJourney {
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

interface MonitoredStopVisit {
  MonitoredVehicleJourney: MonitoredVehicleJourney;
}

interface StopMonitoringDelivery {
  MonitoredStopVisit: MonitoredStopVisit[];
}

interface ServiceDelivery {
  StopMonitoringDelivery: StopMonitoringDelivery[];
}

interface SiriResponse {
  Siri: {
    ServiceDelivery: ServiceDelivery;
  };
}

// Route Segment Config for Next.js caching
// For real-time data, we use a shorter cache time or force-dynamic
export const dynamic = "force-dynamic"; // Force dynamic to ensure fresh data each time
export const revalidate = 0; // No revalidation for real-time data

interface BusResponse {
  vehicleRef: string;
  originArrival: string | null;
  originStopsAway: number;
  destinationArrival: string | null;
  proximity: string;
  destination: string;
  isEstimated: boolean;
}

// Estimate travel time between stops (in minutes)
// This is a fallback when the API doesn't provide destination times
const _estimateTripDuration = (
  originId: string,
  destinationId: string
): number => {
  // Check if origin and destination are the same
  if (originId === destinationId) {
    return 0;
  }

  // We could implement a more sophisticated mapping of origin->destination to trip duration
  // using a lookup table for common routes.

  // For example, a simple lookup table could be used for common origin/destination pairs
  const knownRoutes: Record<string, number> = {
    // Format: originId_destinationId: minutes
    MTA_304213_MTA_302434: 25, // Gates-Bedford to Joralemon-Court
    MTA_302434_MTA_304213: 25, // Joralemon-Court to Gates-Bedford
    MTA_304213_MTA_308212: 20, // Gates-Bedford to Fulton St
    MTA_308212_MTA_304213: 20, // Fulton St to Gates-Bedford
    MTA_304213_MTA_305423: 15, // Gates-Bedford to Atlantic Terminal
    MTA_305423_MTA_304213: 15, // Atlantic Terminal to Gates-Bedford
    MTA_302434_MTA_308212: 10, // Joralemon-Court to Fulton St
    MTA_308212_MTA_302434: 10, // Fulton St to Joralemon-Court
    MTA_302434_MTA_305423: 12, // Joralemon-Court to Atlantic Terminal
    MTA_305423_MTA_302434: 12, // Atlantic Terminal to Joralemon-Court
    MTA_308212_MTA_305423: 8, // Fulton St to Atlantic Terminal
    MTA_305423_MTA_308212: 8, // Atlantic Terminal to Fulton St
  };

  const routeKey = `${originId}_${destinationId}`;
  if (knownRoutes[routeKey]) {
    return knownRoutes[routeKey];
  }

  // If we don't have a specific known duration for this origin/destination pair,
  // use a reasonable default based on stop ID patterns

  // Extract stop codes to check if they're in the same borough
  const originCode = originId.replace("MTA_", "");
  const destCode = destinationId.replace("MTA_", "");

  // If first digit of stop codes match, they're likely in the same borough
  if (originCode.charAt(0) === destCode.charAt(0)) {
    return 20; // Default for same borough: 20 minutes
  }

  // Different boroughs likely means longer trip
  return 40; // Default for different boroughs: 40 minutes
};

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const clientId = getClientId(request);
    if (isRateLimited(requestMap, clientId, 120)) { // Higher limit for real-time data
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // Input validation
    const searchParams = request.nextUrl.searchParams;
    const rawBusLine = searchParams.get("busLine");
    const rawOriginId = searchParams.get("originId");
    const rawDestinationId = searchParams.get("destinationId");

    let busLine: string, originId: string, destinationId: string;
    try {
      busLine = validateBusLineId(rawBusLine);
      originId = validateStopId(rawOriginId);
      destinationId = validateStopId(rawDestinationId);
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 400 }
        );
      }
      throw error;
    }

    // Fetch origin stop info
    const originResponse = await fetch(
      `${request.nextUrl.origin}/api/bus-stops/info?stopId=${encodeURIComponent(
        originId
      )}`,
      {
        cache: "no-store",
      }
    );

    if (!originResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch origin stop info" },
        { status: 500 }
      );
    }

    const originData = await originResponse.json();
    const originName = originData.name || "Unknown Origin";

    // Fetch destination stop info
    const destinationResponse = await fetch(
      `${request.nextUrl.origin}/api/bus-stops/info?stopId=${encodeURIComponent(
        destinationId
      )}`,
      {
        cache: "no-store",
      }
    );

    if (!destinationResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch destination stop info" },
        { status: 500 }
      );
    }

    const destinationData = await destinationResponse.json();
    const destinationName = destinationData.name || "Unknown Destination";

    // Only use real-time data
    try {
      // Record the start time
      const _startTime = Date.now();

      // Validate API key exists
      const apiKey = process.env.MTA_API_KEY;
      if (!apiKey) {
        console.error('MTA_API_KEY environment variable is not set');
        return NextResponse.json(
          { success: false, error: 'Service temporarily unavailable' },
          { status: 503 }
        );
      }

      // Use the MTA Bus Time API to get real-time arrivals
      const url = `https://bustime.mta.info/api/siri/stop-monitoring.json?key=${apiKey}&version=2&OperatorRef=MTA&MonitoringRef=${encodeURIComponent(
        originId
      )}&LineRef=${encodeURIComponent(
        busLine
      )}&StopMonitoringDetailLevel=calls`;

      const response = await fetch(url, {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
        cache: "no-store", // Never cache real-time data
      });

      if (!response.ok) {
        console.error(
          `API response error: ${response.status} ${response.statusText}`
        );
        return NextResponse.json(
          { error: "Failed to fetch bus times" },
          { status: 500 }
        );
      }

      const data = (await response.json()) as SiriResponse;

      // Extract bus arrivals from the response
      const deliveries =
        data.Siri?.ServiceDelivery?.StopMonitoringDelivery || [];

      if (!deliveries.length || !deliveries[0].MonitoredStopVisit) {
        return NextResponse.json({
          originName,
          destinationName,
          buses: [],
          hasError: false,
        });
      }

      const visits = deliveries[0].MonitoredStopVisit;

      // Filter buses by line and exclude those with ProgressStatus
      const filteredVisits = visits.filter((visit) => {
        // Only include buses for our route
        const correctRoute = visit.MonitoredVehicleJourney.LineRef === busLine;

        // Exclude buses with ProgressStatus (typically indicates a bus that's not in service)
        const inService = !visit.MonitoredVehicleJourney.ProgressStatus;

        return correctRoute && inService;
      });

      // Process each bus arrival
      const buses: BusResponse[] = filteredVisits.map((visit) => {
        const journey = visit.MonitoredVehicleJourney;
        const vehicleRef = journey.VehicleRef;
        const originArrival = journey.MonitoredCall?.ExpectedArrivalTime;

        // Validate origin arrival time format
        let formattedOriginArrival: string | null = null;
        let originArrivalDate: Date | null = null;

        try {
          if (originArrival) {
            // Parse and reformat the date to ensure consistent format
            originArrivalDate = new Date(originArrival);
            if (!isNaN(originArrivalDate.getTime())) {
              formattedOriginArrival = originArrivalDate.toISOString();
            } else {
              console.warn(
                `Invalid origin arrival time format for bus ${vehicleRef}: ${originArrival}`
              );
            }
          }
        } catch (_e) {
          console.error(
            `Error parsing origin arrival time for bus ${vehicleRef}:`,
            _e
          );
        }

        // Get stops away information - look in multiple places
        let originStopsAway: number = 0; // Default to 0

        // First check NumberOfStopsAway direct field
        if (journey.MonitoredCall?.NumberOfStopsAway !== undefined) {
          try {
            if (typeof journey.MonitoredCall.NumberOfStopsAway === "number") {
              originStopsAway = journey.MonitoredCall.NumberOfStopsAway;
            } else {
              const stopsAwayValue = String(
                journey.MonitoredCall.NumberOfStopsAway
              );
              originStopsAway = parseInt(stopsAwayValue, 10);
            }
          } catch (_e) {
            console.warn(
              `Failed to parse NumberOfStopsAway for bus ${vehicleRef}`
            );
          }
        }
        // Then check Extensions.Distances.StopsFromCall field
        else if (
          journey.MonitoredCall?.Extensions?.Distances?.StopsFromCall !==
          undefined
        ) {
          try {
            if (
              typeof journey.MonitoredCall.Extensions.Distances
                .StopsFromCall === "number"
            ) {
              originStopsAway =
                journey.MonitoredCall.Extensions.Distances.StopsFromCall;
            } else {
              const stopsFromCallValue = String(
                journey.MonitoredCall.Extensions.Distances.StopsFromCall
              );
              originStopsAway = parseInt(stopsFromCallValue, 10);
            }
          } catch (_e) {
            console.warn(`Failed to parse StopsFromCall for bus ${vehicleRef}`);
          }
        }
        // Try to extract from PresentableDistance (e.g. "2 stops away")
        else if (
          journey.MonitoredCall?.Extensions?.Distances?.PresentableDistance
        ) {
          const presentable =
            journey.MonitoredCall.Extensions.Distances.PresentableDistance;

          // Try to extract a number from the presentable distance (e.g. "2 stops away")
          const match = presentable.match(/^(\d+)/);
          if (match && match[1]) {
            originStopsAway = parseInt(match[1], 10);
          } else if (presentable.toLowerCase().includes("at stop")) {
            originStopsAway = 0;
          }
        }

        const destination = Array.isArray(journey.DestinationName)
          ? journey.DestinationName[0] || "Unknown"
          : journey.DestinationName || "Unknown";

        // Calculate destination arrival time (if available)
        let destinationArrival: string | null = null;
        let destinationFound = false;

        if (journey.OnwardCalls?.OnwardCall) {
          // Create variations of the destination ID for comparison
          const destinationIdVariations = [
            destinationId,
            destinationId.replace("MTA_", ""),
            `MTA_${destinationId.replace("MTA_", "")}`,
          ];

          // Try to find the exact destination in onward calls - with original matching
          const destinationCall = journey.OnwardCalls.OnwardCall.find(
            (call) => call.StopPointRef === destinationId
          );

          // If not found with exact match, try with variations
          let variantDestinationCall = null;
          if (!destinationCall) {
            for (const variant of destinationIdVariations) {
              variantDestinationCall = journey.OnwardCalls.OnwardCall.find(
                (call) => call.StopPointRef === variant
              );
              if (variantDestinationCall) break;
            }
          }

          // Use either the exact match or variant match
          const finalDestinationCall =
            destinationCall || variantDestinationCall;

          if (
            finalDestinationCall &&
            finalDestinationCall.ExpectedArrivalTime
          ) {
            try {
              // Parse and reformat the date for consistency
              const destArrivalDate = new Date(
                finalDestinationCall.ExpectedArrivalTime
              );
              if (!isNaN(destArrivalDate.getTime())) {
                destinationArrival = destArrivalDate.toISOString();
                destinationFound = true;
              } else {
                console.warn(
                  `Invalid destination arrival time format: ${finalDestinationCall.ExpectedArrivalTime}`
                );
              }
            } catch (_e) {
              console.error("Error parsing destination arrival time:", _e);
            }
          } else {
            // If we can't find the exact destination, try to find the last stop this bus will visit
            // This is useful when the destination stop might not be explicitly listed in onward calls
            if (journey.OnwardCalls.OnwardCall.length > 0) {
              const lastCall =
                journey.OnwardCalls.OnwardCall[
                  journey.OnwardCalls.OnwardCall.length - 1
                ];
              if (lastCall && lastCall.ExpectedArrivalTime) {
                try {
                  const lastCallDate = new Date(lastCall.ExpectedArrivalTime);
                  if (!isNaN(lastCallDate.getTime())) {
                    // Use the last stop as an approximation if it's after the origin arrival time
                    if (originArrivalDate && lastCallDate > originArrivalDate) {
                      destinationArrival = lastCallDate.toISOString();
                    }
                  }
                } catch (_e) {
                  console.error("Error parsing last call arrival time:", _e);
                }
              }
            }
          }
        }

        // Determine proximity description
        let proximity = "approaching";
        if (originStopsAway === 0) {
          proximity = "at stop";
        } else if (originStopsAway === 1) {
          proximity = "1 stop away";
        } else if (originStopsAway > 1) {
          proximity = `${originStopsAway} stops away`;
        } else {
          proximity = "en route";
        }

        return {
          vehicleRef,
          originArrival: formattedOriginArrival || null,
          originStopsAway,
          destinationArrival,
          proximity,
          destination,
          isEstimated: destinationArrival !== null && !destinationFound,
        };
      });

      const busData: BusData = {
        originName,
        destinationName,
        buses,
        hasError: false,
      };

      const apiResponse: ApiResponse<BusData> = {
        success: true,
        data: busData
      };

      return NextResponse.json(apiResponse);
    } catch (error) {
      console.error("Error fetching bus times:", {
        message: error instanceof Error ? error.message : 'Unknown error',
        url: request.url,
        busLine,
        originId,
        destinationId,
        timestamp: new Date().toISOString()
      });
      
      const errorData: BusData = {
        originName: 'Unknown',
        destinationName: 'Unknown',
        buses: [],
        hasError: true,
        errorMessage: "Failed to fetch bus times"
      };
      
      const errorResponse: ApiResponse<BusData> = {
        success: false,
        error: "Failed to fetch bus times"
      };
      
      return NextResponse.json(errorResponse, { status: 500 });
    }
  } catch (error) {
    console.error("Error in bus-times API:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      url: request.url,
      timestamp: new Date().toISOString()
    });
    
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: "Failed to fetch bus times"
    };
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
