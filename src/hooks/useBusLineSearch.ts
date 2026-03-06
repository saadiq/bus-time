import React, { useRef } from 'react';
import { BusLine, BusStop, NearbyBusLine } from '@/types';
import { extractRouteName, findClosestStopInList } from '@/lib/busLineUtils';
import { useStopMatching } from '@/hooks/useMemoizedComputations';

const DEBOUNCE_DELAY = 300;

interface UseBusLineSearchParams {
  busLineSearch: string;
  busLineId: string;
  setBusLineSearch: (v: string) => void;
  setBusLineId: (v: string) => void;
  setBusLineResults: (v: (BusLine | NearbyBusLine)[]) => void;
  setBusLineLoading: (v: boolean) => void;
  setShowBusLineResults: (v: boolean) => void;
  setStops: (v: BusStop[]) => void;
  setDirections: (v: { id: string; name: string }[]) => void;
  setSelectedDirection: (v: string) => void;
  setOriginId: (v: string) => void;
  setGeoLoading: (v: boolean) => void;
  setGeoError: (v: string | null) => void;
  syncUrl: (overrides?: Record<string, unknown>) => void;
  fetchStopsForLine: (lineId: string, preserveOriginId?: string, preserveDestinationId?: string) => Promise<void>;
  query: ReturnType<typeof import('next/navigation').useSearchParams>;
}

export function useBusLineSearch(params: UseBusLineSearchParams) {
  const {
    setBusLineSearch, setBusLineId, setBusLineResults,
    setBusLineLoading, setShowBusLineResults, setStops,
    setDirections, setSelectedDirection, setOriginId,
    setGeoLoading, setGeoError,
    syncUrl, fetchStopsForLine, query,
  } = params;

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const findMatchingStop = useStopMatching();

  const searchBusLines = async (searchQuery: string) => {
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }

    const controller = new AbortController();
    searchAbortControllerRef.current = controller;
    setBusLineLoading(true);

    try {
      const response = await fetch(`/api/bus-lines?q=${encodeURIComponent(searchQuery)}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Failed to fetch bus lines');

      const responseData = await response.json();
      const data = responseData.success ? responseData.data : responseData;

      if (!controller.signal.aborted) {
        setBusLineResults(data.busLines || []);
        setShowBusLineResults(true);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      console.error('Error searching bus lines:', err);
      setBusLineResults([]);
    } finally {
      if (searchAbortControllerRef.current === controller) {
        searchAbortControllerRef.current = null;
      }
      setBusLineLoading(false);
    }
  };

  const handleBusLineSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const searchValue = e.target.value;
    setBusLineSearch(searchValue);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (searchValue.trim().length > 1) {
        searchBusLines(searchValue);
      } else {
        setBusLineResults([]);
        setShowBusLineResults(false);
      }
      searchTimeoutRef.current = null;
    }, DEBOUNCE_DELAY);
  };

  const fetchBusLineDetails = async (lineId: string): Promise<void> => {
    try {
      setBusLineLoading(true);
      let fallbackName = lineId;

      if (lineId.includes('_')) {
        const parts = lineId.split('_');
        if (parts.length >= 2) {
          const routeId = parts[parts.length - 1];
          fallbackName = `${routeId}`;
        }
      }

      const response = await fetch(`/api/bus-lines/info?lineId=${encodeURIComponent(lineId)}`);
      if (!response.ok) {
        console.error(`Failed to fetch bus line details: ${response.status}`);
        setBusLineSearch(`Bus ${fallbackName}`);
        return;
      }

      const responseData = await response.json();
      const data = responseData.success ? responseData.data : responseData;

      if (data.busLine) {
        setBusLineSearch(`${data.busLine.shortName} - ${extractRouteName(data.busLine.longName)}`);
      } else {
        console.warn('Bus line info API returned no data:', data);
        setBusLineSearch(`Bus ${fallbackName}`);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      console.error('Error fetching bus line details:', err);
      let fallbackName = lineId;
      if (lineId.includes('_')) {
        const parts = lineId.split('_');
        if (parts.length >= 2) {
          const routeId = parts[parts.length - 1];
          fallbackName = routeId;
        }
      }
      setBusLineSearch(`Bus ${fallbackName}`);
    } finally {
      setBusLineLoading(false);
    }
  };

  const selectBusLine = async (line: BusLine) => {
    setBusLineSearch(`${line.shortName} - ${extractRouteName(line.longName)}`);
    setShowBusLineResults(false);
    setBusLineId(line.id);
    syncUrl({ busLineId: line.id, originId: null, destinationId: null });

    const urlOriginId = query.get('originId');
    const urlDestinationId = query.get('destinationId');
    if (urlOriginId && urlDestinationId) {
      await fetchStopsForLine(line.id, urlOriginId, urlDestinationId);
      setOriginId(urlOriginId);
      syncUrl({
        busLineId: line.id,
        originId: urlOriginId,
        destinationId: urlDestinationId,
      });
      return;
    }

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      const response = await fetch(`/api/bus-stops?lineId=${encodeURIComponent(line.id)}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch bus stops');
      }

      const responseData = await response.json();
      const data = responseData.success ? responseData.data : responseData;
      if (!data.stops || data.stops.length === 0) {
        throw new Error('No stops found for this line');
      }

      if (data.directions && data.directions.length > 0) {
        setDirections(data.directions);
        setSelectedDirection(data.directions[0].id);
      }

      const currentDirection = data.directions?.[0];
      const directionStops = currentDirection
        ? data.stops.filter((s: BusStop) => s.direction === currentDirection.name)
        : data.stops;

      let matchingStop: BusStop | null = null;

      if ('closestStop' in line) {
        const nearbyLine = line as NearbyBusLine;
        matchingStop = findMatchingStop(
          directionStops,
          nearbyLine.closestStop.name,
          position.coords.latitude,
          position.coords.longitude,
          line.id
        );
      }

      if (!matchingStop && directionStops.length > 0) {
        matchingStop = findClosestStopInList(
          position.coords.latitude,
          position.coords.longitude,
          directionStops
        );
      }

      if (!matchingStop && data.stops.length > 0) {
        matchingStop = data.stops[0];
      }

      if (matchingStop) {
        setStops(data.stops);
        setOriginId(matchingStop.id);
        syncUrl({
          busLineId: line.id,
          originId: matchingStop.id,
          destinationId: null,
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      console.error('Error finding closest stop:', err);
      fetchStopsForLine(line.id);
    }
  };

  const handleGeolocation = async () => {
    setGeoLoading(true);
    setGeoError(null);
    setBusLineResults([]);
    setShowBusLineResults(false);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      const { latitude, longitude } = position.coords;
      const response = await fetch(`/api/bus-lines/nearby?lat=${latitude}&lon=${longitude}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch nearby bus lines');
      }

      const responseData = await response.json();
      const data = responseData.success ? responseData.data : responseData;

      if (data.busLines && data.busLines.length > 0) {
        setBusLineResults(data.busLines);
        setShowBusLineResults(true);
      } else {
        setGeoError('No bus lines found nearby');
      }
    } catch (err) {
      console.error('Geolocation error:', err);
      if (err instanceof GeolocationPositionError) {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setGeoError('Please allow location access to find nearby buses');
            break;
          case err.POSITION_UNAVAILABLE:
            setGeoError('Unable to determine your location');
            break;
          case err.TIMEOUT:
            setGeoError('Location request timed out');
            break;
          default:
            setGeoError('Error getting location');
        }
      } else if (err instanceof Error && err.name === 'AbortError') {
        return;
      } else {
        setGeoError('Error finding nearby bus lines');
      }
    } finally {
      setGeoLoading(false);
    }
  };

  const cleanup = () => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
  };

  return {
    handleBusLineSearchChange,
    fetchBusLineDetails,
    selectBusLine,
    handleGeolocation,
    cleanup,
  };
}
