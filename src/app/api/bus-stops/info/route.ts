import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

// Route Segment Config for Next.js caching
export const revalidate = 1800; // 30 minutes in seconds

interface _StopInfo {
  id: string;
  code?: string;
  name?: string;
  lat?: number;
  lon?: number;
  [key: string]: unknown;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const stopId = searchParams.get("stopId");

    if (!stopId) {
      return NextResponse.json(
        { error: "Stop ID is required" },
        { status: 400 }
      );
    }

    // Use the OneBusAway API to get stop information
    const apiKey = process.env.MTA_API_KEY || "";
    const url = `https://bustime.mta.info/api/where/stop/${encodeURIComponent(
      stopId
    )}.json?key=${apiKey}`;

    const response = await fetch(url, {
      cache: "no-store", // Ensures the fetch is fresh when revalidation occurs
    });

    if (!response.ok) {
      const _errorText = await response.text();
      return NextResponse.json(
        { error: `Failed to fetch stop: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Check for error in the API response
    if (data.code && data.code !== 200) {
      return NextResponse.json(
        { error: `API Error: ${data.text || "Unknown API error"}` },
        { status: 500 }
      );
    }

    // Extract stop data
    if (!data.data) {
      return NextResponse.json(
        { error: "Missing data in API response" },
        { status: 500 }
      );
    }

    return NextResponse.json(data.data);
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to fetch stop info" },
      { status: 500 }
    );
  }
}
