import { NextResponse } from "next/server";

interface MTAStop {
  id: string;
  lat: number;
  lon: number;
  name: string;
  routes: Array<{
    id: string;
    shortName: string;
    longName: string;
    description: string;
    agencyId: string;
  }>;
}

interface MTARoute {
  id: string;
  shortName: string;
  longName: string;
  description: string;
  agencyId: string;
}

interface RouteWithDistance extends MTARoute {
  distance: number;
  closestStop: {
    name: string;
    distance: number;
  } | null;
}

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get("lat") || "");
    const lon = parseFloat(searchParams.get("lon") || "");

    if (isNaN(lat) || isNaN(lon)) {
      return NextResponse.json(
        { error: "Invalid coordinates" },
        { status: 400 }
      );
    }

    // First, get all bus stops within 500 meters of the location
    const stopsResponse = await fetch(
      `http://bustime.mta.info/api/where/stops-for-location.json?lat=${lat}&lon=${lon}&radius=500&key=${process.env.MTA_API_KEY}`,
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
    const routes: RouteWithDistance[] = [];
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
      console.log("No valid routes found after processing");
    } else {
      console.log("Found nearby routes:", nearbyRoutes);
    }

    return NextResponse.json({ busLines: nearbyRoutes });
  } catch (error) {
    console.error("Error fetching nearby bus lines:", error);
    return NextResponse.json(
      { error: "Failed to fetch nearby bus lines" },
      { status: 500 }
    );
  }
}
