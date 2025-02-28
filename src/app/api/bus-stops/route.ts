import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

// Route Segment Config for Next.js caching
export const revalidate = 1800; // 30 minutes in seconds

interface BusStop {
  id: string;
  code: string;
  name: string;
  direction: string;
  sequence: number;
  lat: number;
  lon: number;
}

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

interface ApiResponse {
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
  // Declare debugLog at the top level of the function
  let debugLog: fs.WriteStream | undefined;

  try {
    const searchParams = request.nextUrl.searchParams;
    const lineId = searchParams.get("lineId");

    if (!lineId) {
      return NextResponse.json(
        { error: "Bus line ID is required" },
        { status: 400 }
      );
    }

    // Create debug directory if it doesn't exist
    const debugDir = path.join(process.cwd(), "debug");
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }

    // Create a debug log file for this request
    const debugLogPath = path.join(
      debugDir,
      `debug_log_${lineId.replace(/\s+/g, "_")}.txt`
    );
    debugLog = fs.createWriteStream(debugLogPath, { flags: "w" });

    // Helper function to write to debug log
    const logDebug = (message: string, ...args: any[]) => {
      const timestamp = new Date().toISOString();
      let logMessage = `[${timestamp}] ${message}`;

      if (args.length > 0) {
        // If there are additional arguments, stringify them and append
        const argsStr = args
          .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : arg))
          .join(" ");
        logMessage += " " + argsStr;
      }

      logMessage += "\n";
      if (debugLog) {
        debugLog.write(logMessage);
      }
      console.log(message, ...args);
    };

    logDebug(`Starting API request for lineId: ${lineId}`);

    // Use the OneBusAway API to get all stops for a bus line
    const apiKey = process.env.MTA_API_KEY || "";
    const url = `https://bustime.mta.info/api/where/stops-for-route/${encodeURIComponent(
      lineId
    )}.json?key=${apiKey}&includePolylines=false&includeReferences=true&version=2`;

    logDebug(`Fetching stops for route: ${lineId} with URL: ${url}`);
    const response = await fetch(url, {
      cache: "no-store", // Ensures the fetch is fresh when revalidation occurs
    });

    if (!response.ok) {
      const errorText = await response.text();
      logDebug(`MTA API error: ${response.status} - ${errorText}`);

      return NextResponse.json(
        { error: `Failed to fetch bus stops: ${response.status}` },
        { status: response.status }
      );
    }

    const data: ApiResponse = await response.json();

    // For debugging: Save the raw response to a file
    try {
      fs.writeFileSync(
        path.join(debugDir, `api_response_${lineId.replace(/\s+/g, "_")}.json`),
        JSON.stringify(data, null, 2)
      );
      logDebug(`Saved raw API response to debug directory`);
    } catch (error) {
      logDebug(`Failed to save debug file: ${error}`);
    }

    // Log the raw response for debugging
    logDebug(`MTA API response status code: ${data.code}`);

    // Check for error in the API response
    if (data.code && data.code !== 200) {
      logDebug(
        `MTA API returned error code: ${data.code}, message: ${data.text}`
      );
      return NextResponse.json(
        { error: `API Error: ${data.text || "Unknown API error"}` },
        { status: 500 }
      );
    }

    // Extract stops data
    const entry = data.data?.entry;
    if (!entry) {
      logDebug("Missing entry in API response");
      return NextResponse.json(
        { error: "Missing entry in API response" },
        { status: 500 }
      );
    }

    // Add detailed logging of the raw response structure
    logDebug(
      `API Response Structure: ${JSON.stringify({
        hasStopGroupings: !!entry.stopGroupings,
        stopGroupingsLength: entry.stopGroupings?.length || 0,
        hasReferences: !!entry.references,
        hasStops: !!entry.references?.stops,
        stopsLength: entry.references?.stops?.length || 0,
      })}`
    );

    // Extract direction information from the stop groupings
    const stopGroupings = entry.stopGroupings;
    if (!stopGroupings || stopGroupings.length === 0) {
      logDebug("Missing stopGroupings in API response");
      return NextResponse.json(
        { error: "Missing stopGroupings in API response" },
        { status: 500 }
      );
    }

    // Process stop groupings to extract direction information
    const directionsArray = [];
    const stopIdsWithDirection: Array<{ stopId: string; direction: string }> =
      [];

    // Log stopGroupings for debugging
    logDebug(`Number of stopGroupings: ${stopGroupings.length}`);

    // Process each stop grouping
    for (const grouping of stopGroupings) {
      // Each grouping can have multiple stop groups (usually one per direction)
      if (grouping.stopGroups) {
        logDebug(
          `Number of stopGroups in grouping: ${grouping.stopGroups.length}`
        );

        for (const group of grouping.stopGroups) {
          // Extract direction name and stop IDs
          let directionId = "";
          let directionName = "";

          // Log the raw group structure for debugging
          logDebug(
            `Raw stop group structure: ${JSON.stringify(group, null, 2)}`
          );

          // Direction ID and name could be in various formats based on API response
          if (group.id) {
            if (typeof group.id === "string") {
              directionId = group.id;
              logDebug(`Found string directionId: ${directionId}`);
            } else if (typeof group.id === "object" && group.id.id) {
              directionId = group.id.id;
              logDebug(`Found object directionId: ${directionId}`);
            }
          }

          if (group.name) {
            if (typeof group.name === "string") {
              directionName = group.name;
              logDebug(`Found string directionName: ${directionName}`);
            } else if (typeof group.name === "object") {
              // Handle different possible structures of the name object
              if (group.name.name) {
                directionName = group.name.name;
                logDebug(
                  `Found object directionName from name.name: ${directionName}`
                );
              } else if (group.name.names && group.name.names.length > 0) {
                directionName = group.name.names[0];
                logDebug(
                  `Found object directionName from name.names[0]: ${directionName}`
                );
              }
            }
          }

          // Log direction info for debugging
          logDebug(
            `Direction ID: ${directionId}, Name: ${directionName}, StopIds: ${
              group.stopIds ? group.stopIds.length : 0
            }`
          );

          // Skip invalid groups
          if (!directionId || !directionName || !group.stopIds) {
            logDebug(
              "Skipping invalid group - missing directionId, directionName, or stopIds"
            );
            continue;
          }

          // Add direction to our list
          directionsArray.push({
            id: directionId,
            name: directionName,
          });

          // Process stop IDs for this direction
          for (const stopId of group.stopIds) {
            stopIdsWithDirection.push({
              stopId,
              direction: directionName,
            });
          }
        }
      }
    }

    // Log directions and stopIds for debugging
    logDebug(`Extracted ${directionsArray.length} directions`);
    logDebug(
      `Extracted ${stopIdsWithDirection.length} stop IDs with directions`
    );

    // Add detailed logging after processing stopGroupings
    logDebug(
      `Direction extraction results: ${JSON.stringify({
        directionsFound: directionsArray.length,
        stopIdsWithDirectionFound: stopIdsWithDirection.length,
        directionsArray: directionsArray.map((d) => d.name).slice(0, 3),
        sampleStopIds: stopIdsWithDirection.slice(0, 3).map((s) => s.stopId),
      })}`
    );

    // Extract stop details from the references
    let referencedStops: Record<string, StopReference> = {};
    if (
      entry.references &&
      entry.references.stops &&
      entry.references.stops.length > 0
    ) {
      // Log a sample of the referenced stops
      logDebug(
        "Sample referenced stops:",
        JSON.stringify(entry.references.stops.slice(0, 3), null, 2)
      );

      // Build a map of stop ID to stop details
      referencedStops = entry.references.stops.reduce(
        (acc: Record<string, StopReference>, stop: StopReference) => {
          if (stop.id) {
            acc[stop.id] = stop;
          }
          return acc;
        },
        {}
      );

      logDebug(`Found ${entry.references.stops.length} referenced stops`);
      logDebug(`Mapped ${Object.keys(referencedStops).length} stops to IDs`);
      logDebug(
        "Sample mapped stop IDs:",
        Object.keys(referencedStops).slice(0, 5)
      );
    } else {
      logDebug("No referenced stops found in API response");
    }

    // Add detailed logging of referenced stops
    logDebug(
      "Referenced stops info:",
      JSON.stringify({
        referencedStopsCount: Object.keys(referencedStops).length,
        sampleReferencedStopIds: Object.keys(referencedStops).slice(0, 5),
      })
    );

    // Build stops array with all info
    const stopsArray: BusStop[] = [];
    const missingStopIds: string[] = [];

    logDebug(
      `Processing ${stopIdsWithDirection.length} stop IDs with directions`
    );
    logDebug(
      "Sample stopIdsWithDirection:",
      JSON.stringify(stopIdsWithDirection.slice(0, 5), null, 2)
    );

    // Since the references section is not populated even with includeReferences=true,
    // we need to fetch all stops individually
    const allStopIds = [
      ...new Set(stopIdsWithDirection.map((item) => item.stopId)),
    ];
    logDebug(`Need to fetch ${allStopIds.length} unique stops individually`);

    // Fetch stops in parallel, in batches to avoid overwhelming the API
    const BATCH_SIZE = 5;
    const TOTAL_BATCHES = Math.ceil(allStopIds.length / BATCH_SIZE);

    logDebug(
      `Will fetch stops in ${TOTAL_BATCHES} batches of ${BATCH_SIZE} stops each`
    );

    for (let batchIndex = 0; batchIndex < TOTAL_BATCHES; batchIndex++) {
      const startIdx = batchIndex * BATCH_SIZE;
      const endIdx = startIdx + BATCH_SIZE;
      const batchStopIds = allStopIds.slice(startIdx, endIdx);

      logDebug(
        `Fetching batch ${batchIndex + 1}/${TOTAL_BATCHES} with ${
          batchStopIds.length
        } stops`
      );

      // Fetch stops in this batch in parallel
      await Promise.all(
        batchStopIds.map(async (stopId) => {
          try {
            const stopUrl = `https://bustime.mta.info/api/where/stop/${encodeURIComponent(
              stopId
            )}.json?key=${apiKey}`;

            logDebug(`Fetching individual stop ${stopId} with URL: ${stopUrl}`);
            const stopResponse = await fetch(stopUrl, {
              cache: "no-store",
            });

            if (stopResponse.ok) {
              const stopData = await stopResponse.json();
              logDebug(
                `Received response for stop ${stopId}: status=${stopData.code}`
              );

              // For debugging: Save the raw response to a file
              try {
                fs.writeFileSync(
                  path.join(debugDir, `stop_response_${stopId}.json`),
                  JSON.stringify(stopData, null, 2)
                );
                logDebug(
                  `Saved raw stop response for ${stopId} to debug directory`
                );
              } catch (error) {
                logDebug(`Failed to save stop debug file: ${error}`);
              }

              // The stop data is in data, not data.entry for individual stop requests
              if (stopData.data) {
                const stop = stopData.data;
                logDebug(`Successfully processed stop ${stopId}: ${stop.name}`);

                // Store in our temporary lookup
                individualStopsFetched[stopId] = stop;

                // Find all directions for this stop
                const directionsForStop = stopIdsWithDirection
                  .filter((item) => item.stopId === stopId)
                  .map((item) => item.direction);

                // Use the first direction if multiple exist (rare case)
                const direction =
                  directionsForStop.length > 0
                    ? directionsForStop[0]
                    : "Unknown Direction";

                // Add to our results
                stopsArray.push({
                  id: stopId,
                  code: stop.code || "",
                  name: stop.name || "Unknown Stop",
                  direction,
                  sequence: stopsArray.length + 1,
                  lat: stop.lat || 0,
                  lon: stop.lon || 0,
                });
              } else {
                logDebug(`Missing data for individual stop ${stopId}`);
                missingStopIds.push(stopId);
              }
            } else {
              logDebug(
                `Failed to fetch individual stop ${stopId}: ${stopResponse.status}`
              );
              missingStopIds.push(stopId);
            }
          } catch (error) {
            // Just skip this stop if there's an error
            logDebug(`Error fetching individual stop ${stopId}:`, error);
            missingStopIds.push(stopId);
          }
        })
      );

      // Small delay between batches to be nice to the API
      if (batchIndex < TOTAL_BATCHES - 1) {
        logDebug(`Batch ${batchIndex + 1} complete, waiting before next batch`);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Add detailed logging before the check for empty stopsArray
    logDebug(
      "Final stops array info:",
      JSON.stringify({
        stopsArrayLength: stopsArray.length,
        missingStopsCount: missingStopIds.length,
        individualStopsFetchedCount: Object.keys(individualStopsFetched).length,
        sampleStopsInArray: stopsArray
          .slice(0, 3)
          .map((s) => ({ id: s.id, name: s.name })),
      })
    );

    // Check if we have any stops
    if (stopsArray.length === 0) {
      logDebug("No stops found after processing MTA API response");
      return NextResponse.json(
        { error: "No stops could be extracted for this route" },
        { status: 404 }
      );
    }

    logDebug(
      `Returning ${stopsArray.length} stops and ${directionsArray.length} directions`
    );

    // Return the results
    return NextResponse.json({
      routeId: lineId,
      directions: directionsArray,
      stops: stopsArray,
    });
  } catch (error) {
    // Make sure logDebug is defined even in the catch block
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Unexpected error in bus-stops API route:", errorMessage);
    return NextResponse.json(
      { error: "Failed to fetch bus stops" },
      { status: 500 }
    );
  } finally {
    // Close the debug log file if it exists
    if (typeof debugLog !== "undefined") {
      debugLog.end();
    }
  }
}
