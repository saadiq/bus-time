import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

// Route Segment Config for Next.js caching
export const revalidate = 1800; // 30 minutes in seconds

interface BusStop {
  id: string;
  code: string;
  name: string;
  direction: string;
  sequence: number;
  lat: number;
  lon: number;
}

interface StopReference {
  id: string;
  code?: string;
  name?: string;
  lat?: number;
  lon?: number;
  [key: string]: unknown;
}

interface StopGroup {
  id?: { id: string } | string;
  name?: { name: string };
  stopIds?: string[];
  [key: string]: unknown;
}

interface ApiResponse {
  code?: number;
  text?: string;
  data?: {
    entry?: {
      stopGroupings?: Array<{
        stopGroups?: StopGroup[];
      }>;
      references?: {
        stops?: StopReference[];
      };
    };
  };
}

// Store fetched individual stops in this variable during request processing
// This is not a persistent cache, just a temporary lookup map during a single request
const individualStopsFetched: Record<string, StopReference> = {};

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
    
    console.log(`Request for stops for bus line: ${lineId}`);
    
    // Use the OneBusAway API to get stops for the route
    const apiKey = process.env.MTA_API_KEY || '';
    const url = `https://bustime.mta.info/api/where/stops-for-route/${encodeURIComponent(lineId)}.json?key=${apiKey}&includePolylines=false&version=2`;
    
    console.log(`Making request to: ${url}`);
    
    const response = await fetch(url, {
      // This ensures the fetch is fresh if the revalidation period has passed
      cache: 'no-store'
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error (${response.status}): ${errorText}`);
      throw new Error(`Failed to fetch bus stops: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json() as ApiResponse;
    
    // Check for error in the API response
    if (data.code && data.code !== 200) {
      console.error(`API returned error code: ${data.code}, text: ${data.text || 'No error text'}`);
      return NextResponse.json(
        { error: `API Error: ${data.text || 'Unknown API error'}` },
        { status: 500 }
      );
    }
    
    // Process the stops data
    const entry = data.data?.entry;
    if (!entry) {
      console.error('Missing entry in API response');
      return NextResponse.json({ 
        stops: [], 
        directions: [],
        error: 'Missing data in API response' 
      });
    }
    
    // Safety check for the existence of stopGroupings
    if (!entry.stopGroupings || !entry.stopGroupings[0] || !entry.stopGroupings[0].stopGroups) {
      console.error('Missing stopGroupings in API response');
      return NextResponse.json({ 
        stops: [], 
        directions: [],
        error: 'Missing stop data in API response'
      });
    }
    
    // Extract directions and stop IDs from the API response
    const directionsArray: { id: string, name: string }[] = [];
    const stopIdsWithDirection: {id: string, direction: string, sequence: number}[] = [];
    
    // Process each direction (typically 0 and 1 for the two directions of a route)
    entry.stopGroupings[0].stopGroups.forEach((group: StopGroup, directionIndex: number) => {
      if (!group || !group.name || !group.name.name || !group.stopIds) {
        console.warn('Skipping invalid stop group in API response');
        return; // Skip this group
      }
      
      const directionName = group.name.name;
      const directionId = typeof group.id === 'object' && group.id?.id 
        ? group.id.id 
        : typeof group.id === 'string' 
          ? group.id 
          : `direction-${directionIndex}`;
      
      directionsArray.push({
        id: directionId,
        name: directionName
      });
      
      console.log(`Processing direction: ${directionName}, stopIds count: ${group.stopIds.length}`);
      
      // Collect stopIds with their direction for later lookup
      group.stopIds.forEach((stopId: string, sequence: number) => {
        stopIdsWithDirection.push({
          id: stopId,
          direction: directionName,
          sequence: sequence
        });
      });
    });
    
    console.log(`Found ${stopIdsWithDirection.length} stop IDs across ${directionsArray.length} directions`);
    
    // If we have references.stops, use them
    const stopsArray: BusStop[] = [];
    
    // Create a map of stop IDs to help with extracting stop data
    const referencedStops: Record<string, StopReference> = {};
    
    // If there are references.stops available, build a lookup map
    if (entry.references && entry.references.stops && entry.references.stops.length > 0) {
      console.log(`Found ${entry.references.stops.length} stops in references`);
      
      entry.references.stops.forEach((stop: StopReference) => {
        if (stop && stop.id) {
          referencedStops[stop.id] = stop;
          // Also store in our request-scoped lookup map
          individualStopsFetched[stop.id] = stop;
        }
      });
      
      console.log(`Built a map with ${Object.keys(referencedStops).length} referenced stops`);
    } else {
      console.log('No references.stops found in API response');
    }
    
    // Process each stop ID, and fetch any missing stop information
    const missingStopIds: string[] = [];
    
    stopIdsWithDirection.forEach(({ id: stopId, direction, sequence }) => {
      // Check if we already have this stop in our reference map
      if (referencedStops[stopId]) {
        const stopInfo = referencedStops[stopId];
        stopsArray.push({
          id: stopId,
          code: stopInfo.code || stopId.replace('MTA_', ''),
          name: stopInfo.name || 'Unknown Stop',
          direction: direction,
          sequence: sequence,
          lat: stopInfo.lat || 0,
          lon: stopInfo.lon || 0
        });
        return;
      }
      
      // Check if we already fetched this stop during this request
      if (individualStopsFetched[stopId]) {
        const stopInfo = individualStopsFetched[stopId];
        stopsArray.push({
          id: stopId,
          code: stopInfo.code || stopId.replace('MTA_', ''),
          name: stopInfo.name || 'Unknown Stop',
          direction: direction,
          sequence: sequence,
          lat: stopInfo.lat || 0,
          lon: stopInfo.lon || 0
        });
        return;
      }
      
      // If we don't have the stop info, we'll need to fetch it
      missingStopIds.push(stopId);
    });
    
    // If we have missing stops, fetch them individually
    if (missingStopIds.length > 0) {
      console.log(`Need to fetch ${missingStopIds.length} individual stops`);
      
      // Create a map to store the direction and sequence for each stop ID
      const stopDirectionMap: Record<string, {direction: string, sequence: number}> = {};
      stopIdsWithDirection.forEach(item => {
        stopDirectionMap[item.id] = { direction: item.direction, sequence: item.sequence };
      });
      
      // Fetch each missing stop, with a concurrency limit of 5
      const concurrencyLimit = 5;
      for (let i = 0; i < missingStopIds.length; i += concurrencyLimit) {
        const stopIdBatch = missingStopIds.slice(i, i + concurrencyLimit);
        
        // Create a batch of promises for parallel processing
        const fetchPromises = stopIdBatch.map(async (stopId) => {
          try {
            const stopUrl = `https://bustime.mta.info/api/where/stop/${encodeURIComponent(stopId)}.json?key=${apiKey}`;
            console.log(`Fetching individual stop: ${stopUrl}`);
            
            const stopResponse = await fetch(stopUrl, {
              cache: 'no-store'
            });
            
            if (stopResponse.ok) {
              const stopData = await stopResponse.json() as { data?: StopReference };
              
              // Check that stopData.data exists (it contains the stop information directly)
              if (stopData.data) {
                const stop = stopData.data;
                const dirInfo = stopDirectionMap[stopId];
                
                // Store this stop for future use in this request
                individualStopsFetched[stopId] = stop;
                
                if (dirInfo) {
                  stopsArray.push({
                    id: stopId,
                    code: stop.code || stopId.replace('MTA_', ''),
                    name: stop.name || 'Unknown Stop',
                    direction: dirInfo.direction,
                    sequence: dirInfo.sequence,
                    lat: stop.lat || 0,
                    lon: stop.lon || 0
                  });
                  
                  console.log(`Added stop: ${stop.name} (${stopId})`);
                }
              } else {
                console.warn(`Stop data for ${stopId} is missing the expected data structure`);
              }
            } else {
              console.warn(`Could not fetch stop ${stopId}: ${stopResponse.status}`);
            }
          } catch (error) {
            console.error(`Error fetching stop ${stopId}:`, error);
          }
        });
        
        // Wait for this batch to complete before moving to the next batch
        await Promise.all(fetchPromises);
      }
    }
    
    console.log(`Total stops extracted: ${stopsArray.length}`);
    
    // Generate a helpful list of first few stops for debugging
    if (stopsArray.length > 0) {
      console.log('First few stops:', stopsArray.slice(0, 5).map(stop => ({
        id: stop.id,
        name: stop.name,
        direction: stop.direction
      })));
    } else {
      // If we still have no stops, we should return a clear error
      console.error('No stops could be extracted for this route');
      return NextResponse.json({
        stops: [],
        directions: directionsArray,
        error: 'Could not retrieve stop information for this route'
      });
    }
    
    // Sort by direction and sequence within direction
    stopsArray.sort((a, b) => {
      if (a.direction !== b.direction) {
        return a.direction.localeCompare(b.direction);
      }
      return a.sequence - b.sequence;
    });
    
    // Return the result
    const result = {
      stops: stopsArray,
      directions: directionsArray
    };
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching bus stops:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bus stops' },
      { status: 500 }
    );
  }
} 