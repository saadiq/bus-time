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

interface Direction {
  id: string;
  name: string;
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
  try {
    const searchParams = request.nextUrl.searchParams;
    const lineId = searchParams.get("lineId");

    if (!lineId) {
      return NextResponse.json(
        { error: "Bus line ID is required" },
        { status: 400 }
      );
    }

    // Use the OneBusAway API to get all stops for a bus line
    const apiKey = process.env.MTA_API_KEY || "";
    const url = `https://bustime.mta.info/api/where/stops-for-route/${encodeURIComponent(
      lineId
    )}.json?key=${apiKey}&includePolylines=false&includeReferences=true&version=2`;

    // console.log("Fetching stops with URL:", url);

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

    const data: ApiResponse = await response.json();

    // Log the raw response data (excluding sensitive information)
    console.log("Raw API Response:", {
      code: data.code,
      text: data.text,
      hasData: !!data.data,
      hasEntry: !!data.data?.entry,
      entryKeys: data.data?.entry ? Object.keys(data.data.entry) : [],
      stopGroupings: data.data?.entry?.stopGroupings?.map((grouping) => ({
        stopGroups: grouping.stopGroups?.map((group) => ({
          id: group.id,
          name: group.name,
          stopIdsCount: group.stopIds?.length || 0,
        })),
      })),
    });

    // Log the structure of the response (without sensitive data)
    console.log("API Response Structure:", {
      hasCode: !!data.code,
      code: data.code,
      hasText: !!data.text,
      hasData: !!data.data,
      hasEntry: !!data.data?.entry,
      hasStopGroupings: !!data.data?.entry?.stopGroupings,
      stopGroupingsLength: data.data?.entry?.stopGroupings?.length || 0,
      hasReferences: !!data.data?.entry?.references,
      hasStops: !!data.data?.entry?.references?.stops,
      referencedStopsCount: data.data?.entry?.references?.stops?.length || 0,
    });

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
      return NextResponse.json(
        { error: "Missing entry in API response" },
        { status: 500 }
      );
    }

    // First, build a map of all stops from the references section
    const stopsMap: Record<string, StopReference> = {};
    if (entry.references?.stops) {
      entry.references.stops.forEach((stop) => {
        if (stop.id) {
          stopsMap[stop.id] = stop;
        }
      });
    }

    console.log(`Found ${Object.keys(stopsMap).length} stops in references`);
    if (Object.keys(stopsMap).length === 0) {
      console.warn(
        "No stops found in references section. Raw references:",
        entry.references
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

      console.log(`Found ${allStopIds.size} unique stop IDs to fetch`);

      // Fetch stop details in parallel
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
          }
        } catch (err) {
          console.warn(`Error fetching stop ${stopId}:`, err);
        }
        return null;
      });

      // Wait for all stop details to be fetched
      await Promise.all(stopPromises);
      console.log(
        `Successfully fetched ${Object.keys(stopsMap).length} stop details`
      );
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

    // Process each stop grouping
    for (const grouping of stopGroupings) {
      if (grouping.stopGroups) {
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
            console.log(
              `Processing direction: ${directionName} (${directionId})`
            );

            // Process stops for this direction
            if (group.stopIds) {
              const stopIds = Array.isArray(group.stopIds)
                ? group.stopIds
                : [group.stopIds];

              console.log(
                `Found ${stopIds.length} stop IDs for direction ${directionName}`
              );

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
                    `Stop ${stopId} not found in stopsMap for direction ${directionName}`
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

    console.log(`Processed ${stopsArray.length} stops with directions:`, {
      directionsCount: directionsArray.length,
      directions: directionsArray.map((d) => d.name),
      stopsPerDirection: directionsArray.map((d) => ({
        direction: d.name,
        count: stopsArray.filter((s) => s.direction === d.name).length,
      })),
    });

    // Check if we have any stops
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
      return NextResponse.json(
        { error: "No stops could be extracted for this route" },
        { status: 404 }
      );
    }

    // Return the results
    return NextResponse.json({
      routeId: lineId,
      directions: directionsArray,
      stops: stopsArray,
    });
  } catch (error) {
    console.error("Error in bus-stops API route:", error);
    return NextResponse.json(
      { error: "Failed to fetch bus stops" },
      { status: 500 }
    );
  }
}
