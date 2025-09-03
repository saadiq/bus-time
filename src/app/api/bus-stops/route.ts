import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { validateBusLineId, ValidationError, isRateLimited, getClientId } from '@/lib/validation';
import { BusStop, Direction, ApiResponse } from '@/types';

// Route Segment Config for Next.js caching
export const revalidate = 1800; // 30 minutes in seconds

// Rate limiting storage
const requestMap = new Map<string, number[]>();

interface StopReference {
  id: string;
  code?: string;
  name?: string;
  lat?: number;
  lon?: number;
  [key: string]: unknown;
}

interface StopGroup {
  id?: { id: string } | string;
  name?: { name: string; names?: string[] };
  stopIds?: string[];
  [key: string]: unknown;
}

interface MTAApiResponse {
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
  };
}

// Store fetched individual stops in this variable during request processing
// This is not a persistent cache, just a temporary lookup map during a single request
const individualStopsFetched: Record<string, StopReference> = {};

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const clientId = getClientId(request);
    if (isRateLimited(requestMap, clientId, 60)) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // Input validation
    const searchParams = request.nextUrl.searchParams;
    const rawLineId = searchParams.get("lineId");

    let lineId: string;
    try {
      lineId = validateBusLineId(rawLineId);
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 400 }
        );
      }
      throw error;
    }

    // Validate API key exists
    const apiKey = process.env.MTA_API_KEY;
    if (!apiKey) {
      console.error('MTA_API_KEY environment variable is not set');
      return NextResponse.json(
        { success: false, error: 'Service temporarily unavailable' },
        { status: 503 }
      );
    }

    // Use the OneBusAway API to get all stops for a bus line
    const url = `https://bustime.mta.info/api/where/stops-for-route/${encodeURIComponent(
      lineId
    )}.json?key=${apiKey}&includePolylines=false&includeReferences=true&version=2`;


    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("API Error Response:", {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      return NextResponse.json(
        { error: `Failed to fetch bus stops: ${response.status}` },
        { status: response.status }
      );
    }

    const data: MTAApiResponse = await response.json();

    // Check for error in the API response
    if (data.code && data.code !== 200) {
      console.error("API Error:", data.text);
      return NextResponse.json(
        { error: `API Error: ${data.text || "Unknown API error"}` },
        { status: 500 }
      );
    }

    // Extract stops data
    const entry = data.data?.entry;
    if (!entry) {
      console.error("Missing entry in API response. Data structure:", {
        hasData: !!data.data,
        dataKeys: data.data ? Object.keys(data.data) : [],
      });
      return NextResponse.json(
        { error: "Missing entry in API response" },
        { status: 500 }
      );
    }
    
    // Log the structure to understand what we're getting
    console.log("API Response structure:", {
      hasReferences: !!entry.references,
      hasStopGroupings: !!entry.stopGroupings,
      stopGroupingsLength: entry.stopGroupings?.length || 0,
      referencesKeys: entry.references ? Object.keys(entry.references) : [],
    });

    // First, build a map of all stops from the references section
    const stopsMap: Record<string, StopReference> = {};
    
    // Check if stops are in the references section
    if (entry.references?.stops && Array.isArray(entry.references.stops)) {
      console.log(`Found ${entry.references.stops.length} stops in references`);
      entry.references.stops.forEach((stop) => {
        if (stop.id) {
          stopsMap[stop.id] = stop;
        }
      });
    } else {
      console.log("No stops array in references, checking data.references");
      // Sometimes the API returns stops in data.references
      if (data.data?.references?.stops && Array.isArray(data.data.references.stops)) {
        console.log(`Found ${data.data.references.stops.length} stops in data.references`);
        data.data.references.stops.forEach((stop: StopReference) => {
          if (stop.id) {
            stopsMap[stop.id] = stop;
          }
        });
      }
    }

    if (Object.keys(stopsMap).length === 0) {
      console.warn(
        "No stops found in references section. Will fetch individually."
      );

      // Extract direction information from the stop groupings
      const stopGroupings = entry.stopGroupings;
      if (!stopGroupings || stopGroupings.length === 0) {
        console.warn("No stop groupings found. Raw entry:", {
          hasStopGroupings: !!entry.stopGroupings,
          stopGroupingsLength: entry.stopGroupings?.length || 0,
          entryKeys: Object.keys(entry),
        });
        return NextResponse.json(
          { error: "Missing stopGroupings in API response" },
          { status: 500 }
        );
      }

      // If no stops in references, we need to fetch them individually
      // First, collect all unique stop IDs from the stopGroupings
      const allStopIds = new Set<string>();
      stopGroupings.forEach((grouping) => {
        grouping.stopGroups?.forEach((group) => {
          if (group.stopIds) {
            const stopIds = Array.isArray(group.stopIds)
              ? group.stopIds
              : [group.stopIds];
            stopIds.forEach((id) => allStopIds.add(id));
          }
        });
      });


      console.log(`Fetching ${allStopIds.size} individual stops...`);
      
      // Fetch stop details in parallel (limit concurrent requests)
      const stopPromises = Array.from(allStopIds).map(async (stopId) => {
        try {
          const stopUrl = `https://bustime.mta.info/api/where/stop/${encodeURIComponent(
            stopId
          )}.json?key=${apiKey}&version=2`;
          const response = await fetch(stopUrl, {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
            },
          });

          if (!response.ok) {
            console.warn(`Failed to fetch stop ${stopId}:`, response.status);
            return null;
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
            return stop;
          } else {
            console.warn(`Invalid data for stop ${stopId}:`, stopData.code);
          }
        } catch (err) {
          console.warn(`Error fetching stop ${stopId}:`, err);
        }
        return null;
      });

      // Wait for all stop details to be fetched
      const results = await Promise.all(stopPromises);
      const successCount = results.filter(r => r !== null).length;
      console.log(`Successfully fetched ${successCount}/${allStopIds.size} stops`);
    }

    // Extract direction information from the stop groupings
    const stopGroupings = entry.stopGroupings;
    if (!stopGroupings || stopGroupings.length === 0) {
      console.warn("No stop groupings found. Raw entry:", {
        hasStopGroupings: !!entry.stopGroupings,
        stopGroupingsLength: entry.stopGroupings?.length || 0,
        entryKeys: Object.keys(entry),
      });
      return NextResponse.json(
        { error: "Missing stopGroupings in API response" },
        { status: 500 }
      );
    }

    // Process stop groupings to extract direction information and stops
    const directionsArray: Direction[] = [];
    const stopsArray: BusStop[] = [];
    let sequence = 1;

    console.log(`Processing stopGroupings, stopsMap has ${Object.keys(stopsMap).length} stops`);

    // Process each stop grouping
    for (const grouping of stopGroupings) {
      if (grouping.stopGroups) {
        console.log(`Processing ${grouping.stopGroups.length} stop groups`);
        for (const group of grouping.stopGroups) {
          // Extract direction information
          let directionId = "";
          let directionName = "";

          if (group.id) {
            directionId =
              typeof group.id === "string" ? group.id : group.id.id || "";
          }

          if (group.name) {
            if (typeof group.name === "string") {
              directionName = group.name;
            } else if (typeof group.name === "object") {
              directionName =
                group.name.name ||
                (group.name.names && group.name.names[0]) ||
                "";
            }
          }

          if (directionId && directionName) {
            directionsArray.push({ id: directionId, name: directionName });

            // Process stops for this direction
            if (group.stopIds) {
              const stopIds = Array.isArray(group.stopIds)
                ? group.stopIds
                : [group.stopIds];

              console.log(`Direction ${directionName}: Processing ${stopIds.length} stopIds`);

              stopIds.forEach((stopId) => {
                const stopDetails = stopsMap[stopId];
                if (stopDetails) {
                  stopsArray.push({
                    id: stopId,
                    code: stopDetails.code || "",
                    name: stopDetails.name || "Unknown Stop",
                    direction: directionName,
                    sequence: sequence++,
                    lat: stopDetails.lat || 0,
                    lon: stopDetails.lon || 0,
                  });
                } else {
                  console.warn(
                    `Stop ${stopId} not found in stopsMap for direction ${directionName}, skipping`
                  );
                }
              });
            } else {
              console.warn(`No stopIds found for direction ${directionName}`);
            }
          } else {
            console.warn("Invalid direction data:", { group });
          }
        }
      } else {
        console.warn("No stop groups found in grouping:", grouping);
      }
    }


    // Check if we have any stops
    console.log(`Final results: ${directionsArray.length} directions, ${stopsArray.length} stops`);
    
    if (stopsArray.length === 0) {
      console.warn("No stops found after processing. Debug info:", {
        stopsMapSize: Object.keys(stopsMap).length,
        directionsCount: directionsArray.length,
        stopGroupingsCount: stopGroupings.length,
        stopGroupsCount: stopGroupings.reduce(
          (acc, g) => acc + (g.stopGroups?.length || 0),
          0
        ),
      });
      const errorResponse: ApiResponse<never> = {
        success: false,
        error: "No stops could be extracted for this route"
      };
      return NextResponse.json(errorResponse, { status: 404 });
    }

    // Return the results
    const apiResponse: ApiResponse<{ routeId: string; directions: Direction[]; stops: BusStop[] }> = {
      success: true,
      data: {
        routeId: lineId,
        directions: directionsArray,
        stops: stopsArray,
      }
    };
    
    return NextResponse.json(apiResponse);
  } catch (error) {
    console.error("Error in bus-stops API route:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      url: request.url,
      lineId: 'validation-failed',
      timestamp: new Date().toISOString()
    });
    
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: "Failed to fetch bus stops"
    };
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
