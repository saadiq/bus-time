"use client";

import React, { useEffect, Suspense, useRef, useCallback } from 'react';
import { Switch } from '@headlessui/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BusLine, BusStop, BusResponse, NearbyBusLine } from '@/types';
import { useBusTracker } from '@/hooks/useBusTracker';
import {
  useDistanceCalculation,
  useDirectionStops,
  useBusStatus,
  useTimeFormatting,
  useStopMatching
} from '@/hooks/useMemoizedComputations';
import { SAME_LOCATION_THRESHOLD } from '@/lib/geo';


const POLLING_INTERVAL = 30000; // 30 seconds
const DEBOUNCE_DELAY = 300; // ms for debouncing typeahead search

// Safe localStorage helpers (guards against SSR and broken implementations like bun's mock)
const isLocalStorageAvailable = (): boolean => {
  try {
    if (typeof window === 'undefined') return false;
    if (typeof window.localStorage === 'undefined') return false;
    if (typeof window.localStorage.getItem !== 'function') return false;
    if (typeof window.localStorage.setItem !== 'function') return false;
    // Test actual functionality
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
};

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    if (!isLocalStorageAvailable()) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    if (!isLocalStorageAvailable()) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage errors
    }
  },
  removeItem: (key: string): void => {
    if (!isLocalStorageAvailable()) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage errors
    }
  }
};

const BusTrackerContent = () => {
  const router = useRouter();
  const query = useSearchParams();
  const { state, actions } = useBusTracker();
  
  // Destructure state for easier access
  const {
    arrivals, error, busStopError, loading, data, cutoffTime, enableCutoff,
    lastRefresh, nextRefreshIn, busLineSearch, busLineResults, busLineLoading: _busLineLoading,
    showBusLineResults, stops, directions, selectedDirection, stopsLoading,
    busLineId, originId, destinationId, isConfigOpen, forceUpdate,
    geoLoading, geoError
  } = state;
  
  // Destructure actions for easier access
  const {
    setArrivals, setError, setBusStopError, setLoading, setData, setCutoffTime,
    setEnableCutoff, setLastRefresh, setNextRefreshIn, setBusLineSearch,
    setBusLineResults, setBusLineLoading, setShowBusLineResults, setStops,
    setDirections, setSelectedDirection, setStopsLoading, setBusLineId,
    setOriginId, setDestinationId, setIsConfigOpen, forceUpdate: triggerForceUpdate,
    setGeoLoading, setGeoError, batchUpdate, resetAll
  } = actions;

  // Refs for cleanup and functionality
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const stopsAbortControllerRef = useRef<AbortController | null>(null);
  const arrivalsAbortControllerRef = useRef<AbortController | null>(null);
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const currentBusLineRef = useRef({ id: '', search: '' });

  // Memoized computations
  const calculateDistance = useDistanceCalculation();
  const currentStops = useDirectionStops(stops, directions, selectedDirection);
  const getBusStatus = useBusStatus(enableCutoff, cutoffTime);
  const { formatTime, getMinutesUntil } = useTimeFormatting();
  const findMatchingStop = useStopMatching();
  
  // Get stop names from loaded stops data
  const getStopName = (stopId: string) => {
    const stop = stops.find(s => s.id === stopId);
    return stop ? stop.name : null;
  };

  // Extract route name without direction details
  const extractRouteName = (longName: string): string => {
    // Remove direction info like "X to Y" or "via Z"
    const cleanName = longName
      .replace(/\s+(to|TO)\s+.*$/i, '')
      .replace(/\s+(via|VIA)\s+.*$/i, '')
      .trim();
    return cleanName || longName;
  };

  // Cleanup effect for all refs when component unmounts
  useEffect(() => {
    return () => {
      // Clear all timeouts and intervals
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
      if (stopsAbortControllerRef.current) {
        stopsAbortControllerRef.current.abort();
      }
      if (arrivalsAbortControllerRef.current) {
        arrivalsAbortControllerRef.current.abort();
      }
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }
    };
  }, []);

  // Load initial data using precedence: URL > localStorage > empty state
  useEffect(() => {
    setLastRefresh(new Date());

    const bootstrap = async () => {
      try {
        const urlBusLine = query.get('busLine');
        const urlOriginId = query.get('originId');
        const urlDestinationId = query.get('destinationId');

        if (urlBusLine) {
          setBusLineId(urlBusLine);
          await fetchBusLineDetails(urlBusLine);
          await fetchStopsForLine(urlBusLine, urlOriginId || undefined, urlDestinationId || undefined);
          setIsConfigOpen(true);
          return;
        }

        const storedBusLine = safeLocalStorage.getItem('busLine');
        const storedOriginId = safeLocalStorage.getItem('originId');
        const storedDestinationId = safeLocalStorage.getItem('destinationId');
        const storedBusLineSearch = safeLocalStorage.getItem('busLineSearch');

        if (storedBusLine && storedOriginId && storedDestinationId) {
          setBusLineId(storedBusLine);
          setBusLineSearch(storedBusLineSearch || storedBusLine);
          await fetchStopsForLine(storedBusLine, storedOriginId, storedDestinationId);
          syncUrl({
            busLineId: storedBusLine,
            originId: storedOriginId,
            destinationId: storedDestinationId,
          });
          return;
        }

        setIsConfigOpen(true);
        setBusLineId('');
        setBusLineSearch('');
        setOriginId('');
        setDestinationId('');
        setStops([]);
      } catch (err) {
        console.error('Failed to bootstrap tracker state:', err);
        setIsConfigOpen(true);
      }
    };

    bootstrap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save selections to local storage whenever they change
  useEffect(() => {
    const hasOrigin = originId && stops.some(stop => stop.id === originId);
    const hasDestination = destinationId && stops.some(stop => stop.id === destinationId);

    if (busLineId && hasOrigin && hasDestination) {
      safeLocalStorage.setItem('busLine', busLineId);
      safeLocalStorage.setItem('busLineSearch', busLineSearch);
      safeLocalStorage.setItem('originId', originId);
      safeLocalStorage.setItem('destinationId', destinationId);
      return;
    }

    safeLocalStorage.removeItem('originId');
    safeLocalStorage.removeItem('destinationId');

    if (!busLineId) {
      safeLocalStorage.removeItem('busLine');
      safeLocalStorage.removeItem('busLineSearch');
    }
  }, [busLineId, busLineSearch, originId, destinationId, stops]);

  // Update URL with current parameters
  const syncUrl = useCallback((overrides: Partial<{
    busLineId: string | null;
    originId: string | null;
    destinationId: string | null;
    enableCutoff: boolean;
    cutoffTime: string | null;
  }> = {}) => {
    const effectiveBusLineId = overrides.busLineId !== undefined ? overrides.busLineId : busLineId;
    const effectiveOriginId = overrides.originId !== undefined ? overrides.originId : originId;
    const effectiveDestinationId = overrides.destinationId !== undefined ? overrides.destinationId : destinationId;
    const effectiveEnableCutoff = overrides.enableCutoff !== undefined ? overrides.enableCutoff : enableCutoff;
    const effectiveCutoffTime = overrides.cutoffTime !== undefined ? overrides.cutoffTime : cutoffTime;

    const params = new URLSearchParams();

    if (effectiveBusLineId) params.set('busLine', effectiveBusLineId);
    if (effectiveOriginId) params.set('originId', effectiveOriginId);
    if (effectiveDestinationId) params.set('destinationId', effectiveDestinationId);

    if (effectiveEnableCutoff) {
      params.set('cutoff', 'true');
      if (effectiveCutoffTime) {
        params.set('time', effectiveCutoffTime);
      }
    }

    const newParamsString = params.toString();
    const pathname = window.location.pathname;
    const destination = newParamsString ? `${pathname}?${newParamsString}` : pathname;
    const currentFullPath = `${window.location.pathname}${window.location.search}`;

    if (destination !== currentFullPath) {
      router.replace(destination);
    }
  }, [busLineId, originId, destinationId, enableCutoff, cutoffTime, router]);

  // Fetch bus line details by ID
  const fetchBusLineDetails = async (lineId: string): Promise<void> => {
    try {
      setBusLineLoading(true);
      // Create a more descriptive fallback name from the lineId
      let fallbackName = lineId;

      // Handle typical format like "MTA NYCT_B52"
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
        // Request was aborted, don't set error
        return;
      }
      console.error('Error fetching bus line details:', err);
      // Parse the lineId to create a reasonable display name
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

  // Select a bus line from the results
  const selectBusLine = async (line: BusLine) => {
    setBusLineSearch(`${line.shortName} - ${extractRouteName(line.longName)}`);
    setShowBusLineResults(false);
    setBusLineId(line.id);
    syncUrl({ busLineId: line.id, originId: null, destinationId: null });

    // Don't override with geolocation if URL parameters are present
    const urlOriginId = query.get('originId');
    const urlDestinationId = query.get('destinationId');
    if (urlOriginId && urlDestinationId) {
      await fetchStopsForLine(line.id, urlOriginId, urlDestinationId);
      setOriginId(urlOriginId);
      setDestinationId(urlDestinationId);
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

      // Fetch stops for this line
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

      // Set directions if available
      if (data.directions && data.directions.length > 0) {
        setDirections(data.directions);
        setSelectedDirection(data.directions[0].id);
      }

      // Get stops for the current direction
      const currentDirection = data.directions?.[0];
      const directionStops = currentDirection
        ? data.stops.filter((s: BusStop) => s.direction === currentDirection.name)
        : data.stops;

      // Find the best matching stop
      let matchingStop: BusStop | null = null;

      // If this is a nearby bus line with closest stop info, use name matching
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

      // If no match found or no closest stop info, find closest by distance
      if (!matchingStop && directionStops.length > 0) {
        matchingStop = findClosestStopInList(
          position.coords.latitude,
          position.coords.longitude,
          directionStops
        );
      }

      // Fallback to first stop if still no match
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


  // Fetch stops for a selected bus line - wrapped in useCallback to prevent recreating on each render
  const fetchStopsForLine = useCallback(async (lineId: string, preserveOriginId?: string, preserveDestinationId?: string): Promise<void> => {
    // Store current bus line info
    const currentBusLineSearch = busLineSearch;

    // Don't fetch if no line ID is provided
    if (!lineId) {
      setStopsLoading(false);
      return;
    }

    setStopsLoading(true);
    try {
      // Cancel any previous request
      if (stopsAbortControllerRef.current) {
        stopsAbortControllerRef.current.abort();
      }
      
      // Create new abort controller
      stopsAbortControllerRef.current = new AbortController();
      const timeoutId = setTimeout(() => {
        if (stopsAbortControllerRef.current) {
          stopsAbortControllerRef.current.abort();
        }
      }, 10000); // 10 second timeout

      const response = await fetch(`/api/bus-stops?lineId=${encodeURIComponent(lineId)}`, {
        signal: stopsAbortControllerRef.current.signal,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
      });

      clearTimeout(timeoutId);
      stopsAbortControllerRef.current = null;

      // Handle not-found errors more gracefully (API returns 404 when no stops are found)
      if (response.status === 404) {
        console.warn(`No stops found for bus line: ${lineId}`);
        setBusStopError('No stops found for this bus line. Please try another line.');
        setStops([]);
        setDirections([]);
        setSelectedDirection('');
        setOriginId('');
        setDestinationId('');
        syncUrl({ busLineId: lineId, originId: null, destinationId: null });
        // Restore bus line info
        setBusLineSearch(currentBusLineSearch);
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch bus stops: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();
      const data = responseData.success ? responseData.data : responseData;

      if (!data || !data.stops) {
        throw new Error('Invalid response format from bus stops API');
      }

      if (data.stops.length > 0) {
        setBusStopError(null); // Clear any previous errors
        setStops(data.stops);

        if (data.directions && data.directions.length > 0) {
          setDirections(data.directions);
          
          // If we're preserving values, find the correct direction for those stops
          let selectedDirectionId = data.directions[0].id; // default to first direction
          
          if (preserveOriginId && preserveDestinationId) {
            // Find which direction the preserved stops belong to
            const originStop = data.stops.find((s: BusStop) => s.id === preserveOriginId);
            const destinationStop = data.stops.find((s: BusStop) => s.id === preserveDestinationId);
            
            if (originStop && destinationStop) {
              // Find the direction that matches the stops' direction
              const matchingDirection = data.directions.find((d: { id: string; name: string }) => 
                d.name === originStop.direction || d.name === destinationStop.direction
              );
              if (matchingDirection) {
                selectedDirectionId = matchingDirection.id;
              }
            }
          }
          
          // Always set a direction to ensure stops are properly filtered
          setSelectedDirection(selectedDirectionId);
        } else {
          console.warn('No directions found in the API response');
          // If no directions, clear the selection
          setDirections([]);
          setSelectedDirection('');
        }

        // Only set default origin/destination if we're preserving values
        if (preserveOriginId && preserveDestinationId) {
          const allStopIds = data.stops.map((s: BusStop) => s.id);
          const shouldPreserveOrigin = allStopIds.includes(preserveOriginId);
          const shouldPreserveDestination = allStopIds.includes(preserveDestinationId);

          if (shouldPreserveOrigin && shouldPreserveDestination) {
            batchUpdate({
              originId: preserveOriginId,
              destinationId: preserveDestinationId
            });
            syncUrl({
              busLineId: lineId,
              originId: preserveOriginId,
              destinationId: preserveDestinationId,
            });
          } else {
            batchUpdate({
              originId: '',
              destinationId: ''
            });
            syncUrl({ originId: null, destinationId: null });
          }
        } else {
          setOriginId('');
          setDestinationId('');
          syncUrl({ originId: null, destinationId: null });
        }
      } else {
        console.warn('No stops found in the API response');
        setBusStopError('No stops available for this bus line. Please try another line.');
        setStops([]);
        setDirections([]);
        setSelectedDirection('');
        setOriginId('');
        setDestinationId('');
        // Restore bus line info
        setBusLineSearch(currentBusLineSearch);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was aborted, don't set error
        return;
      }
      console.error('Error fetching bus stops:', err);
      setBusStopError('Error loading bus stops. Please try again.');
      setStops([]);
      setDirections([]);
      setSelectedDirection('');
      setOriginId('');
      setDestinationId('');
      syncUrl({ busLineId: lineId, originId: null, destinationId: null });
      // Restore bus line info
      setBusLineSearch(currentBusLineSearch);
    } finally {
      if (stopsAbortControllerRef.current) {
        stopsAbortControllerRef.current = null;
      }
      setStopsLoading(false);
    }
  }, [syncUrl, busLineSearch, batchUpdate, setBusStopError, setStops, setDirections, setSelectedDirection, setOriginId, setDestinationId, setStopsLoading, setBusLineSearch]);

  // Handle cutoff settings from URL
  useEffect(() => {
    const urlCutoff = query.get('cutoff');
    const urlTime = query.get('time');
    if (urlCutoff === 'true') {
      setEnableCutoff(true);
      if (urlTime) setCutoffTime(urlTime);
    }
  }, [query, setEnableCutoff, setCutoffTime]);

  // Handle search input for bus lines
  const handleBusLineSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const searchValue = e.target.value;
    setBusLineSearch(searchValue);

    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }

    // Set a new timeout to debounce the search
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

  // Search for bus lines
  const searchBusLines = async (query: string) => {
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }

    const controller = new AbortController();
    searchAbortControllerRef.current = controller;
    setBusLineLoading(true);

    try {
      const response = await fetch(`/api/bus-lines?q=${encodeURIComponent(query)}`, {
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

  // Update ref whenever bus line info changes
  useEffect(() => {
    if (busLineId && busLineSearch) {
      currentBusLineRef.current = { id: busLineId, search: busLineSearch };
    } else {
      currentBusLineRef.current = { id: '', search: '' };
    }
  }, [busLineId, busLineSearch]);

  useEffect(() => {
    if (busLineId && busLineSearch) {
      document.title = `${busLineSearch.split(' - ')[0]} Bus Tracker`;
    } else {
      document.title = 'Bus Tracker';
    }
  }, [busLineId, busLineSearch]);

  // Helper function to find closest stop in a list
  const findClosestStopInList = (lat: number, lon: number, stopList: BusStop[]): BusStop | null => {
    if (!stopList || stopList.length === 0) return null;
    
    let closestStop = stopList[0];
    let minDistance = calculateDistance(lat, lon, closestStop.lat, closestStop.lon);
    
    for (const stop of stopList) {
      const distance = calculateDistance(lat, lon, stop.lat, stop.lon);
      if (distance < minDistance) {
        minDistance = distance;
        closestStop = stop;
      }
    }
    return closestStop;
  };

  // Swap direction function
  const handleSwapDirections = () => {
    // If we have multiple directions, switch to the opposite one
    if (directions.length > 1) {
      const currentDirIndex = directions.findIndex(d => d.id === selectedDirection);
      if (currentDirIndex !== -1) {
        // Get the opposite direction index
        const newDirIndex = (currentDirIndex + 1) % directions.length;
        const newDirection = directions[newDirIndex];

        // Get current stops if they exist
        const currentOriginStop = originId ? stops.find(s => s.id === originId) : null;
        const currentDestStop = destinationId ? stops.find(s => s.id === destinationId) : null;

        // Get stops for the new direction
        const newDirectionStops = stops.filter(s => s.direction === newDirection.name);

        let newOriginId = '';
        let newDestinationId = '';

        // If we have both current stops, find closest matches in opposite direction
        if (currentOriginStop && currentDestStop && newDirectionStops.length > 0) {
          // For return trip: destination becomes origin, origin becomes destination
          const newOrigin = findClosestStopInList(
            currentDestStop.lat, 
            currentDestStop.lon, 
            newDirectionStops
          );
          const newDest = findClosestStopInList(
            currentOriginStop.lat, 
            currentOriginStop.lon, 
            newDirectionStops
          );

          if (newOrigin) newOriginId = newOrigin.id;
          if (newDest) newDestinationId = newDest.id;
        } else if (currentOriginStop && newDirectionStops.length > 0) {
          // Only origin selected - find closest in opposite direction
          const newDest = findClosestStopInList(
            currentOriginStop.lat,
            currentOriginStop.lon,
            newDirectionStops
          );
          if (newDest) newDestinationId = newDest.id;
        } else if (currentDestStop && newDirectionStops.length > 0) {
          // Only destination selected - find closest in opposite direction
          const newOrigin = findClosestStopInList(
            currentDestStop.lat,
            currentDestStop.lon,
            newDirectionStops
          );
          if (newOrigin) newOriginId = newOrigin.id;
        }

        // Update state with new direction and stops
        batchUpdate({
          selectedDirection: newDirection.id,
          originId: newOriginId,
          destinationId: newDestinationId,
          forceUpdate: forceUpdate + 1
        });

        // Update URL parameters
        syncUrl({
          originId: newOriginId || null,
          destinationId: newDestinationId || null,
        });
      }
    } else {
      // If there's only one direction, just swap the origin and destination
      const tempOrigin = originId;
      const tempDestination = destinationId;
      
      batchUpdate({
        originId: tempDestination,
        destinationId: tempOrigin,
        forceUpdate: forceUpdate + 1
      });

      // Update URL with swapped values
      syncUrl({
        originId: tempDestination || null,
        destinationId: tempOrigin || null,
      });
    }
  };

  const handleCutoffChange = (value: boolean) => {
    setEnableCutoff(value);
    syncUrl(
      value
        ? { enableCutoff: true, cutoffTime }
        : { enableCutoff: false, cutoffTime: null }
    );
  };

  const handleCutoffTimeChange = (time: string) => {
    setCutoffTime(time);
    if (enableCutoff) {
      syncUrl({ cutoffTime: time });
    }
  };

  const handleOriginChange = (newOriginId: string) => {
    // If no destination is selected yet, just set the origin
    if (!destinationId) {
      setOriginId(newOriginId);
      syncUrl({ originId: newOriginId, destinationId });
      return;
    }

    // Find the stops in the current direction
    const direction = directions.find(d => d.id === selectedDirection);
    if (!direction) return;

    const newOriginStop = stops.find(s => s.id === newOriginId && s.direction === direction.name);
    const currentDestStop = stops.find(s => s.id === destinationId && s.direction === direction.name);

    if (!newOriginStop || !currentDestStop) return;

    // If the new origin is after the destination in the sequence, we need to change direction
    if (newOriginStop.sequence > currentDestStop.sequence && directions.length > 1) {
      // Find the opposite direction
      const currentDirIndex = directions.findIndex(d => d.id === selectedDirection);
      const newDirIndex = (currentDirIndex + 1) % directions.length;
      const newDirection = directions[newDirIndex];

      // Get stops in the new direction
      const newDirectionStops = stops.filter(s => s.direction === newDirection.name);

      // Find the corresponding stops in the new direction
      const originInNewDir = newDirectionStops.find(s =>
        calculateDistance(s.lat, s.lon, newOriginStop.lat, newOriginStop.lon) < SAME_LOCATION_THRESHOLD
      );
      const destInNewDir = newDirectionStops.find(s =>
        calculateDistance(s.lat, s.lon, currentDestStop.lat, currentDestStop.lon) < SAME_LOCATION_THRESHOLD
      );

      if (originInNewDir && destInNewDir) {
        setSelectedDirection(newDirection.id);
        setOriginId(originInNewDir.id);
        setDestinationId(destInNewDir.id);
        triggerForceUpdate();
        syncUrl({
          originId: originInNewDir.id,
          destinationId: destInNewDir.id,
        });
      } else {
        // If we can't find matching stops in the new direction, just set the origin
        setOriginId(newOriginId);
        syncUrl({ originId: newOriginId, destinationId });
      }
    } else {
      // If stops are in correct sequence or we only have one direction,
      // just set the new origin
      setOriginId(newOriginId);
      syncUrl({ originId: newOriginId, destinationId });
    }
  };

  const handleDestinationChange = (newDestinationId: string) => {
    // If no origin is selected yet, just set the destination
    if (!originId) {
      setDestinationId(newDestinationId);
      syncUrl({ originId, destinationId: newDestinationId });
      return;
    }

    // Find the stops in the current direction
    const direction = directions.find(d => d.id === selectedDirection);
    if (!direction) return;

    const currentOriginStop = stops.find(s => s.id === originId && s.direction === direction.name);
    const newDestStop = stops.find(s => s.id === newDestinationId && s.direction === direction.name);

    if (!currentOriginStop || !newDestStop) return;

    // If the new destination is before the origin in the sequence, we need to change direction
    if (newDestStop.sequence < currentOriginStop.sequence && directions.length > 1) {
      // Find the opposite direction
      const currentDirIndex = directions.findIndex(d => d.id === selectedDirection);
      const newDirIndex = (currentDirIndex + 1) % directions.length;
      const newDirection = directions[newDirIndex];

      // Get stops in the new direction
      const newDirectionStops = stops.filter(s => s.direction === newDirection.name);

      // Find the corresponding stops in the new direction
      const originInNewDir = newDirectionStops.find(s =>
        calculateDistance(s.lat, s.lon, currentOriginStop.lat, currentOriginStop.lon) < SAME_LOCATION_THRESHOLD
      );
      const destInNewDir = newDirectionStops.find(s =>
        calculateDistance(s.lat, s.lon, newDestStop.lat, newDestStop.lon) < SAME_LOCATION_THRESHOLD
      );

      if (originInNewDir && destInNewDir) {
        setSelectedDirection(newDirection.id);
        setOriginId(originInNewDir.id);
        setDestinationId(destInNewDir.id);
        triggerForceUpdate();
        syncUrl({
          originId: originInNewDir.id,
          destinationId: destInNewDir.id,
        });
      } else {
        // If we can't find matching stops in the new direction, just set the destination
        setDestinationId(newDestinationId);
        syncUrl({ originId, destinationId: newDestinationId });
      }
    } else {
      // If stops are in correct sequence or we only have one direction,
      // just set the new destination
      setDestinationId(newDestinationId);
      syncUrl({ originId, destinationId: newDestinationId });
    }
  };

  const handleReset = () => {
    // Clear bus line ref
    currentBusLineRef.current = { id: '', search: '' };

    // Clear local storage
    safeLocalStorage.removeItem('busLine');
    safeLocalStorage.removeItem('busLineSearch');
    safeLocalStorage.removeItem('originId');
    safeLocalStorage.removeItem('destinationId');

    // Clear URL parameters
    syncUrl({
      busLineId: null,
      originId: null,
      destinationId: null,
      enableCutoff: false,
      cutoffTime: null,
    });

    // Reset all state using the reducer action
    resetAll();
  };


  useEffect(() => {
    const fetchData = async () => {
      // Don't fetch if we don't have all necessary values
      if (!busLineId || !originId || !destinationId) {
        setArrivals([]);
        // Don't clear data immediately - preserve it for display
        // Only clear if we're actually missing required IDs, not during transitions
        if (!busLineId && !originId && !destinationId) {
          setData(null);
        }
        return;
      }

      try {
        setLoading(true);
        const url = `/api/bus-times?busLine=${encodeURIComponent(busLineId)}&originId=${encodeURIComponent(originId)}&destinationId=${encodeURIComponent(destinationId)}`;
        
        // Cancel any previous request
        if (arrivalsAbortControllerRef.current) {
          arrivalsAbortControllerRef.current.abort();
        }
        
        arrivalsAbortControllerRef.current = new AbortController();
        const response = await fetch(url, {
          signal: arrivalsAbortControllerRef.current.signal
        });

        if (!response.ok) throw new Error('Failed to fetch bus data');

        const responseData = await response.json();
        const data = responseData.success ? responseData.data : responseData;
        setData(data);

        // Check if the API returned an error message
        if (data.hasError) {
          setError(data.errorMessage || 'Unable to get real-time bus arrival data for these stops');
          setArrivals([]);
        } else {
          // Process each bus arrival
          const processedArrivals = data.buses.map((bus: BusResponse) => {
            // Safely parse dates
            let originArrival: Date | null = null;
            let destinationArrival: Date | null = null;

            try {
              if (bus.originArrival) {
                originArrival = new Date(bus.originArrival);
                // Validate the date is valid
                if (isNaN(originArrival.getTime())) {
                  console.warn(`Invalid origin arrival time format: ${bus.originArrival}`);
                  originArrival = null;
                }
              }

              if (bus.destinationArrival) {
                destinationArrival = new Date(bus.destinationArrival);
                // Validate the date is valid
                if (isNaN(destinationArrival.getTime())) {
                  console.warn(`Invalid destination arrival time format: ${bus.destinationArrival}`);
                  destinationArrival = null;
                }
              }
            } catch (e) {
              console.error('Error parsing bus arrival times:', e);
            }

            const result = {
              vehicleId: bus.vehicleRef,
              originArrival: originArrival || new Date(), // Fallback to current time if invalid
              stopsAway: bus.originStopsAway,
              destinationArrival: destinationArrival, // Keep as null if not available
              destination: bus.destination,
              isEstimated: bus.isEstimated || false,
            };

            return result;
          });

          setArrivals(processedArrivals);
          setError(null);
        }

        setLastRefresh(new Date());
        arrivalsAbortControllerRef.current = null;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Request was aborted, don't set error
          return;
        }
        setError('Unable to load bus arrival times. Please try again later.');
        console.error('Error fetching bus data:', err);
      } finally {
        if (arrivalsAbortControllerRef.current) {
          arrivalsAbortControllerRef.current = null;
        }
        setLoading(false);
      }
    };

    fetchData();
    intervalRef.current = setInterval(fetchData, POLLING_INTERVAL);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (arrivalsAbortControllerRef.current) {
        arrivalsAbortControllerRef.current.abort();
        arrivalsAbortControllerRef.current = null;
      }
    };
  }, [busLineId, originId, destinationId, setArrivals, setData, setError, setLastRefresh, setLoading]);

  useEffect(() => {
    countdownRef.current = setInterval(() => {
      if (!lastRefresh) return;
      const timeSinceLastRefresh = Date.now() - lastRefresh.getTime();
      const remainingSeconds = Math.max(0, Math.ceil((POLLING_INTERVAL - timeSinceLastRefresh) / 1000));
      setNextRefreshIn(remainingSeconds);
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [lastRefresh, setNextRefreshIn]);




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
        // Request was aborted, don't set error
        return;
      } else {
        setGeoError('Error finding nearby bus lines');
      }
    } finally {
      setGeoLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <header className="brutal-card border-b-0">
        <div className="p-6 pb-4">
          <div className="flex items-baseline justify-between">
            <h1 className="font-display text-4xl md:text-5xl tracking-tight">
              {busLineId ? busLineSearch.split(' - ')[0] : 'BUS'}
            </h1>
            <button
              onClick={() => setIsConfigOpen(!isConfigOpen)}
              className="brutal-button brutal-button--ghost text-sm border-2"
            >
              {isConfigOpen ? 'CLOSE' : 'CONFIG'}
            </button>
          </div>

          {/* Route Display */}
          <div className="mt-4 flex items-center gap-3 text-sm font-medium">
            <span className="w-3 h-3 bg-[var(--mta-yellow)]"></span>
            <span className="truncate">
              {data?.originName || getStopName(originId) || (stopsLoading && originId ? '...' : 'SELECT ORIGIN')}
            </span>
            <span className="text-[var(--muted)]">&rarr;</span>
            <span className="truncate">
              {data?.destinationName || getStopName(destinationId) || (stopsLoading && destinationId ? '...' : 'SELECT DESTINATION')}
            </span>
          </div>
        </div>

        {/* Settings Panel */}
        {isConfigOpen && (
          <div className="border-t-[3px] border-[var(--black)] p-6 space-y-5 bg-[var(--concrete-dark)]">
            {/* Bus Line Search */}
            <div className="relative">
              <div className="flex justify-between items-center mb-2">
                <label className="font-display text-sm tracking-wide">BUS LINE</label>
                <button
                  onClick={handleReset}
                  className="text-xs font-medium text-[var(--muted)] hover:text-[var(--black)] transition-colors"
                >
                  RESET
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={busLineSearch}
                  onChange={handleBusLineSearchChange}
                  onFocus={() => {
                    if (busLineSearch && !busLineId) {
                      setBusLineSearch('');
                    }
                    setShowBusLineResults(false);
                  }}
                  placeholder="Type route (e.g. B52, M15)"
                  className="brutal-input flex-1"
                />
                <button
                  onClick={handleGeolocation}
                  disabled={geoLoading}
                  className="brutal-button brutal-button--accent px-3"
                  title="Find nearby bus lines"
                >
                  {geoLoading ? (
                    <div className="animate-spin h-4 w-4 border-2 border-[var(--black)] border-t-transparent"></div>
                  ) : (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V2c0-.55-.45-1-1-1s-1 .45-1 1v1.06C6.83 3.52 3.52 6.83 3.06 11H2c-.55 0-1 .45-1 1s.45 1 1 1h1.06c.46 4.17 3.77 7.48 7.94 7.94V22c0 .55.45 1 1 1s1-.45 1-1v-1.06c4.17-.46 7.48-3.77 7.94-7.94H22c.55 0 1-.45 1-1s-.45-1-1-1h-1.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
                    </svg>
                  )}
                </button>
              </div>

              {geoError && (
                <div className="mt-2 p-3 bg-[var(--danger)] text-white text-sm font-medium">
                  {geoError}
                </div>
              )}

              {showBusLineResults && busLineResults.length > 0 && (
                <div className="absolute z-20 mt-1 left-0 right-0 bg-[var(--concrete)] border-[3px] border-[var(--black)] max-h-60 overflow-auto">
                  {busLineResults.map(line => (
                    <div
                      key={line.id}
                      className="px-4 py-3 hover:bg-[var(--mta-yellow)] cursor-pointer border-b-2 border-[var(--black)] last:border-b-0 transition-colors"
                      onClick={() => selectBusLine(line as BusLine)}
                    >
                      <div className="font-display text-lg">{line.shortName}</div>
                      <div className="text-xs text-[var(--muted)]">{line.longName}</div>
                      {'distance' in line && (
                        <div className="text-xs font-medium mt-1">
                          {((line as NearbyBusLine).distance < 0.1
                            ? 'NEARBY'
                            : `${(line as NearbyBusLine).distance.toFixed(1)} MI`)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {busStopError && (
              <div className="p-3 bg-[var(--mta-yellow)] text-[var(--black)] text-sm font-medium border-l-4 border-[var(--black)]">
                {busStopError}
              </div>
            )}

            {/* Direction Selector */}
            {busLineId && directions.length > 0 && (
              <div>
                <label className="font-display text-sm tracking-wide block mb-2">DIRECTION</label>
                <select
                  value={selectedDirection}
                  onChange={(e) => {
                    const newDirection = e.target.value;
                    setSelectedDirection(newDirection);
                    setOriginId('');
                    setDestinationId('');
                    triggerForceUpdate();
                  }}
                  className="brutal-select w-full"
                >
                  {directions.map((direction, index) => (
                    <option key={`dir-${direction.id}-${index}`} value={direction.id}>
                      {direction.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[var(--muted)] mt-1 font-mono">
                  {currentStops.length} STOPS
                </p>
              </div>
            )}

            {/* Stop Selectors */}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="font-display text-sm tracking-wide block mb-2">FROM</label>
                <select
                  value={originId}
                  onChange={(e) => handleOriginChange(e.target.value)}
                  className="brutal-select w-full text-sm"
                  disabled={!busLineId || !selectedDirection || currentStops.length === 0}
                >
                  <option key="placeholder-origin" value="">
                    {!selectedDirection ? "Select direction" :
                     currentStops.length === 0 ? "No stops" :
                     "Select stop"}
                  </option>
                  {currentStops.map((stop, index) => (
                    <option key={`origin-${stop.id}-${index}`} value={stop.id}>{stop.name}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleSwapDirections}
                className="brutal-button px-3 py-2 mb-[1px]"
                aria-label="Switch direction"
                title={directions.length > 1 ? "Switch to opposite direction" : "Swap origin and destination"}
                disabled={!busLineId || !selectedDirection}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="square" d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4-4m-4 4l4 4" />
                </svg>
              </button>

              <div className="flex-1">
                <label className="font-display text-sm tracking-wide block mb-2">TO</label>
                <select
                  value={destinationId}
                  onChange={(e) => handleDestinationChange(e.target.value)}
                  className="brutal-select w-full text-sm"
                  disabled={!busLineId || !selectedDirection || currentStops.length === 0}
                >
                  <option key="placeholder-destination" value="">
                    {!selectedDirection ? "Select direction" :
                     currentStops.length === 0 ? "No stops" :
                     "Select stop"}
                  </option>
                  {currentStops.map((stop, index) => (
                    <option key={`dest-${stop.id}-${index}`} value={stop.id}>{stop.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {stopsLoading && (
              <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <div className="animate-spin h-4 w-4 border-2 border-[var(--black)] border-t-transparent"></div>
                <span className="font-mono">LOADING...</span>
              </div>
            )}

            {/* Cutoff Time */}
            <div className="pt-3 border-t-2 border-[var(--black)] border-dashed">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={enableCutoff}
                    onChange={handleCutoffChange}
                    className={`${enableCutoff ? 'bg-[var(--mta-yellow)]' : 'bg-[var(--muted)]'} relative inline-flex h-6 w-11 items-center border-2 border-[var(--black)] transition-colors`}
                  >
                    <span className={`${enableCutoff ? 'translate-x-5' : 'translate-x-0'} inline-block h-5 w-5 transform bg-[var(--black)] transition-transform`} />
                  </Switch>
                  <span className="text-sm font-medium">ARRIVE BY</span>
                </div>
                <input
                  type="time"
                  value={cutoffTime}
                  onChange={(e) => handleCutoffTimeChange(e.target.value)}
                  className="brutal-input text-sm font-mono"
                  disabled={!enableCutoff}
                />
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Arrivals Section */}
      <section className="brutal-card border-t-0 min-h-[200px]">
        {/* Status Bar */}
        <div className="px-6 py-3 border-b-[3px] border-[var(--black)] flex justify-between items-center text-xs font-mono text-[var(--muted)]">
          <span>{lastRefresh?.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) || '...'}</span>
          <span className={nextRefreshIn <= 5 ? 'animate-pulse-slow' : ''}>
            {nextRefreshIn}s
          </span>
        </div>

        <div className="p-6">
          {loading && (
            <div className="flex items-center justify-center py-12 gap-3">
              <div className="animate-spin h-6 w-6 border-3 border-[var(--black)] border-t-transparent"></div>
              <span className="font-mono text-sm">LOADING</span>
            </div>
          )}

          {error && (
            <div className="p-4 bg-[var(--danger)] text-white">
              <p className="font-medium">{error}</p>
              <p className="text-sm mt-2 opacity-80">Try different stops or route.</p>
            </div>
          )}

          {!loading && !error && arrivals.length === 0 && (
            <div className="py-12 text-center">
              <div className="font-display text-4xl text-[var(--muted)]">NO BUSES</div>
              <p className="text-sm text-[var(--muted)] mt-2">None scheduled at this time</p>
            </div>
          )}

          {!loading && !error && arrivals.length > 0 && (
            <div className="space-y-3 stagger-children">
              {arrivals.map((bus) => {
                const destinationStatus = bus.destinationArrival ? getBusStatus(bus.destinationArrival) : 'normal';
                const statusClass = destinationStatus === 'late' ? 'status-bar--danger' :
                  destinationStatus === 'warning' ? 'status-bar--warning' : 'status-bar--good';

                return (
                  <div
                    key={bus.vehicleId}
                    className="flex border-[3px] border-[var(--black)] bg-white overflow-hidden"
                  >
                    {/* Status Bar */}
                    <div className={`status-bar ${statusClass}`}></div>

                    {/* Content */}
                    <div className="flex-1 p-4 flex items-center justify-between">
                      <div className="flex items-baseline gap-1">
                        <span className="font-display text-5xl leading-none">{getMinutesUntil(bus.originArrival)}</span>
                        <span className="font-display text-xl text-[var(--muted)]">MIN</span>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-mono text-[var(--muted)]">
                          {bus.stopsAway} {bus.stopsAway === 1 ? 'STOP' : 'STOPS'}
                        </div>
                        <div className="font-mono text-lg font-semibold">
                          {bus.isEstimated && <span className="text-[var(--muted)]">~</span>}
                          {formatTime(bus.destinationArrival)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-6 text-center">
        <a
          href="https://github.com/saadiq/bus-time"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-[var(--muted)] hover:text-[var(--concrete)] text-xs font-mono transition-colors"
        >
          <svg height="14" width="14" viewBox="0 0 16 16" className="fill-current">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          SOURCE
        </a>
      </footer>
    </div>
  );
};

const BusTracker = () => {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <BusTrackerContent />
    </Suspense>
  );
};

export default BusTracker;
