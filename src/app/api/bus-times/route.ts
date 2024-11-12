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
  AimedArrivalTime: string;
}

interface MonitoredVehicleJourney {
  VehicleRef: string;
  MonitoredCall: MonitoredCall;
  DestinationName: string[];
  ProgressStatus?: string[];
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

    const originStopVisits = originData?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
    const destinationStopVisits = destinationData?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];

    console.log('Buses found - Origin:', originStopVisits.length, 'Destination:', destinationStopVisits.length);

    // Create a map of vehicle refs to destination arrival times
    const destinationArrivals = new Map(
      destinationStopVisits.map((visit: MonitoredStopVisit) => [
        visit.MonitoredVehicleJourney.VehicleRef,
        visit.MonitoredVehicleJourney.MonitoredCall.ExpectedArrivalTime
      ])
    );

    // Log each bus being processed
    originStopVisits.forEach((visit: MonitoredStopVisit) => {
      console.log('Processing bus:', {
        vehicleRef: visit.MonitoredVehicleJourney.VehicleRef,
        originArrival: visit.MonitoredVehicleJourney.MonitoredCall.ExpectedArrivalTime,
        hasDestinationTime: destinationArrivals.has(visit.MonitoredVehicleJourney.VehicleRef)
      });
    });

    const formattedResponse = {
      originName: 'Gates / Bedford',
      destinationName: 'Joralemon / Court',
      buses: originStopVisits
        .filter((visit: MonitoredStopVisit) => 
          !visit.MonitoredVehicleJourney.ProgressStatus)
        .map((visit: MonitoredStopVisit) => ({
          originArrival: visit.MonitoredVehicleJourney.MonitoredCall.ExpectedArrivalTime || 
                        visit.MonitoredVehicleJourney.MonitoredCall.AimedArrivalTime,
          originStopsAway: visit.MonitoredVehicleJourney.MonitoredCall.NumberOfStopsAway,
          destination: visit.MonitoredVehicleJourney.DestinationName[0],
          proximity: visit.MonitoredVehicleJourney.MonitoredCall.ArrivalProximityText,
          vehicleRef: visit.MonitoredVehicleJourney.VehicleRef,
          destinationArrival: destinationArrivals.get(visit.MonitoredVehicleJourney.VehicleRef) || null
        }))
    };

    console.log('Final bus count:', formattedResponse.buses.length);
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
