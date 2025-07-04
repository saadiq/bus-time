// Shared type definitions for the bus tracking application

export interface BusLine {
  id: string;
  shortName: string;
  longName: string;
  description: string;
  agencyId: string;
}

export interface BusStop {
  id: string;
  code: string;
  name: string;
  direction: string;
  sequence: number;
  lat: number;
  lon: number;
}

export interface Direction {
  id: string;
  name: string;
}

export interface BusArrival {
  vehicleId: string;
  originArrival: Date;
  stopsAway: number;
  destinationArrival: Date | null;
  destination: string;
  isEstimated: boolean;
}

export interface BusResponse {
  vehicleRef: string;
  originArrival: string | null;
  originStopsAway: number;
  destinationArrival: string | null;
  proximity: string;
  destination: string;
  isEstimated: boolean;
}

export interface BusData {
  originName: string;
  destinationName: string;
  buses: BusResponse[];
  hasError?: boolean;
  errorMessage?: string;
}

export interface NearbyBusLine extends BusLine {
  distance: number;
  closestStop: {
    name: string;
    distance: number;
  };
}

// API Response interfaces
export interface ApiRoute extends BusLine {
  [key: string]: unknown;
}

export interface StopInfo {
  id: string;
  name: string;
  lat: number;
  lon: number;
  direction: string;
  [key: string]: unknown;
}

// Error types
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

// API Request/Response types
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;