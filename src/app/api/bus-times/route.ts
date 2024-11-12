// src/app/api/bus-times/route.ts
import { NextResponse } from 'next/server';

const MTA_API_BASE = 'https://bustime.mta.info/api/siri/stop-monitoring.json';
const ORIGIN_STOP_ID = 'MTA_304213'; // Gates-Bedford
const DESTINATION_STOP_ID = 'MTA_302434'; // Jorelmon-Court
const LINE_REF = 'MTA NYCT_B52';

interface MonitoredCall {
  ExpectedArrivalTime: string;
  NumberOfStopsAway: number;
  ArrivalProximityText: string;
}

interface MonitoredVehicleJourney {
  VehicleRef: string;
  MonitoredCall: MonitoredCall;
  DestinationName: string[];
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

interface FormattedBus {
  originArrival: string;
  originStopsAway: number;
  destinationArrival: string | null;
  destination: string;
  proximity: string;
  vehicleRef: string;
}

export async function GET() {
  try {
    console.log('Starting bus times fetch...');
    
    // Add additional required parameters
    const params = new URLSearchParams({
      key: process.env.MTA_API_KEY || '',
      version: '2',
      OperatorRef: 'MTA',
      MaximumStopVisits: '5',
      MinimumStopVisitsPerLine: '1'
    });

    // Construct URLs with all parameters
    const originUrl = `${MTA_API_BASE}?${params}&MonitoringRef=${ORIGIN_STOP_ID}&LineRef=${LINE_REF}`;
    const destinationUrl = `${MTA_API_BASE}?${params}&MonitoringRef=${DESTINATION_STOP_ID}&LineRef=${LINE_REF}`;
    
    console.log('Origin URL:', originUrl);
    console.log('Destination URL:', destinationUrl);
    
    // Fetch data for both stops in parallel
    const [originResponse, destinationResponse] = await Promise.all([
      fetch(originUrl),
      fetch(destinationUrl)
    ]);

    if (!originResponse.ok || !destinationResponse.ok) {
      throw new Error(`Failed to fetch bus data - Origin: ${originResponse.status}, Destination: ${destinationResponse.status}`);
    }

    const originData = await originResponse.json() as SiriResponse;
    const destinationData = await destinationResponse.json() as SiriResponse;

    // Extract MonitoredStopVisit arrays (or empty arrays if not present)
    const response = {
      origin: originData?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [],
      destination: destinationData?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || []
    };

    // Log the number of buses found for debugging
    console.log('Buses found:', {
      origin: response.origin.length,
      destination: response.destination.length
    });

    // Extract vehicle journeys and match them by vehicle ID
    const formattedResponse = {
      originName: 'Gates / Bedford',
      destinationName: 'Joralemon / Court',
      buses: response.origin.map((visit: MonitoredStopVisit) => {
        const vehicleRef = visit.MonitoredVehicleJourney.VehicleRef;
        const destinationVisit = response.destination.find((destVisit: MonitoredStopVisit) => 
          destVisit.MonitoredVehicleJourney.VehicleRef === vehicleRef
        );

        return {
          originArrival: visit.MonitoredVehicleJourney.MonitoredCall.ExpectedArrivalTime,
          originStopsAway: visit.MonitoredVehicleJourney.MonitoredCall.NumberOfStopsAway,
          destinationArrival: destinationVisit?.MonitoredVehicleJourney.MonitoredCall.ExpectedArrivalTime || null,
          destination: visit.MonitoredVehicleJourney.DestinationName[0],
          proximity: visit.MonitoredVehicleJourney.MonitoredCall.ArrivalProximityText,
          vehicleRef
        };
      }).filter((bus: FormattedBus) => bus.destinationArrival) // Only include buses with both arrival times
    };

    console.log('Successfully processed bus times data');
    return NextResponse.json(formattedResponse);
  } catch (error) {
    console.error('Error fetching bus data:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { error: 'Failed to fetch bus data' },
      { status: 500 }
    );
  }
}
