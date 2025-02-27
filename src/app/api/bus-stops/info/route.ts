import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

// Route Segment Config for Next.js caching
export const revalidate = 1800; // 30 minutes in seconds

interface StopInfo {
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
    const stopId = searchParams.get('stopId');
    
    if (!stopId) {
      return NextResponse.json(
        { error: 'Stop ID is required' },
        { status: 400 }
      );
    }
    
    console.log(`Fetching info for stop: ${stopId}`);
    
    // Use the OneBusAway API to get stop information
    const apiKey = process.env.MTA_API_KEY || '';
    const url = `https://bustime.mta.info/api/where/stop/${encodeURIComponent(stopId)}.json?key=${apiKey}`;
    
    console.log(`Making request to: ${url}`);
    
    const response = await fetch(url, {
      cache: 'no-store' // Ensures the fetch is fresh when revalidation occurs
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error (${response.status}): ${errorText}`);
      return NextResponse.json(
        { error: `Failed to fetch stop: ${response.status}` },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    
    // Check for error in the API response
    if (data.code && data.code !== 200) {
      console.error(`API returned error code: ${data.code}, text: ${data.text || 'No error text'}`);
      return NextResponse.json(
        { error: `API Error: ${data.text || 'Unknown API error'}` },
        { status: 500 }
      );
    }
    
    // Extract stop data
    if (!data.data) {
      console.error('Missing data in stop API response');
      return NextResponse.json(
        { error: 'Missing data in API response' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(data.data);
  } catch (error) {
    console.error('Error fetching stop info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stop info' },
      { status: 500 }
    );
  }
} 