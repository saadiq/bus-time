"use client";

import React, { useState, useEffect, Suspense, useRef, useCallback } from 'react';
import { Switch } from '@headlessui/react';
import { useRouter, useSearchParams } from 'next/navigation';

interface BusArrival {
  vehicleId: string;
  originArrival: Date;
  stopsAway: number;
  destinationArrival: Date | null;
  destination: string;
  isEstimated: boolean;
}

interface BusData {
  originName: string;
  destinationName: string;
  buses: BusResponse[];
}

interface BusResponse {
  vehicleRef: string;
  originArrival: string;
  originStopsAway: number;
  destinationArrival: string | null;
  proximity: string;
  destination: string;
  isEstimated: boolean;
}

interface BusLine {
  id: string;
  shortName: string;
  longName: string;
  description: string;
  agencyId: string;
}

interface BusStop {
  id: string;
  code: string;
  name: string;
  direction: string;
  sequence: number;
  lat: number;
  lon: number;
}

interface Direction {
  id: string;
  name: string;
}

// Default stops as a fallback
const DEFAULT_STOPS = [
  { value: 'MTA_304213', label: 'Gates-Bedford' },
  { value: 'MTA_302434', label: 'Joralemon-Court' },
  { value: 'MTA_308212', label: 'Fulton St' },
  { value: 'MTA_305423', label: 'Atlantic Terminal' },
];

const POLLING_INTERVAL = 30000; // 30 seconds
const DEBOUNCE_DELAY = 300; // ms for debouncing typeahead search

const BusTrackerContent = () => {
  const router = useRouter();
  const query = useSearchParams();
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const defaultStopsLoadedRef = useRef<boolean>(false);

  const [arrivals, setArrivals] = useState<BusArrival[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busStopError, setBusStopError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BusData | null>(null);
  const [cutoffTime, setCutoffTime] = useState('08:00');
  const [enableCutoff, setEnableCutoff] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [nextRefreshIn, setNextRefreshIn] = useState<number>(POLLING_INTERVAL / 1000);

  // Route selection state
  const [busLineSearch, setBusLineSearch] = useState('');
  const [busLineResults, setBusLineResults] = useState<BusLine[]>([]);
  const [busLineLoading, setBusLineLoading] = useState(false);
  const [showBusLineResults, setShowBusLineResults] = useState(false);

  // Stops state
  const [stops, setStops] = useState<BusStop[]>([]);
  const [directions, setDirections] = useState<Direction[]>([]);
  const [selectedDirection, setSelectedDirection] = useState<string>('');
  const [stopsLoading, setStopsLoading] = useState(false);
  const [busLineId, setBusLineId] = useState('');
  const [originId, setOriginId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);

  // Load initial data
  useEffect(() => {
    setLastRefresh(new Date());

    // Check URL parameters first
    const urlBusLine = query.get('busLine');
    const urlOriginId = query.get('originId');
    const urlDestinationId = query.get('destinationId');

    // Load from URL parameters if present, otherwise from local storage
    if (urlBusLine) {
      setBusLineId(urlBusLine);
      fetchBusLineDetails(urlBusLine);
      fetchStopsForLine(urlBusLine,
        urlOriginId || undefined,
        urlDestinationId || undefined);

      if (urlOriginId) setOriginId(urlOriginId);
      if (urlDestinationId) setDestinationId(urlDestinationId);
    } else {
      // Try to load from local storage
      const storedBusLine = localStorage.getItem('busLine');
      const storedOriginId = localStorage.getItem('originId');
      const storedDestinationId = localStorage.getItem('destinationId');
      const storedBusLineSearch = localStorage.getItem('busLineSearch');

      if (storedBusLine && storedOriginId && storedDestinationId) {
        setBusLineId(storedBusLine);
        setBusLineSearch(storedBusLineSearch || storedBusLine);
        setOriginId(storedOriginId);
        setDestinationId(storedDestinationId);
        fetchStopsForLine(storedBusLine, storedOriginId, storedDestinationId);
      } else {
        // If no stored preferences, show the settings panel with empty state
        setIsConfigOpen(true);
        setBusLineId('');
        setBusLineSearch('');
        setOriginId('');
        setDestinationId('');
        setStops([]);
      }
    }
  }, []);

  // Save selections to local storage whenever they change
  useEffect(() => {
    // Only save if we have all necessary values
    if (busLineId && originId && destinationId) {
      localStorage.setItem('busLine', busLineId);
      localStorage.setItem('busLineSearch', busLineSearch);
      localStorage.setItem('originId', originId);
      localStorage.setItem('destinationId', destinationId);
    }
  }, [busLineId, busLineSearch, originId, destinationId]);

  // Update URL with current parameters
  const updateUrl = useCallback((params: Record<string, string>) => {
    const urlParams = new URLSearchParams();

    // Add current parameters
    urlParams.set('busLine', busLineId);
    urlParams.set('originId', originId);
    urlParams.set('destinationId', destinationId);

    // Add or override with new parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value === 'false') {
        urlParams.delete(key);
      } else {
        urlParams.set(key, value);
      }
    });

    router.replace(`?${urlParams.toString()}`);
  }, [busLineId, originId, destinationId, router]);

  // Fetch bus line details by ID
  const fetchBusLineDetails = async (lineId: string) => {
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

      const data = await response.json();

      if (data.busLine) {
        setBusLineSearch(`${data.busLine.shortName} - ${data.busLine.longName}`);
      } else {
        console.warn('Bus line info API returned no data:', data);
        setBusLineSearch(`Bus ${fallbackName}`);
      }
    } catch (err) {
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

  // Fetch stops for a selected bus line - wrapped in useCallback to prevent recreating on each render
  const fetchStopsForLine = useCallback(async (lineId: string, preserveOriginId?: string, preserveDestinationId?: string) => {
    // Don't fetch if no line ID is provided
    if (!lineId) {
      setStopsLoading(false);
      return;
    }

    // Store the current values at the start of the fetch
    const startOriginId = originId;
    const startDestinationId = destinationId;

    setStopsLoading(true);
    try {
      const response = await fetch(`/api/bus-stops?lineId=${encodeURIComponent(lineId)}`);

      // Handle not-found errors more gracefully (API returns 404 when no stops are found)
      if (response.status === 404) {
        console.warn(`No stops found for bus line: ${lineId}`);
        // Keep existing stops if available, otherwise use defaults
        if (stops.length === 0) {
          console.log('Falling back to default stops');
          setStops(DEFAULT_STOPS.map(stop => ({
            id: stop.value,
            code: '',
            name: stop.label,
            direction: 'Default',
            sequence: 0,
            lat: 0,
            lon: 0
          })));
          setDirections([{ id: 'default', name: 'Default Direction' }]);
          setSelectedDirection('default');
        }

        // Only update if values haven't changed during loading
        if (originId === startOriginId && destinationId === startDestinationId) {
          setOriginId(preserveOriginId || originId);
          setDestinationId(preserveDestinationId || destinationId);
        }
        setBusStopError('No stops found for this bus line. Using default or previously loaded stops.');
        return;
      }

      if (!response.ok) throw new Error('Failed to fetch bus stops');

      const data = await response.json();

      if (data.stops && data.stops.length > 0) {
        setBusStopError(null); // Clear any previous errors
        setStops(data.stops);

        if (data.directions && data.directions.length > 0) {
          setDirections(data.directions);
          // We'll just use the first direction by default
          // The swap button will handle switching between directions
          setSelectedDirection(data.directions[0].id);
        } else {
          console.warn('No directions found in the API response');
        }

        // Set default origin and destination, but try to preserve existing selections if they exist
        if (data.directions && data.directions.length > 0) {
          const firstDirectionName = data.directions[0].name;
          const firstDirectionStops = data.stops.filter(
            (stop: BusStop) => stop.direction === firstDirectionName
          );

          if (firstDirectionStops.length > 0) {
            const firstStop = firstDirectionStops[0];
            const lastStop = firstDirectionStops[firstDirectionStops.length - 1];

            // Check if we need to preserve user selections
            const allStopIds = data.stops.map((s: BusStop) => s.id);
            const shouldPreserveOrigin = preserveOriginId && allStopIds.includes(preserveOriginId);
            const shouldPreserveDestination = preserveDestinationId && allStopIds.includes(preserveDestinationId);

            // Only update if values haven't changed during loading
            if (originId === startOriginId && destinationId === startDestinationId) {
              // If the preserved stops are available in the new bus line, use them
              // Otherwise use the first and last stops
              const newOriginId = shouldPreserveOrigin ? preserveOriginId : firstStop.id;
              const newDestinationId = shouldPreserveDestination ? preserveDestinationId : lastStop.id;

              setOriginId(newOriginId);
              setDestinationId(newDestinationId);

              // Update URL with new origin and destination
              updateUrl({
                originId: newOriginId,
                destinationId: newDestinationId
              });
            }
          } else {
            console.warn('No stops found for the first direction:', firstDirectionName);
          }
        }
      } else {
        console.warn('No stops found in the API response');
        // Fall back to default stops
        if (stops.length === 0) {
          setStops(DEFAULT_STOPS.map(stop => ({
            id: stop.value,
            code: '',
            name: stop.label,
            direction: 'Default',
            sequence: 0,
            lat: 0,
            lon: 0
          })));
          setDirections([{ id: 'default', name: 'Default Direction' }]);
          setSelectedDirection('default');
        }
      }
    } catch (err) {
      console.error('Error fetching bus stops:', err);
      setBusStopError('Error loading bus stops. Using default stops.');

      // Fall back to default stops
      if (stops.length === 0) {
        setStops(DEFAULT_STOPS.map(stop => ({
          id: stop.value,
          code: '',
          name: stop.label,
          direction: 'Default',
          sequence: 0,
          lat: 0,
          lon: 0
        })));
        setDirections([{ id: 'default', name: 'Default Direction' }]);
        setSelectedDirection('default');
      }
    } finally {
      setStopsLoading(false);
    }
  }, [updateUrl, originId, destinationId]);

  // Load parameters from URL
  useEffect(() => {
    // Store previous busLine to detect changes
    const prevBusLine = busLineId;

    // Get parameters from URL
    const urlBusLine = query.get('busLine');
    if (urlBusLine) {
      const busLine = urlBusLine;
      setBusLineId(busLine);

      // Only fetch bus line details and stops if the bus line has changed
      if (busLine !== prevBusLine) {
        // Fetch bus line details to update the display
        fetchBusLineDetails(busLine);
        // Also trigger fetching of stops for this line
        fetchStopsForLine(busLine,
          query.get('originId') || undefined,
          query.get('destinationId') || undefined);
      }

      // Auto-expand settings panel when bus line is passed in URL
      setIsConfigOpen(true);
    }

    // Always update origin and destination from URL if present
    if (query.get('originId')) {
      setOriginId(query.get('originId') || '');
    }
    if (query.get('destinationId')) {
      setDestinationId(query.get('destinationId') || '');
    }
    if (query.get('cutoff') === 'true') {
      setEnableCutoff(true);
      const timeQuery = query.get('time');
      setCutoffTime(timeQuery || '08:00');
    }
  }, [query, busLineId]);

  // At component mount, pre-fetch stop info for the default stops 
  // to ensure they have proper names on first render
  useEffect(() => {
    // Only fetch default stop info once
    if (defaultStopsLoadedRef.current) return;
    defaultStopsLoadedRef.current = true;

    // Pre-fetch stop information for the default stops if they haven't been loaded yet
    const defaultStopIds = DEFAULT_STOPS.map(stop => stop.value);

    const fetchDefaultStopInfo = async () => {
      try {
        // Fetch stop information for each default stop
        const promises = defaultStopIds.map(async (stopId) => {
          try {
            const response = await fetch(`/api/bus-stops/info?stopId=${encodeURIComponent(stopId)}`);
            if (response.ok) {
              return await response.json();
            }
          } catch (err) {
            console.error(`Error fetching default stop ${stopId}:`, err);
          }
          return null;
        });

        const stopResults = await Promise.all(promises);

        // Update the DEFAULT_STOPS with actual stop names if available
        stopResults.forEach((result, index) => {
          if (result && result.name) {
            DEFAULT_STOPS[index].label = result.name;
          }
        });
      } catch (err) {
        console.error('Error pre-fetching default stop info:', err);
      }
    };

    fetchDefaultStopInfo();
  }, []);

  // Handle search input for bus lines
  const handleBusLineSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const searchValue = e.target.value;
    setBusLineSearch(searchValue);

    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set a new timeout to debounce the search
    searchTimeoutRef.current = setTimeout(() => {
      if (searchValue.trim().length > 1) {
        searchBusLines(searchValue);
      } else {
        setBusLineResults([]);
        setShowBusLineResults(false);
      }
    }, DEBOUNCE_DELAY);
  };

  // Search for bus lines
  const searchBusLines = async (query: string) => {
    setBusLineLoading(true);
    try {
      const response = await fetch(`/api/bus-lines?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Failed to fetch bus lines');

      const data = await response.json();
      setBusLineResults(data.busLines || []);
      setShowBusLineResults(true);
    } catch (err) {
      console.error('Error searching bus lines:', err);
      setBusLineResults([]);
    } finally {
      setBusLineLoading(false);
    }
  };

  // Select a bus line from the results
  const selectBusLine = (line: BusLine) => {
    setBusLineSearch(`${line.shortName} - ${line.longName}`);
    setShowBusLineResults(false);

    // Update the busLineId and fetch stops for this line
    // Keep current origin and destination when changing lines
    setBusLineId(line.id);
    fetchStopsForLine(line.id, originId, destinationId);

    // Update URL with the new bus line
    updateUrl({ busLine: line.id });
  };

  // Swap direction function
  const handleSwapDirections = () => {
    // Store the values we want to swap
    const tempOrigin = originId;
    const tempDestination = destinationId;

    // First, update the direction if we have multiple directions
    if (directions.length > 1) {
      const currentDirIndex = directions.findIndex(d => d.id === selectedDirection);
      if (currentDirIndex !== -1) {
        // Get the opposite direction index
        const newDirIndex = (currentDirIndex + 1) % directions.length;
        // Update direction synchronously
        setSelectedDirection(directions[newDirIndex].id);

        // Fetch new stops for the new direction, but preserve our swapped selections
        fetchStopsForLine(busLineId, tempDestination, tempOrigin);
      }
    }

    // Update state with swapped values immediately
    setOriginId(tempDestination);
    setDestinationId(tempOrigin);

    // Force a recomputation of currentStops
    setForceUpdate(prev => prev + 1);

    // Update URL with swapped values
    updateUrl({
      originId: tempDestination,
      destinationId: tempOrigin
    });
  };

  const handleCutoffChange = (value: boolean) => {
    setEnableCutoff(value);
    updateUrl(value ? { cutoff: 'true', time: cutoffTime } : { cutoff: 'false' });
  };

  const handleCutoffTimeChange = (time: string) => {
    setCutoffTime(time);
    if (enableCutoff) {
      updateUrl({ time });
    }
  };

  const handleOriginChange = (newOriginId: string) => {
    setOriginId(newOriginId);
    updateUrl({ originId: newOriginId });
  };

  const handleDestinationChange = (newDestinationId: string) => {
    setDestinationId(newDestinationId);
    updateUrl({ destinationId: newDestinationId });
  };

  const handleReset = () => {
    // Clear form state
    setBusLineId('');
    setBusLineSearch('');
    setOriginId('');
    setDestinationId('');
    setStops([]);
    setDirections([]);
    setSelectedDirection('');
    setArrivals([]);
    setData(null);
    setError(null);
    setBusStopError(null);
    setStopsLoading(false); // Clear loading state
    setBusLineResults([]); // Clear search results
    setShowBusLineResults(false); // Hide search results dropdown

    // Clear local storage
    localStorage.removeItem('busLine');
    localStorage.removeItem('busLineSearch');
    localStorage.removeItem('originId');
    localStorage.removeItem('destinationId');

    // Clear URL parameters
    router.replace('/');

    // Show settings panel
    setIsConfigOpen(true);
  };

  const getBusStatus = (arrivalTime: Date) => {
    if (!enableCutoff) return 'normal';

    const [hours, minutes] = cutoffTime.split(':').map(Number);
    const cutoff = new Date(arrivalTime);
    cutoff.setHours(hours, minutes, 0, 0);

    const warningThreshold = new Date(cutoff.getTime() - 20 * 60000); // 20 minutes before

    if (arrivalTime > cutoff) return 'late';
    if (arrivalTime >= warningThreshold) return 'warning';
    return 'normal';
  };

  useEffect(() => {
    const fetchData = async () => {
      // Don't fetch if we don't have all necessary values
      if (!busLineId || !originId || !destinationId) {
        setArrivals([]);
        setData(null);
        return;
      }

      try {
        setLoading(true);
        const url = `/api/bus-times?busLine=${encodeURIComponent(busLineId)}&originId=${encodeURIComponent(originId)}&destinationId=${encodeURIComponent(destinationId)}`;
        const response = await fetch(url);

        if (!response.ok) throw new Error('Failed to fetch bus data');

        const data = await response.json();
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
      } catch (err) {
        setError('Unable to load bus arrival times. Please try again later.');
        console.error('Error fetching bus data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, POLLING_INTERVAL);
    return () => clearInterval(interval);
  }, [busLineId, originId, destinationId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!lastRefresh) return;
      const timeSinceLastRefresh = Date.now() - lastRefresh.getTime();
      const remainingSeconds = Math.max(0, Math.ceil((POLLING_INTERVAL - timeSinceLastRefresh) / 1000));
      setNextRefreshIn(remainingSeconds);
    }, 1000);

    return () => clearInterval(timer);
  }, [lastRefresh]);

  const formatTime = (date: Date | null) => {
    if (!date || isNaN(date.getTime())) return 'N/A';
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getMinutesUntil = (date: Date | null) => {
    if (!date || isNaN(date.getTime())) return 'N/A';
    const diff = date.getTime() - new Date().getTime();
    const minutes = Math.floor(diff / 60000);
    return minutes < 1 ? 'NOW' : minutes;
  };

  // Get stops for current direction
  const getDirectionStops = useCallback(() => {
    const direction = directions.find(d => d.id === selectedDirection);

    // Simple sorting function that uses the API-provided sequence numbers
    const sortStopsBySequence = (stops: BusStop[]) => {
      console.log('Sorting stops by sequence numbers provided by the API');
      return [...stops].sort((a, b) => a.sequence - b.sequence);
    };

    if (!direction) {
      console.warn('No direction found with id:', selectedDirection);

      // If there are no directions at all, return all stops sorted by sequence
      if (directions.length === 0) {
        console.log('No directions available, sorting all stops by sequence');

        // First group by direction, then sort each group by sequence
        const directionGroups: Record<string, BusStop[]> = {};
        stops.forEach(stop => {
          if (!directionGroups[stop.direction]) {
            directionGroups[stop.direction] = [];
          }
          directionGroups[stop.direction].push(stop);
        });

        // Sort each direction group by sequence
        const allSortedStops: BusStop[] = [];
        Object.values(directionGroups).forEach(dirStops => {
          allSortedStops.push(...sortStopsBySequence(dirStops));
        });

        return allSortedStops.map(stop => ({
          value: stop.id,
          label: stop.name
        }));
      }

      // If we have directions but selected one is not found,
      // use the first direction instead
      if (directions.length > 0) {
        const firstDirection = directions[0];
        setSelectedDirection(firstDirection.id);
        console.log('Using first direction:', firstDirection.name);

        const filteredStops = stops.filter(s => s.direction === firstDirection.name);
        const sortedStops = sortStopsBySequence(filteredStops);

        return sortedStops.map(s => ({
          value: s.id,
          label: s.name
        }));
      }

      return [];
    }

    console.log('Using direction:', direction.name);
    const filteredStops = stops.filter(stop => stop.direction === direction.name);

    if (filteredStops.length === 0) {
      console.warn('No stops found for direction:', direction.name);

      // If no stops match the exact direction name, try a more flexible approach
      const allDirectionNames = [...new Set(stops.map(s => s.direction))];

      // Try to find a direction name that contains our direction name or vice versa
      const similarDirection = allDirectionNames.find(
        dirName => dirName.includes(direction.name) || direction.name.includes(dirName)
      );

      if (similarDirection) {
        console.log('Found similar direction:', similarDirection);
        const similarStops = stops.filter(s => s.direction === similarDirection);
        const sortedStops = sortStopsBySequence(similarStops);

        return sortedStops.map(s => ({
          value: s.id,
          label: s.name
        }));
      }

      // If still no stops found, group by direction and sort each group
      if (stops.length > 0) {
        console.log('Using all stops grouped by direction and sorted by sequence');

        // Group by direction first
        const directionGroups: Record<string, BusStop[]> = {};
        stops.forEach(stop => {
          if (!directionGroups[stop.direction]) {
            directionGroups[stop.direction] = [];
          }
          directionGroups[stop.direction].push(stop);
        });

        // Sort each direction group by sequence
        const allSortedStops: BusStop[] = [];
        Object.values(directionGroups).forEach(dirStops => {
          allSortedStops.push(...sortStopsBySequence(dirStops));
        });

        return allSortedStops.map(stop => ({
          value: stop.id,
          label: stop.name
        }));
      }
    }

    // Sort the filtered stops by sequence
    const sortedStops = sortStopsBySequence(filteredStops);

    // Log the sorted stops and their sequence numbers for debugging
    console.log('Stops for direction', direction.name, 'sorted by sequence:');
    sortedStops.forEach(stop => {
      console.log(`${stop.name}: sequence=${stop.sequence}`);
    });

    return sortedStops.map(stop => ({
      value: stop.id,
      label: stop.name
    }));
  }, [directions, selectedDirection, stops]);

  // Make sure we only compute currentStops once
  const currentStops = React.useMemo(() => {
    // If no bus line is selected, return empty array
    if (!busLineId) {
      return [];
    }
    console.log('Recomputing currentStops with direction:', selectedDirection);
    const directionStops = getDirectionStops();
    return directionStops.length > 0 ? directionStops : DEFAULT_STOPS;
  }, [getDirectionStops, busLineId, selectedDirection, forceUpdate]);

  return (
    <div className="max-w-lg mx-auto bg-white rounded-lg shadow-md">
      <div className="bg-blue-500 text-white p-6 rounded-t-lg">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          🚍 {busLineId ? `${busLineSearch.split(' - ')[0]} ` : ''}Bus Tracker
          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className="ml-auto text-sm bg-blue-600 px-3 py-1 rounded-full hover:bg-blue-700"
          >
            {isConfigOpen ? 'Hide Settings' : 'Settings'}
          </button>
        </h1>

        {isConfigOpen && (
          <div className="mt-4 space-y-3 p-3 bg-blue-600 rounded-lg">
            <div className="flex justify-between items-center">
              <label className="text-sm mb-1">Bus Line</label>
              <button
                onClick={handleReset}
                className="text-xs bg-blue-700 px-2 py-1 rounded hover:bg-blue-800 transition-colors"
                title="Clear all settings"
              >
                Reset
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                value={busLineSearch}
                onChange={handleBusLineSearchChange}
                placeholder="Start typing bus line (e.g. B52)"
                className="text-gray-800 rounded px-2 py-1 w-full"
              />
              {busLineLoading && (
                <div className="absolute right-2 top-8">
                  <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>
                </div>
              )}

              {showBusLineResults && busLineResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-auto text-gray-800">
                  {busLineResults.map(line => (
                    <div
                      key={line.id}
                      className="px-3 py-2 hover:bg-blue-100 cursor-pointer border-b border-gray-100"
                      onClick={() => selectBusLine(line)}
                    >
                      <div className="font-bold">{line.shortName}</div>
                      <div className="text-xs text-gray-600">{line.longName}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {busStopError && (
              <div className="bg-blue-700 border-l-4 border-yellow-400 text-white p-3 rounded mb-3">
                <p className="text-sm">{busStopError}</p>
              </div>
            )}

            <div className="flex space-x-2">
              <div className="flex-1">
                <label className="text-sm mb-1 block">Origin</label>
                <select
                  value={originId}
                  onChange={(e) => handleOriginChange(e.target.value)}
                  className="text-gray-800 rounded px-2 py-1 w-full"
                  disabled={!busLineId}
                >
                  <option value="">Select origin</option>
                  {currentStops.map((stop) => (
                    <option key={stop.value} value={stop.value}>{stop.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-end pb-1">
                <button
                  onClick={handleSwapDirections}
                  className="bg-blue-700 rounded-full p-2 hover:bg-blue-800"
                  aria-label="Switch direction"
                  title="Swap origin and destination"
                  disabled={!busLineId}
                >
                  ↔️
                </button>
              </div>

              <div className="flex-1">
                <label className="text-sm mb-1 block">Destination</label>
                <select
                  value={destinationId}
                  onChange={(e) => handleDestinationChange(e.target.value)}
                  className="text-gray-800 rounded px-2 py-1 w-full"
                  disabled={!busLineId}
                >
                  <option value="">Select destination</option>
                  {currentStops.map((stop) => (
                    <option key={stop.value} value={stop.value}>{stop.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {stopsLoading && (
              <div className="text-center py-2">
                <div className="inline-block animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>
                <span className="ml-2 text-sm">Loading stops...</span>
              </div>
            )}
          </div>
        )}

        <div className="text-sm mt-3">
          📍 {data?.originName} → {data?.destinationName}
        </div>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={enableCutoff}
              onChange={handleCutoffChange}
              className={`${enableCutoff ? 'bg-blue-700' : 'bg-blue-400'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}
            >
              <span className={`${enableCutoff ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
            </Switch>
            <span className="text-sm">Check arrival times</span>
          </div>
          <input
            type="time"
            value={cutoffTime}
            onChange={(e) => handleCutoffTimeChange(e.target.value)}
            className="bg-blue-400 rounded px-2 py-1 text-sm"
            disabled={!enableCutoff}
          />
        </div>
      </div>
      <div className="p-6">
        <div className="text-sm text-gray-500 mb-4 flex justify-between items-center">
          <span>Last: {lastRefresh?.toLocaleTimeString() || 'Loading...'}</span>
          <span>Refresh in {nextRefreshIn} secs</span>
        </div>
        {loading && <div className="text-center py-4">Loading arrival times...</div>}
        {error && (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
            <p>{error}</p>
            <p className="text-sm mt-2">Try selecting different stops or a different bus line.</p>
          </div>
        )}
        {!loading && !error && arrivals.length === 0 && (
          <div className="text-center py-4">No buses scheduled at this time</div>
        )}
        {!loading && !error && arrivals.length > 0 && (
          <div className="space-y-4">
            {arrivals.map((bus) => {
              const destinationStatus = bus.destinationArrival ? getBusStatus(bus.destinationArrival) : 'normal';
              return (
                <div
                  key={bus.vehicleId}
                  className={`p-4 rounded-lg ${destinationStatus === 'late' ? 'bg-gray-50 border-l-4 border-red-500' :
                    destinationStatus === 'warning' ? 'bg-gray-50 border-l-4 border-yellow-500' :
                      'bg-gray-50 border-l-4 border-green-500'
                    }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center">
                      <span className="mr-3 text-xl">🚌</span>
                      <div>
                        <span className="font-bold text-xl text-gray-800">{getMinutesUntil(bus.originArrival)}</span>
                        <span className="text-gray-800 text-base ml-1">min</span>
                        <span className="text-gray-500 text-base ml-3">({bus.stopsAway} {bus.stopsAway === 1 ? 'stop' : 'stops'} away)</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 whitespace-nowrap text-right">
                      <span className="text-gray-400 mr-2">→</span>
                      <span className="text-gray-600 text-base">@ {bus.isEstimated ? <i>{formatTime(bus.destinationArrival)}</i> : formatTime(bus.destinationArrival)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
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
