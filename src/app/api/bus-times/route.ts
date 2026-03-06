// src/app/api/bus-times/route.ts
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { validateBusLineId, validateStopId, ValidationError, isRateLimited, getClientId } from '@/lib/validation';
import { fetchStopInfo } from '@/lib/mta-api';
import { parseSiriResponse, SiriResponse } from '@/lib/siri-parser';
import { BusData, ApiResponse } from '@/types';

// Rate limiting storage
const requestMap = new Map<string, number[]>();

// Route Segment Config for Next.js caching
// For real-time data, we use a shorter cache time or force-dynamic
export const dynamic = "force-dynamic"; // Force dynamic to ensure fresh data each time
export const revalidate = 0; // No revalidation for real-time data

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const clientId = getClientId(request);
    if (isRateLimited(requestMap, clientId, 120)) { // Higher limit for real-time data
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // Input validation
    const searchParams = request.nextUrl.searchParams;
    const rawBusLine = searchParams.get("busLine");
    const rawOriginId = searchParams.get("originId");
    const rawDestinationId = searchParams.get("destinationId");

    let busLine: string, originId: string, destinationId: string;
    try {
      busLine = validateBusLineId(rawBusLine);
      originId = validateStopId(rawOriginId);
      destinationId = validateStopId(rawDestinationId);
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 400 }
        );
      }
      throw error;
    }

    // Fetch stop info (cached in mta-api.ts for 30 min)
    const [originStopInfo, destinationStopInfo] = await Promise.all([
      fetchStopInfo(originId),
      fetchStopInfo(destinationId)
    ]);

    const originName = originStopInfo?.name || "Unknown Origin";
    const destinationName = destinationStopInfo?.name || "Unknown Destination";

    // Validate API key exists
    const apiKey = process.env.MTA_API_KEY;
    if (!apiKey) {
      console.error('MTA_API_KEY environment variable is not set');
      return NextResponse.json(
        { success: false, error: 'Service temporarily unavailable' },
        { status: 503 }
      );
    }

    // Use the MTA Bus Time API to get real-time arrivals
    const url = `https://bustime.mta.info/api/siri/stop-monitoring.json?key=${apiKey}&version=2&OperatorRef=MTA&MonitoringRef=${encodeURIComponent(
      originId
    )}&LineRef=${encodeURIComponent(
      busLine
    )}&StopMonitoringDetailLevel=calls`;

    const response = await fetch(url, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(
        `API response error: ${response.status} ${response.statusText}`
      );
      return NextResponse.json(
        { error: "Failed to fetch bus times" },
        { status: 500 }
      );
    }

    const data = (await response.json()) as SiriResponse;
    const { buses } = parseSiriResponse(data, busLine, destinationId);

    const busData: BusData = {
      originName,
      destinationName,
      buses,
      hasError: false,
    };

    const apiResponse: ApiResponse<BusData> = {
      success: true,
      data: busData
    };

    return NextResponse.json(apiResponse);
  } catch (error) {
    console.error("Error fetching bus times:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      url: request.url,
      timestamp: new Date().toISOString()
    });

    const errorResponse: ApiResponse<BusData> = {
      success: false,
      error: "Failed to fetch bus times"
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
