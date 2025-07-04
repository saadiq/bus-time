import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { validateStopId, ValidationError, isRateLimited, getClientId } from '@/lib/validation';
import { StopInfo, ApiResponse } from '@/types';

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
    const rawStopId = searchParams.get("stopId");

    let stopId: string;
    try {
      stopId = validateStopId(rawStopId);
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

    // Use the OneBusAway API to get stop information
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
      const errorResponse: ApiResponse<never> = {
        success: false,
        error: `API Error: ${data.text || "Unknown API error"}`
      };
      return NextResponse.json(errorResponse, { status: 500 });
    }

    // Extract stop data
    if (!data.data) {
      const errorResponse: ApiResponse<never> = {
        success: false,
        error: "Missing data in API response"
      };
      return NextResponse.json(errorResponse, { status: 500 });
    }

    const apiResponse: ApiResponse<StopInfo> = {
      success: true,
      data: data.data
    };
    
    return NextResponse.json(apiResponse);
  } catch (error) {
    console.error("Error in bus-stops/info API route:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      url: request.url,
      timestamp: new Date().toISOString()
    });
    
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: "Failed to fetch stop info"
    };
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
