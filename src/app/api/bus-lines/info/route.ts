import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

// Route Segment Config for Next.js caching
export const revalidate = 1800; // 30 minutes in seconds

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
    const lineId = searchParams.get('lineId');
    
    if (!lineId) {
      return NextResponse.json(
        { error: 'Bus line ID is required' },
        { status: 400 }
      );
    }
    
    console.log(`Fetching info for bus line: ${lineId}`);
    
    // Use the OneBusAway API to get all bus routes
    const apiKey = process.env.MTA_API_KEY || '';
    const url = `https://bustime.mta.info/api/where/routes-for-agency/MTA%20NYCT.json?key=${apiKey}`;
    
    const response = await fetch(url, {
      cache: 'no-store' // Ensures the fetch is fresh when revalidation occurs
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
      return NextResponse.json(
        { error: 'Bus line not found' },
        { status: 404 }
      );
    }
    
    // Return the bus line details
    return NextResponse.json({
      busLine: {
        id: busLine.id,
        shortName: busLine.shortName,
        longName: busLine.longName,
        description: busLine.description,
        agencyId: busLine.agencyId
      }
    });
  } catch (error) {
    console.error('Error fetching bus line info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bus line info' },
      { status: 500 }
    );
  }
} 