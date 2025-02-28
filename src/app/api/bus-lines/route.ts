import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

// Route Segment Config for Next.js caching
export const revalidate = 1800; // 30 minutes in seconds
export const dynamic = "force-dynamic";

interface BusLine {
  id: string;
  shortName: string;
  longName: string;
  description: string;
  agencyId: string;
}

interface ApiRoute {
  id: string;
  shortName: string;
  longName: string;
  description: string;
  agencyId: string;
  [key: string]: unknown;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q")?.toLowerCase() || "";

    // Use the OneBusAway API to get all bus routes
    const apiKey = process.env.MTA_API_KEY || "";
    const url = `https://bustime.mta.info/api/where/routes-for-agency/MTA%20NYCT.json?key=${apiKey}`;

    const response = await fetch(url, {
      cache: "no-store", // Ensures the fetch is fresh when revalidation occurs
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch bus lines: ${response.status}`);
    }

    const data = await response.json();

    // Extract routes from the response
    const routes = data.data?.list || [];

    // Map to a simpler format and filter by query if provided
    const busLines: BusLine[] = routes
      .map((route: ApiRoute) => ({
        id: route.id,
        shortName: route.shortName,
        longName: route.longName,
        description: route.description,
        agencyId: route.agencyId,
      }))
      .filter((line: BusLine) => {
        if (!query) return true;
        return (
          line.shortName.toLowerCase().includes(query) ||
          line.longName.toLowerCase().includes(query) ||
          line.description.toLowerCase().includes(query)
        );
      })
      .sort((a: BusLine, b: BusLine) => a.shortName.localeCompare(b.shortName));

    return NextResponse.json({ busLines });
  } catch (error) {
    console.error("Error fetching bus lines:", error);
    return NextResponse.json(
      { error: "Failed to fetch bus lines" },
      { status: 500 }
    );
  }
}
