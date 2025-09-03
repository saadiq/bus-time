import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { validateCoordinates, ValidationError, isRateLimited, getClientId } from '@/lib/validation';
import { NearbyBusLine, ApiResponse } from '@/types';

interface MTARoute {
  id: string;
  shortName: string;
  longName: string;
  description: string;
  agencyId: string;
}

// Rate limiting storage
const requestMap = new Map<string, number[]>();

// Function to calculate distance between two points using the Haversine formula
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const clientId = getClientId(request);
    if (isRateLimited(requestMap, clientId, 30)) { // Lower limit for geolocation
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // Input validation
    const { searchParams } = new URL(request.url);
    const rawLat = searchParams.get("lat");
    const rawLon = searchParams.get("lon");

    let coordinates;
    try {
      coordinates = validateCoordinates(rawLat, rawLon);
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 400 }
        );
      }
      throw error;
    }

    const { lat, lon } = coordinates;

    // Validate API key exists
    const apiKey = process.env.MTA_API_KEY;
    if (!apiKey) {
      console.error('MTA_API_KEY environment variable is not set');
      return NextResponse.json(
        { success: false, error: 'Service temporarily unavailable' },
        { status: 503 }
      );
    }

    // First, get all bus stops within 500 meters of the location
    const stopsResponse = await fetch(
      `https://bustime.mta.info/api/where/stops-for-location.json?lat=${lat}&lon=${lon}&radius=500&key=${apiKey}`,
      {
        headers: {
          "Cache-Control": "no-cache",
        },
      }
    );

    if (!stopsResponse.ok) {
      throw new Error("Failed to fetch nearby stops");
    }

    const stopsData = await stopsResponse.json();

    // Get unique routes and their details from the stops data
    const routeMap = new Map<string, MTARoute>();
    const stopsByRoute = new Map<
      string,
      Array<{ name: string; distance: number }>
    >();

    // Process stops and collect route information
    const stops = stopsData?.data?.stops || [];
    for (const stop of stops) {
      const distance = calculateDistance(lat, lon, stop.lat, stop.lon);

      if (stop.routes) {
        for (const route of stop.routes) {
          // Store route details
          if (!routeMap.has(route.id)) {
            routeMap.set(route.id, {
              id: route.id,
              shortName: route.shortName,
              longName: route.longName,
              description: route.description,
              agencyId: route.agency?.id || "",
            });
          }

          // Store stop information for this route
          if (!stopsByRoute.has(route.id)) {
            stopsByRoute.set(route.id, []);
          }
          stopsByRoute.get(route.id)?.push({
            name: stop.name,
            distance: distance,
          });
        }
      }
    }

    // Convert routes to array with distance information
    const routes: NearbyBusLine[] = [];
    for (const [routeId, route] of routeMap) {
      const stops = stopsByRoute.get(routeId) || [];
      if (stops.length > 0) {
        // Find the closest stop for this route
        const closestStop = stops.reduce((min, curr) =>
          curr.distance < min.distance ? curr : min
        );

        routes.push({
          ...route,
          distance: closestStop.distance,
          closestStop: {
            name: closestStop.name,
            distance: closestStop.distance,
          },
        });
      }
    }

    // Sort by distance and return the 5 closest
    const nearbyRoutes = routes
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);

    if (nearbyRoutes.length === 0) {
    }

    const apiResponse: ApiResponse<{ busLines: NearbyBusLine[] }> = {
      success: true,
      data: { busLines: nearbyRoutes }
    };

    return NextResponse.json(apiResponse);
  } catch (error) {
    console.error("Error fetching nearby bus lines:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      url: request.url,
      timestamp: new Date().toISOString()
    });
    
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: "Failed to fetch nearby bus lines"
    };
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
