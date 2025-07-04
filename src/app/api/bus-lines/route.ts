import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { validateSearchQuery, sanitizeSearchQuery, ValidationError, isRateLimited, getClientId } from '@/lib/validation';
import { BusLine, ApiRoute, ApiResponse } from '@/types';

// Route Segment Config for Next.js caching
export const revalidate = 1800; // 30 minutes in seconds
export const dynamic = "force-dynamic";

// Rate limiting storage (in production, use Redis or similar)
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
    const rawQuery = searchParams.get("q");
    
    let query = '';
    if (rawQuery) {
      try {
        query = validateSearchQuery(rawQuery);
        query = sanitizeSearchQuery(query);
      } catch (error) {
        if (error instanceof ValidationError) {
          return NextResponse.json(
            { success: false, error: error.message },
            { status: 400 }
          );
        }
        throw error;
      }
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

    // Use the OneBusAway API to get all bus routes
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

    const apiResponse: ApiResponse<{ busLines: BusLine[] }> = {
      success: true,
      data: { busLines }
    };

    return NextResponse.json(apiResponse);
  } catch (error) {
    console.error("Error fetching bus lines:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      url: request.url,
      timestamp: new Date().toISOString()
    });
    
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: "Failed to fetch bus lines"
    };
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
