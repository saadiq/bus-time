import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { validateBusLineId, ValidationError, isRateLimited, getClientId } from '@/lib/validation';
import { ApiResponse } from '@/types';
import {
  MTAApiResponse,
  buildStopsMap,
  fetchMissingStops,
  processStopGroupings,
} from '@/lib/stop-processing';

// Route Segment Config for Next.js caching
export const revalidate = 1800; // 30 minutes in seconds

// Rate limiting storage
const requestMap = new Map<string, number[]>();

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
      headers: { "Cache-Control": "no-cache" },
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
      console.error("Missing entry in API response");
      return NextResponse.json(
        { error: "Missing entry in API response" },
        { status: 500 }
      );
    }

    const stopGroupings = entry.stopGroupings;
    if (!stopGroupings || stopGroupings.length === 0) {
      return NextResponse.json(
        { error: "Missing stopGroupings in API response" },
        { status: 500 }
      );
    }

    // Build stops map from references, or fetch individually if missing
    const stopsMap = buildStopsMap(data);
    if (Object.keys(stopsMap).length === 0) {
      console.warn("No stops in references section, fetching individually.");
      await fetchMissingStops(stopGroupings, apiKey, stopsMap);
    }

    // Process stop groupings into directions and stops
    const { directions, stops } = processStopGroupings(stopGroupings, stopsMap);

    if (stops.length === 0) {
      const errorResponse: ApiResponse<never> = {
        success: false,
        error: "No stops could be extracted for this route"
      };
      return NextResponse.json(errorResponse, { status: 404 });
    }

    // Return the results
    return NextResponse.json({
      success: true,
      data: {
        routeId: lineId,
        directions,
        stops,
      }
    });
  } catch (error) {
    console.error("Error in bus-stops API route:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      url: request.url,
      timestamp: new Date().toISOString()
    });

    const errorResponse: ApiResponse<never> = {
      success: false,
      error: "Failed to fetch bus stops"
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
