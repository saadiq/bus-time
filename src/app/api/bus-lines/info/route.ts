import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { validateBusLineId, ValidationError, isRateLimited, getClientId } from '@/lib/validation';
import { BusLine, ApiRoute, ApiResponse } from '@/types';

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

    // Find the requested bus line
    const busLine = routes.find((route: ApiRoute) => route.id === lineId);

    if (!busLine) {
      const errorResponse: ApiResponse<never> = {
        success: false,
        error: "Bus line not found"
      };
      return NextResponse.json(errorResponse, { status: 404 });
    }

    // Return the bus line details
    const busLineData: BusLine = {
      id: busLine.id,
      shortName: busLine.shortName,
      longName: busLine.longName,
      description: busLine.description,
      agencyId: busLine.agencyId,
    };
    
    const apiResponse: ApiResponse<{ busLine: BusLine }> = {
      success: true,
      data: { busLine: busLineData }
    };
    
    return NextResponse.json(apiResponse);
  } catch (error) {
    console.error("Error in bus-lines/info API route:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      url: request.url,
      timestamp: new Date().toISOString()
    });
    
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: "Failed to fetch bus line info"
    };
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
