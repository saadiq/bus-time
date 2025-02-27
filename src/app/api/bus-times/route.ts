// src/app/api/bus-times/route.ts
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

const MTA_API_BASE = 'https://bustime.mta.info/api/siri/stop-monitoring.json';
const DEFAULT_ORIGIN_STOP_ID = 'MTA_304213'; // Gates-Bedford
const DEFAULT_DESTINATION_STOP_ID = 'MTA_302434'; // Joralemon-Court
const DEFAULT_LINE_REF = 'MTA NYCT_B52';

// Stop name mappings
const STOP_NAMES: Record<string, string> = {
  'MTA_304213': 'Gates-Bedford',
  'MTA_302434': 'Joralemon-Court',
  // Add more stop names as needed
};

// Parse stop name from ID (fallback when not in STOP_NAMES)
function parseStopNameFromId(stopId: string): string {
  if (STOP_NAMES[stopId]) return STOP_NAMES[stopId];
  
  const code = stopId.replace('MTA_', '');
  
  // Extract borough information from stop ID pattern
  if (code.startsWith('3')) {
    return `Brooklyn Stop #${code.substring(1)}`;
  } else if (code.startsWith('4')) {
    return `Bronx Stop #${code.substring(1)}`;
  } else if (code.startsWith('5')) {
    return `Queens Stop #${code.substring(1)}`;
  } else if (code.startsWith('6')) {
    return `Staten Island Stop #${code.substring(1)}`;
  } else if (code.startsWith('30')) {
    return `Manhattan Stop #${code.substring(2)}`;
  } else {
    return `Stop #${code}`;
  }
}

// Simple validation function
const isValidStopId = (stopId: string): boolean => {
  return stopId.startsWith('MTA_');
};

const isValidLineRef = (lineRef: string): boolean => {
  return lineRef.includes('MTA');
};

interface MonitoredCall {
  ExpectedArrivalTime: string;
  NumberOfStopsAway?: number;
  ArrivalProximityText?: string;
  AimedArrivalTime: string;
  Extensions?: {
    Distances?: {
      PresentableDistance?: string;
      DistanceFromCall?: number;
      StopsFromCall?: number;
      CallDistanceAlongRoute?: number;
    };
  };
}

interface MonitoredVehicleJourney {
  VehicleRef: string;
  MonitoredCall: MonitoredCall;
  DestinationName: string[];
  ProgressStatus?: string[];
  LineRef?: string;
  PublishedLineName?: string[];
  OnwardCalls?: {
    OnwardCall: Array<{
      StopPointRef: string;
      ExpectedArrivalTime: string;
    }>;
  };
}

interface MonitoredStopVisit {
  MonitoredVehicleJourney: MonitoredVehicleJourney;
}

interface StopMonitoringDelivery {
  MonitoredStopVisit: MonitoredStopVisit[];
}

interface ServiceDelivery {
  StopMonitoringDelivery: StopMonitoringDelivery[];
}

interface SiriResponse {
  Siri: {
    ServiceDelivery: ServiceDelivery;
  };
}

// Route Segment Config for Next.js caching
// For real-time data, we use a shorter cache time or force-dynamic
export const dynamic = 'force-dynamic'; // Force dynamic to ensure fresh data each time
export const revalidate = 0; // No revalidation for real-time data

interface BusResponse {
  vehicleRef: string;
  originArrival: string | null;
  originStopsAway: number;
  destinationArrival: string | null;
  proximity: string;
  destination: string;
}

// Estimate travel time between stops (in minutes)
// This is a fallback when the API doesn't provide destination times
const estimateTripDuration = (originId: string, destinationId: string): number => {
  // We could implement a more sophisticated mapping of origin->destination to trip duration
  // For now, using a simple default value of 15 minutes
  return 15;
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const busLine = searchParams.get('busLine');
    const originId = searchParams.get('originId');
    const destinationId = searchParams.get('destinationId');
    
    if (!busLine || !originId || !destinationId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }
    
    console.log(`Fetching bus times for line: ${busLine}, origin: ${originId}, destination: ${destinationId}`);
    
    // Fetch origin stop info
    const originResponse = await fetch(`${request.nextUrl.origin}/api/bus-stops/info?stopId=${encodeURIComponent(originId)}`, {
      cache: 'no-store'
    });
    
    if (!originResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch origin stop info' },
        { status: 500 }
      );
    }
    
    const originData = await originResponse.json();
    const originName = originData.name || 'Unknown Origin';
    
    // Fetch destination stop info
    const destinationResponse = await fetch(`${request.nextUrl.origin}/api/bus-stops/info?stopId=${encodeURIComponent(destinationId)}`, {
      cache: 'no-store'
    });
    
    if (!destinationResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch destination stop info' },
        { status: 500 }
      );
    }
    
    const destinationData = await destinationResponse.json();
    const destinationName = destinationData.name || 'Unknown Destination';
    
    // Use the MTA Bus Time API to get real-time arrivals
    const apiKey = process.env.MTA_API_KEY || '';
    const url = `https://bustime.mta.info/api/siri/stop-monitoring.json?key=${apiKey}&OperatorRef=MTA&MonitoringRef=${encodeURIComponent(originId)}&LineRef=${encodeURIComponent(busLine)}`;
    
    console.log('Calling MTA API:', url.replace(apiKey, '[API_KEY]'));
    
    const response = await fetch(url, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      cache: 'no-store' // Never cache real-time data
    });
    
    if (!response.ok) {
      console.error(`API response error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: 'Failed to fetch bus times' },
        { status: 500 }
      );
    }
    
    const data = await response.json() as SiriResponse;
    
    // Log the structure of the response
    console.log('API response structure:', {
      hasSiri: !!data.Siri,
      hasServiceDelivery: !!(data.Siri && data.Siri.ServiceDelivery),
      hasStopMonitoring: !!(data.Siri && data.Siri.ServiceDelivery && data.Siri.ServiceDelivery.StopMonitoringDelivery),
      monitoringDeliveryLength: data.Siri?.ServiceDelivery?.StopMonitoringDelivery?.length || 0
    });
    
    // Extract bus arrivals from the response
    const deliveries = data.Siri?.ServiceDelivery?.StopMonitoringDelivery || [];
    
    if (!deliveries.length || !deliveries[0].MonitoredStopVisit) {
      return NextResponse.json({
        originName,
        destinationName,
        buses: [],
        hasError: false
      });
    }
    
    const visits = deliveries[0].MonitoredStopVisit;
    console.log(`Found ${visits.length} total bus visits, filtering for line ${busLine}`);
    
    // Filter buses by line and exclude those with ProgressStatus
    const filteredVisits = visits.filter(visit => {
      // Only include buses for our route
      const correctRoute = visit.MonitoredVehicleJourney.LineRef === busLine;
      
      // Exclude buses with ProgressStatus (typically indicates a bus that's not in service)
      const inService = !visit.MonitoredVehicleJourney.ProgressStatus;
      
      return correctRoute && inService;
    });
    
    console.log(`After filtering, found ${filteredVisits.length} valid buses`);
    
    // Sample the first bus to help debug
    if (filteredVisits.length > 0) {
      const sampleBus = filteredVisits[0].MonitoredVehicleJourney;
      console.log('Sample bus data:', {
        vehicleRef: sampleBus.VehicleRef,
        lineRef: sampleBus.LineRef,
        destinationName: sampleBus.DestinationName,
        hasMonitoredCall: !!sampleBus.MonitoredCall,
        monitoredCall: sampleBus.MonitoredCall,
        stopsAway: sampleBus.MonitoredCall?.NumberOfStopsAway,
        stopsAwayType: sampleBus.MonitoredCall?.NumberOfStopsAway !== undefined ? 
          typeof sampleBus.MonitoredCall.NumberOfStopsAway : 'undefined',
        // Log Extensions.Distances to see if stops away is there
        extensions: sampleBus.MonitoredCall?.Extensions,
        distances: sampleBus.MonitoredCall?.Extensions?.Distances,
        stopsFromCall: sampleBus.MonitoredCall?.Extensions?.Distances?.StopsFromCall,
        distanceFromCall: sampleBus.MonitoredCall?.Extensions?.Distances?.DistanceFromCall,
        presentableDistance: sampleBus.MonitoredCall?.Extensions?.Distances?.PresentableDistance,
        monitoredCallFields: sampleBus.MonitoredCall ? Object.keys(sampleBus.MonitoredCall) : [],
        monitoredCallStructure: JSON.stringify(sampleBus.MonitoredCall).substring(0, 200)
      });
    }
    
    // Process each bus arrival
    const buses: BusResponse[] = filteredVisits.map((visit) => {
      const journey = visit.MonitoredVehicleJourney;
      const vehicleRef = journey.VehicleRef;
      const originArrival = journey.MonitoredCall?.ExpectedArrivalTime;
      
      // Validate origin arrival time format
      let formattedOriginArrival: string | null = null;
      let originArrivalDate: Date | null = null;
      
      try {
        if (originArrival) {
          // Parse and reformat the date to ensure consistent format
          originArrivalDate = new Date(originArrival);
          if (!isNaN(originArrivalDate.getTime())) {
            formattedOriginArrival = originArrivalDate.toISOString();
            console.log(`Bus ${vehicleRef} origin arrival time: ${formattedOriginArrival}`);
          } else {
            console.warn(`Invalid origin arrival time format for bus ${vehicleRef}: ${originArrival}`);
          }
        }
      } catch (e) {
        console.error(`Error parsing origin arrival time for bus ${vehicleRef}:`, e);
      }
      
      // Get stops away information - look in multiple places
      let originStopsAway: number = 0; // Default to 0
      
      // First check NumberOfStopsAway direct field
      if (journey.MonitoredCall?.NumberOfStopsAway !== undefined) {
        try {
          if (typeof journey.MonitoredCall.NumberOfStopsAway === 'number') {
            originStopsAway = journey.MonitoredCall.NumberOfStopsAway;
            console.log(`Bus ${vehicleRef} has NumberOfStopsAway as number: ${originStopsAway}`);
          } else {
            originStopsAway = parseInt(journey.MonitoredCall.NumberOfStopsAway as any, 10);
            console.log(`Bus ${vehicleRef} has NumberOfStopsAway parsed from non-number: ${originStopsAway}`);
          }
        } catch (e) {
          console.warn(`Failed to parse NumberOfStopsAway for bus ${vehicleRef}`, e);
        }
      } 
      // Then check Extensions.Distances.StopsFromCall field
      else if (journey.MonitoredCall?.Extensions?.Distances?.StopsFromCall !== undefined) {
        try {
          if (typeof journey.MonitoredCall.Extensions.Distances.StopsFromCall === 'number') {
            originStopsAway = journey.MonitoredCall.Extensions.Distances.StopsFromCall;
            console.log(`Bus ${vehicleRef} has StopsFromCall as number: ${originStopsAway}`);
          } else {
            originStopsAway = parseInt(journey.MonitoredCall.Extensions.Distances.StopsFromCall as any, 10);
            console.log(`Bus ${vehicleRef} has StopsFromCall parsed from non-number: ${originStopsAway}`);
          }
        } catch (e) {
          console.warn(`Failed to parse StopsFromCall for bus ${vehicleRef}`, e);
        }
      }
      // Try to extract from PresentableDistance (e.g. "2 stops away")
      else if (journey.MonitoredCall?.Extensions?.Distances?.PresentableDistance) {
        const presentable = journey.MonitoredCall.Extensions.Distances.PresentableDistance;
        console.log(`Bus ${vehicleRef} has PresentableDistance: ${presentable}`);
        
        // Try to extract a number from the presentable distance (e.g. "2 stops away")
        const match = presentable.match(/^(\d+)/);
        if (match && match[1]) {
          originStopsAway = parseInt(match[1], 10);
          console.log(`Bus ${vehicleRef} extracted stops away from PresentableDistance: ${originStopsAway}`);
        } else if (presentable.toLowerCase().includes('at stop')) {
          originStopsAway = 0;
          console.log(`Bus ${vehicleRef} is at stop based on PresentableDistance`);
        }
      }
      
      console.log(`Bus ${vehicleRef} final originStopsAway: ${originStopsAway}`);
      
      const destination = Array.isArray(journey.DestinationName) 
        ? journey.DestinationName[0] || 'Unknown'
        : journey.DestinationName || 'Unknown';
      
      // DEBUG: Log OnwardCalls information
      if (journey.OnwardCalls?.OnwardCall) {
        console.log(`Bus ${vehicleRef} has ${journey.OnwardCalls.OnwardCall.length} onward calls`);
        journey.OnwardCalls.OnwardCall.forEach((call, index) => {
          console.log(`  Onward call ${index}: Stop ${call.StopPointRef}, Time: ${call.ExpectedArrivalTime}`);
        });
      } else {
        console.log(`Bus ${vehicleRef} has no onward calls data`);
      }
      
      // Calculate destination arrival time (if available)
      let destinationArrival: string | null = null;
      let destinationFound = false;
      
      if (journey.OnwardCalls?.OnwardCall) {
        const destinationCall = journey.OnwardCalls.OnwardCall.find(
          (call) => call.StopPointRef === destinationId
        );
        
        if (destinationCall && destinationCall.ExpectedArrivalTime) {
          try {
            // Parse and reformat the date for consistency
            const destArrivalDate = new Date(destinationCall.ExpectedArrivalTime);
            if (!isNaN(destArrivalDate.getTime())) {
              destinationArrival = destArrivalDate.toISOString();
              destinationFound = true;
              console.log(`Bus ${vehicleRef} destination arrival time: ${destinationArrival} (from OnwardCalls)`);
            } else {
              console.warn(`Invalid destination arrival time format: ${destinationCall.ExpectedArrivalTime}`);
            }
          } catch (e) {
            console.error('Error parsing destination arrival time:', e);
          }
        } else {
          console.log(`Bus ${vehicleRef} has onward calls but none for the destination stop ${destinationId}`);
        }
      }
      
      // If we don't have destination arrival time but we have origin arrival time,
      // estimate the destination arrival time
      if (!destinationArrival && originArrivalDate && !isNaN(originArrivalDate.getTime())) {
        // We need to estimate the destination arrival
        // Get an estimated trip duration in minutes
        const tripDurationMinutes = estimateTripDuration(originId, destinationId);
        
        // Calculate the estimated arrival time at the destination
        const estimatedDestinationDate = new Date(originArrivalDate.getTime() + tripDurationMinutes * 60000);
        destinationArrival = estimatedDestinationDate.toISOString();
        console.log(`Bus ${vehicleRef} using estimated destination arrival time: ${destinationArrival} (${tripDurationMinutes} mins from origin)`);
      }
      
      // Determine proximity description
      let proximity = 'approaching';
      if (originStopsAway === 0) {
        proximity = 'at stop';
      } else if (originStopsAway === 1) {
        proximity = '1 stop away';
      } else if (originStopsAway > 1) {
        proximity = `${originStopsAway} stops away`;
      } else {
        proximity = 'en route';
      }
      
      return {
        vehicleRef,
        originArrival: formattedOriginArrival || null,
        originStopsAway,
        destinationArrival,
        proximity,
        destination
      };
    });
    
    // Log the final processed buses
    console.log('Final processed buses:', buses.map(bus => ({
      vehicleRef: bus.vehicleRef,
      originStopsAway: bus.originStopsAway,
      proximity: bus.proximity,
      destinationArrival: bus.destinationArrival ? 'available' : 'not available'
    })));
    
    return NextResponse.json({
      originName,
      destinationName,
      buses,
      hasError: false
    });
  } catch (error) {
    console.error('Error fetching bus times:', error);
    return NextResponse.json(
      { 
        hasError: true,
        errorMessage: 'Failed to fetch bus times',
        buses: []
      },
      { status: 500 }
    );
  }
}
