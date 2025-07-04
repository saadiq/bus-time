import { useReducer, useCallback } from 'react';
import { BusLine, BusStop, Direction, BusArrival, BusData, NearbyBusLine } from '@/types';

// State interface
export interface BusTrackerState {
  // Data state
  arrivals: BusArrival[];
  data: BusData | null;
  busLineResults: (BusLine | NearbyBusLine)[];
  stops: BusStop[];
  directions: Direction[];
  
  // Selection state
  busLineId: string;
  busLineSearch: string;
  originId: string;
  destinationId: string;
  selectedDirection: string;
  cutoffTime: string;
  enableCutoff: boolean;
  
  // UI state
  loading: boolean;
  busLineLoading: boolean;
  stopsLoading: boolean;
  geoLoading: boolean;
  isConfigOpen: boolean;
  showBusLineResults: boolean;
  
  // Error state
  error: string | null;
  busStopError: string | null;
  geoError: string | null;
  
  // Timing state
  lastRefresh: Date | null;
  nextRefreshIn: number;
  
  // Force update mechanism
  forceUpdate: number;
}

// Action types
export type BusTrackerAction =
  | { type: 'SET_ARRIVALS'; payload: BusArrival[] }
  | { type: 'SET_DATA'; payload: BusData | null }
  | { type: 'SET_BUS_LINE_RESULTS'; payload: (BusLine | NearbyBusLine)[] }
  | { type: 'SET_STOPS'; payload: BusStop[] }
  | { type: 'SET_DIRECTIONS'; payload: Direction[] }
  | { type: 'SET_BUS_LINE_ID'; payload: string }
  | { type: 'SET_BUS_LINE_SEARCH'; payload: string }
  | { type: 'SET_ORIGIN_ID'; payload: string }
  | { type: 'SET_DESTINATION_ID'; payload: string }
  | { type: 'SET_SELECTED_DIRECTION'; payload: string }
  | { type: 'SET_CUTOFF_TIME'; payload: string }
  | { type: 'SET_ENABLE_CUTOFF'; payload: boolean }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_BUS_LINE_LOADING'; payload: boolean }
  | { type: 'SET_STOPS_LOADING'; payload: boolean }
  | { type: 'SET_GEO_LOADING'; payload: boolean }
  | { type: 'SET_IS_CONFIG_OPEN'; payload: boolean }
  | { type: 'SET_SHOW_BUS_LINE_RESULTS'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_BUS_STOP_ERROR'; payload: string | null }
  | { type: 'SET_GEO_ERROR'; payload: string | null }
  | { type: 'SET_LAST_REFRESH'; payload: Date | null }
  | { type: 'SET_NEXT_REFRESH_IN'; payload: number }
  | { type: 'FORCE_UPDATE' }
  | { type: 'RESET_ALL' }
  | { type: 'BATCH_UPDATE'; payload: Partial<BusTrackerState> };

// Initial state
export const initialState: BusTrackerState = {
  arrivals: [],
  data: null,
  busLineResults: [],
  stops: [],
  directions: [],
  busLineId: '',
  busLineSearch: '',
  originId: '',
  destinationId: '',
  selectedDirection: '',
  cutoffTime: '08:00',
  enableCutoff: false,
  loading: true,
  busLineLoading: false,
  stopsLoading: false,
  geoLoading: false,
  isConfigOpen: false,
  showBusLineResults: false,
  error: null,
  busStopError: null,
  geoError: null,
  lastRefresh: null,
  nextRefreshIn: 30,
  forceUpdate: 0,
};

// Reducer function
export function busTrackerReducer(state: BusTrackerState, action: BusTrackerAction): BusTrackerState {
  switch (action.type) {
    case 'SET_ARRIVALS':
      return { ...state, arrivals: action.payload };
    
    case 'SET_DATA':
      return { ...state, data: action.payload };
    
    case 'SET_BUS_LINE_RESULTS':
      return { ...state, busLineResults: action.payload };
    
    case 'SET_STOPS':
      return { ...state, stops: action.payload };
    
    case 'SET_DIRECTIONS':
      return { ...state, directions: action.payload };
    
    case 'SET_BUS_LINE_ID':
      return { ...state, busLineId: action.payload };
    
    case 'SET_BUS_LINE_SEARCH':
      return { ...state, busLineSearch: action.payload };
    
    case 'SET_ORIGIN_ID':
      return { ...state, originId: action.payload };
    
    case 'SET_DESTINATION_ID':
      return { ...state, destinationId: action.payload };
    
    case 'SET_SELECTED_DIRECTION':
      return { ...state, selectedDirection: action.payload };
    
    case 'SET_CUTOFF_TIME':
      return { ...state, cutoffTime: action.payload };
    
    case 'SET_ENABLE_CUTOFF':
      return { ...state, enableCutoff: action.payload };
    
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    
    case 'SET_BUS_LINE_LOADING':
      return { ...state, busLineLoading: action.payload };
    
    case 'SET_STOPS_LOADING':
      return { ...state, stopsLoading: action.payload };
    
    case 'SET_GEO_LOADING':
      return { ...state, geoLoading: action.payload };
    
    case 'SET_IS_CONFIG_OPEN':
      return { ...state, isConfigOpen: action.payload };
    
    case 'SET_SHOW_BUS_LINE_RESULTS':
      return { ...state, showBusLineResults: action.payload };
    
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    
    case 'SET_BUS_STOP_ERROR':
      return { ...state, busStopError: action.payload };
    
    case 'SET_GEO_ERROR':
      return { ...state, geoError: action.payload };
    
    case 'SET_LAST_REFRESH':
      return { ...state, lastRefresh: action.payload };
    
    case 'SET_NEXT_REFRESH_IN':
      return { ...state, nextRefreshIn: action.payload };
    
    case 'FORCE_UPDATE':
      return { ...state, forceUpdate: state.forceUpdate + 1 };
    
    case 'BATCH_UPDATE':
      return { ...state, ...action.payload };
    
    case 'RESET_ALL':
      return {
        ...initialState,
        isConfigOpen: true, // Show settings panel after reset
      };
    
    default:
      return state;
  }
}

// Custom hook
export function useBusTracker() {
  const [state, dispatch] = useReducer(busTrackerReducer, initialState);

  // Action creators
  const actions = {
    setArrivals: useCallback((arrivals: BusArrival[]) => 
      dispatch({ type: 'SET_ARRIVALS', payload: arrivals }), []),
    
    setData: useCallback((data: BusData | null) => 
      dispatch({ type: 'SET_DATA', payload: data }), []),
    
    setBusLineResults: useCallback((results: (BusLine | NearbyBusLine)[]) => 
      dispatch({ type: 'SET_BUS_LINE_RESULTS', payload: results }), []),
    
    setStops: useCallback((stops: BusStop[]) => 
      dispatch({ type: 'SET_STOPS', payload: stops }), []),
    
    setDirections: useCallback((directions: Direction[]) => 
      dispatch({ type: 'SET_DIRECTIONS', payload: directions }), []),
    
    setBusLineId: useCallback((id: string) => 
      dispatch({ type: 'SET_BUS_LINE_ID', payload: id }), []),
    
    setBusLineSearch: useCallback((search: string) => 
      dispatch({ type: 'SET_BUS_LINE_SEARCH', payload: search }), []),
    
    setOriginId: useCallback((id: string) => 
      dispatch({ type: 'SET_ORIGIN_ID', payload: id }), []),
    
    setDestinationId: useCallback((id: string) => 
      dispatch({ type: 'SET_DESTINATION_ID', payload: id }), []),
    
    setSelectedDirection: useCallback((direction: string) => 
      dispatch({ type: 'SET_SELECTED_DIRECTION', payload: direction }), []),
    
    setCutoffTime: useCallback((time: string) => 
      dispatch({ type: 'SET_CUTOFF_TIME', payload: time }), []),
    
    setEnableCutoff: useCallback((enable: boolean) => 
      dispatch({ type: 'SET_ENABLE_CUTOFF', payload: enable }), []),
    
    setLoading: useCallback((loading: boolean) => 
      dispatch({ type: 'SET_LOADING', payload: loading }), []),
    
    setBusLineLoading: useCallback((loading: boolean) => 
      dispatch({ type: 'SET_BUS_LINE_LOADING', payload: loading }), []),
    
    setStopsLoading: useCallback((loading: boolean) => 
      dispatch({ type: 'SET_STOPS_LOADING', payload: loading }), []),
    
    setGeoLoading: useCallback((loading: boolean) => 
      dispatch({ type: 'SET_GEO_LOADING', payload: loading }), []),
    
    setIsConfigOpen: useCallback((open: boolean) => 
      dispatch({ type: 'SET_IS_CONFIG_OPEN', payload: open }), []),
    
    setShowBusLineResults: useCallback((show: boolean) => 
      dispatch({ type: 'SET_SHOW_BUS_LINE_RESULTS', payload: show }), []),
    
    setError: useCallback((error: string | null) => 
      dispatch({ type: 'SET_ERROR', payload: error }), []),
    
    setBusStopError: useCallback((error: string | null) => 
      dispatch({ type: 'SET_BUS_STOP_ERROR', payload: error }), []),
    
    setGeoError: useCallback((error: string | null) => 
      dispatch({ type: 'SET_GEO_ERROR', payload: error }), []),
    
    setLastRefresh: useCallback((date: Date | null) => 
      dispatch({ type: 'SET_LAST_REFRESH', payload: date }), []),
    
    setNextRefreshIn: useCallback((seconds: number) => 
      dispatch({ type: 'SET_NEXT_REFRESH_IN', payload: seconds }), []),
    
    forceUpdate: useCallback(() => 
      dispatch({ type: 'FORCE_UPDATE' }), []),
    
    batchUpdate: useCallback((updates: Partial<BusTrackerState>) => 
      dispatch({ type: 'BATCH_UPDATE', payload: updates }), []),
    
    resetAll: useCallback(() => 
      dispatch({ type: 'RESET_ALL' }), []),
  };

  return { state, actions };
}