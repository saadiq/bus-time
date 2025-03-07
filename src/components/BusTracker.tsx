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

interface NearbyBusLine extends BusLine {
  distance: number;
  closestStop: {
    name: string;
    distance: number;
  };
}

const POLLING_INTERVAL = 30000; // 30 seconds
const DEBOUNCE_DELAY = 300; // ms for debouncing typeahead search

const BusTrackerContent = () => {
  const router = useRouter();
  const query = useSearchParams();
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
  const [busLineResults, setBusLineResults] = useState<(BusLine | NearbyBusLine)[]>([]);
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

  // Add refs to track current bus line info
  const currentBusLineRef = useRef({ id: '', search: '' });

  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

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

    // Only add parameters that have values
    if (busLineId) urlParams.set('busLine', busLineId);
    if (originId) urlParams.set('originId', originId);
    if (destinationId) urlParams.set('destinationId', destinationId);
    if (enableCutoff) {
      urlParams.set('cutoff', 'true');
      urlParams.set('time', cutoffTime);
    }

    // Add or override with new parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value === 'false') {
        urlParams.delete(key);
      } else {
        urlParams.set(key, value);
      }
    });

    // Only update URL if parameters have changed
    const currentUrl = new URL(window.location.href);
    const currentParams = new URLSearchParams(currentUrl.search);
    const newParamsString = urlParams.toString();
    const currentParamsString = currentParams.toString();

    if (newParamsString !== currentParamsString) {
      router.replace(`?${newParamsString}`);
    }
  }, [busLineId, originId, destinationId, enableCutoff, cutoffTime, router]);

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

  // Select a bus line from the results
  const selectBusLine = async (line: BusLine) => {
    console.log('Selected line:', line);
    setBusLineSearch(`${line.shortName} - ${line.longName}`);
    setShowBusLineResults(false);
    setBusLineId(line.id);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      // If this is a nearby bus line, it already has the closest stop info
      if ('closestStop' in line) {
        const nearbyLine = line as NearbyBusLine;

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

        const data = await response.json();
        if (!data.stops || data.stops.length === 0) {
          throw new Error('No stops found for this line');
        }

        // Find the stop that matches the closest stop name
        let matchingStop = null;
        let matchReason = '';

        // Special handling for B48 and B44-SBS
        const isSBS = line.id.includes('B44+');
        const isB48 = line.id.includes('B48');

        // Normalize a stop name into a set of street names
        const normalizeIntoStreets = (name: string): string[] => {
          // Remove common prefixes and normalize abbreviations
          const withoutPrefix = name.replace(/^SBS\s+/, '').replace(/^[A-Z]\d+\s+/, '');

          const withNormalizedAbbrev = withoutPrefix
            .replace(/\bWLMSBRG\b/gi, 'WILLIAMSBURG')
            .replace(/\bBRDG\b/gi, 'BRIDGE')
            .replace(/\bPLZ\b/gi, 'PLAZA')
            .replace(/\bNSTRND\b/gi, 'NOSTRAND')
            .replace(/\bRGRS\b/gi, 'ROGERS')
            .replace(/\bMKR\b/gi, 'MEEKER')
            .replace(/\bAV\b/gi, 'AVENUE')
            .replace(/\bST\b/gi, 'STREET');

          // Convert to lowercase and split on slash
          const parts = withNormalizedAbbrev.toLowerCase().split('/');

          // Process each street name
          return parts.map(part => {
            // Remove common suffixes and normalize spaces
            return part
              .replace(/(avenue|ave|av)$/g, '')
              .replace(/(street|str|st)$/g, '')
              .replace(/(road|rd)$/g, '')
              .replace(/(place|pl)$/g, '')
              .replace(/(boulevard|blvd)$/g, '')
              .replace(/\s+/g, '')
              .trim();
          }).filter(Boolean);
        };

        // Get the normalized street names we're looking for
        const targetStreets = normalizeIntoStreets(nearbyLine.closestStop.name);

        // Try to find an exact street match first
        let matchFound = false;
        for (const stop of data.stops) {
          // Skip stops that don't match the route type
          if (isSBS) {
            const isSBSStop = stop.direction.includes('SBS');
            if (!isSBSStop) continue;
          }

          // For B48, check if it's in the right direction
          if (isB48) {
            const isCorrectDirection = stop.direction.includes('LEFFERTS GARDENS') ||
              stop.direction.includes('GREENPOINT');
            if (!isCorrectDirection) continue;
          }

          const currentStreets = normalizeIntoStreets(stop.name);

          // Check if both streets match in either order
          const streetsMatch =
            (targetStreets[0] === currentStreets[0] && targetStreets[1] === currentStreets[1]) ||
            (targetStreets[0] === currentStreets[1] && targetStreets[1] === currentStreets[0]);

          if (streetsMatch) {
            matchingStop = stop;
            matchReason = 'exact street match';
            matchFound = true;
            break;
          }
        }

        if (!matchFound) {
          for (const stop of data.stops) {
            // Skip stops that don't match the route type
            if (isSBS) {
              const isSBSStop = stop.direction.includes('SBS');
              if (!isSBSStop) continue;
            }

            if (isB48) {
              const isCorrectDirection = stop.direction.includes('LEFFERTS GARDENS') ||
                stop.direction.includes('GREENPOINT');
              if (!isCorrectDirection) continue;
            }

            const currentStreets = normalizeIntoStreets(stop.name);

            const hasAllStreets = targetStreets.every(targetStreet =>
              currentStreets.some(currentStreet =>
                currentStreet.includes(targetStreet) || targetStreet.includes(currentStreet)
              )
            );

            if (hasAllStreets) {
              matchingStop = stop;
              matchReason = 'partial street match';
              matchFound = true;
              break;
            }
          }
        }

        if (matchingStop) {
          // First set the stops and directions
          setStops(data.stops);

          // Set directions first
          if (data.directions && data.directions.length > 0) {
            setDirections(data.directions);

            // Find the direction that contains this stop
            const stopDirection = data.directions.find((d: Direction) =>
              data.stops.some((s: BusStop) =>
                s.id === matchingStop.id && s.direction === d.name
              )
            );

            // Set the direction that contains our matched stop
            if (stopDirection) {
              setSelectedDirection(stopDirection.id);
            } else {
              setSelectedDirection(data.directions[0].id);
            }
          }

          // Now set the origin and update URL
          setOriginId(matchingStop.id);

          // Update URL with the bus line and origin
          updateUrl({
            busLine: line.id,
            originId: matchingStop.id
          });
          return;
        }
      }

      // If we don't have closest stop info or couldn't find the matching stop,
      // fall back to calculating distances
      const response = await fetch(`/api/bus-stops?lineId=${encodeURIComponent(line.id)}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch bus stops');
      }

      const data = await response.json();
      if (!data.stops || data.stops.length === 0) {
        throw new Error('No stops found for this line');
      }

      // Find the closest stop
      let closestStop = data.stops[0];
      let minDistance = calculateDistance(
        position.coords.latitude,
        position.coords.longitude,
        data.stops[0].lat,
        data.stops[0].lon
      );

      for (const stop of data.stops) {
        const distance = calculateDistance(
          position.coords.latitude,
          position.coords.longitude,
          stop.lat,
          stop.lon
        );
        if (distance < minDistance) {
          minDistance = distance;
          closestStop = stop;
        }
      }

      // Set the closest stop as the origin
      setOriginId(closestStop.id);
      setStops(data.stops);

      // Set directions if available
      if (data.directions && data.directions.length > 0) {
        setDirections(data.directions);
        setSelectedDirection(data.directions[0].id);
      }

      // Update URL with the bus line and origin
      updateUrl({
        busLine: line.id,
        originId: closestStop.id
      });

    } catch (err) {
      console.error('Error finding closest stop:', err);
      // If there's an error, just fetch stops without setting an origin
      fetchStopsForLine(line.id);
    }
  };

  // Function to calculate distance between two points using the Haversine formula
  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Fetch stops for a selected bus line - wrapped in useCallback to prevent recreating on each render
  const fetchStopsForLine = useCallback(async (lineId: string, preserveOriginId?: string, preserveDestinationId?: string) => {
    // Store current bus line info
    const currentBusLineSearch = busLineSearch;

    // Don't fetch if no line ID is provided
    if (!lineId) {
      setStopsLoading(false);
      return;
    }

    setStopsLoading(true);
    try {
      // Add a timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(`/api/bus-stops?lineId=${encodeURIComponent(lineId)}`, {
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
      });

      clearTimeout(timeoutId);

      // Handle not-found errors more gracefully (API returns 404 when no stops are found)
      if (response.status === 404) {
        console.warn(`No stops found for bus line: ${lineId}`);
        setBusStopError('No stops found for this bus line. Please try another line.');
        setStops([]);
        setDirections([]);
        setSelectedDirection('');
        setOriginId('');
        setDestinationId('');
        // Restore bus line info
        setBusLineSearch(currentBusLineSearch);
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch bus stops: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data || !data.stops) {
        throw new Error('Invalid response format from bus stops API');
      }

      if (data.stops.length > 0) {
        setBusStopError(null); // Clear any previous errors
        setStops(data.stops);

        if (data.directions && data.directions.length > 0) {
          setDirections(data.directions);
          setSelectedDirection(data.directions[0].id);
        } else {
          console.warn('No directions found in the API response');
        }

        // Only set default origin/destination if we're preserving values
        if (preserveOriginId && preserveDestinationId) {
          const allStopIds = data.stops.map((s: BusStop) => s.id);
          const shouldPreserveOrigin = allStopIds.includes(preserveOriginId);
          const shouldPreserveDestination = allStopIds.includes(preserveDestinationId);

          if (shouldPreserveOrigin && shouldPreserveDestination) {
            setOriginId(preserveOriginId);
            setDestinationId(preserveDestinationId);
            updateUrl({
              originId: preserveOriginId,
              destinationId: preserveDestinationId
            });
          } else {
            setOriginId('');
            setDestinationId('');
          }
        } else {
          setOriginId('');
          setDestinationId('');
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
      console.error('Error fetching bus stops:', err);
      setBusStopError('Error loading bus stops. Please try again.');
      setStops([]);
      setDirections([]);
      setSelectedDirection('');
      setOriginId('');
      setDestinationId('');
      // Restore bus line info
      setBusLineSearch(currentBusLineSearch);
    } finally {
      setStopsLoading(false);
    }
  }, [updateUrl, busLineSearch]);

  // Load parameters from URL
  useEffect(() => {
    // Store previous values to detect changes
    const prevBusLine = busLineId;
    const prevOriginId = originId;
    const prevDestinationId = destinationId;

    // Get parameters from URL
    const urlBusLine = query.get('busLine');
    const urlOriginId = query.get('originId');
    const urlDestinationId = query.get('destinationId');

    // Only update if values are different
    if (urlBusLine && urlBusLine !== prevBusLine) {
      setBusLineId(urlBusLine);
      fetchBusLineDetails(urlBusLine);
      fetchStopsForLine(urlBusLine,
        urlOriginId || undefined,
        urlDestinationId || undefined);
    }

    // Only update origin/destination if they've changed
    if (urlOriginId && urlOriginId !== prevOriginId) {
      setOriginId(urlOriginId);
    }
    if (urlDestinationId && urlDestinationId !== prevDestinationId) {
      setDestinationId(urlDestinationId);
    }

    // Handle cutoff settings
    const urlCutoff = query.get('cutoff');
    const urlTime = query.get('time');
    if (urlCutoff === 'true') {
      setEnableCutoff(true);
      if (urlTime) setCutoffTime(urlTime);
    }

    // Auto-expand settings panel when bus line is passed in URL
    if (urlBusLine) {
      setIsConfigOpen(true);
    }
  }, [query]);

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

  // Update ref whenever bus line info changes
  useEffect(() => {
    if (busLineId && busLineSearch) {
      currentBusLineRef.current = { id: busLineId, search: busLineSearch };
    }
  }, [busLineId, busLineSearch]);

  // Separate effect for title updates
  useEffect(() => {
    const updateTitle = () => {
      const { id, search } = currentBusLineRef.current;
      if (id && search) {
        document.title = `${search.split(' - ')[0]} Bus Tracker`;
      } else {
        document.title = 'Bus Tracker';
      }
    };

    // Update title immediately
    updateTitle();

    // Set up an interval to check and update the title
    const intervalId = setInterval(updateTitle, 100);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // Swap direction function
  const handleSwapDirections = () => {
    // Store current values
    const tempOrigin = originId;
    const tempDestination = destinationId;
    const currentBusLineSearch = currentBusLineRef.current.search;
    const currentBusLineId = currentBusLineRef.current.id;

    // First, update the direction if we have multiple directions
    if (directions.length > 1) {
      const currentDirIndex = directions.findIndex(d => d.id === selectedDirection);
      if (currentDirIndex !== -1) {
        // Get the opposite direction index
        const newDirIndex = (currentDirIndex + 1) % directions.length;
        // Update direction synchronously
        setSelectedDirection(directions[newDirIndex].id);
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

    // Ensure bus line info is preserved before fetching stops
    setBusLineId(currentBusLineId);
    setBusLineSearch(currentBusLineSearch);

    // Fetch new stops for the new direction, but preserve our swapped selections
    fetchStopsForLine(currentBusLineId, tempDestination, tempOrigin);
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

    // Clear bus line ref
    currentBusLineRef.current = { id: '', search: '' };

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
      return [...stops].sort((a, b) => a.sequence - b.sequence);
    };

    if (!direction) {
      // If there are no directions at all, return all stops sorted by sequence
      if (directions.length === 0) {
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

        const filteredStops = stops.filter(s => s.direction === firstDirection.name);
        const sortedStops = sortStopsBySequence(filteredStops);

        return sortedStops.map(s => ({
          value: s.id,
          label: s.name
        }));
      }

      return [];
    }

    const filteredStops = stops.filter(stop => stop.direction === direction.name);

    if (filteredStops.length === 0) {
      // If no stops match the exact direction name, try a more flexible approach
      const allDirectionNames = [...new Set(stops.map(s => s.direction))];

      // Try to find a direction name that contains our direction name or vice versa
      const similarDirection = allDirectionNames.find(
        dirName => dirName.includes(direction.name) || direction.name.includes(dirName)
      );

      if (similarDirection) {
        const similarStops = stops.filter(s => s.direction === similarDirection);
        const sortedStops = sortStopsBySequence(similarStops);

        return sortedStops.map(s => ({
          value: s.id,
          label: s.name
        }));
      }

      // If still no stops found, group by direction and sort each group
      if (stops.length > 0) {
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
    return directionStops.length > 0 ? directionStops : [];
  }, [getDirectionStops, busLineId, selectedDirection, forceUpdate]);

  const handleGeolocation = async () => {
    setGeoLoading(true);
    setGeoError(null);
    setBusLineResults([]);
    setShowBusLineResults(false);

    try {
      console.log('\n=== Starting Geolocation Process ===');
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      console.log('Got position:', position.coords);
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

      const data = await response.json();
      console.log('Got nearby bus lines:', data);

      if (data.busLines && data.busLines.length > 0) {
        console.log('Setting bus line results:', data.busLines);
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
      } else {
        setGeoError('Error finding nearby bus lines');
      }
    } finally {
      setGeoLoading(false);
      console.log('=== Geolocation Process Complete ===\n');
    }
  };

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
              <div className="flex gap-2">
                <input
                  type="text"
                  value={busLineSearch}
                  onChange={handleBusLineSearchChange}
                  onFocus={() => {
                    setBusLineSearch('');
                    setShowBusLineResults(false);
                  }}
                  placeholder="Start typing bus line (e.g. B52)"
                  className="text-gray-800 rounded px-2 py-1 flex-1"
                />
                <button
                  onClick={handleGeolocation}
                  disabled={geoLoading}
                  className="bg-blue-700 px-2 py-1 rounded hover:bg-blue-800 transition-colors flex items-center gap-1"
                  title="Find nearby bus lines"
                >
                  {geoLoading ? (
                    <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>
                  ) : (
                    <>
                      <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                        <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V2c0-.55-.45-1-1-1s-1 .45-1 1v1.06C6.83 3.52 3.52 6.83 3.06 11H2c-.55 0-1 .45-1 1s.45 1 1 1h1.06c.46 4.17 3.77 7.48 7.94 7.94V22c0 .55.45 1 1 1s1-.45 1-1v-1.06c4.17-.46 7.48-3.77 7.94-7.94H22c.55 0 1-.45 1-1s-.45-1-1-1h-1.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
                      </svg>
                      <span className="sr-only">Find nearby bus lines</span>
                    </>
                  )}
                </button>
              </div>
              {geoError && (
                <div className="absolute z-10 mt-1 w-full bg-red-50 border border-red-200 text-red-600 text-sm p-2 rounded">
                  {geoError}
                </div>
              )}
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
                      onClick={() => selectBusLine(line as BusLine)}
                    >
                      <div className="font-bold">{line.shortName}</div>
                      <div className="text-xs text-gray-600">{line.longName}</div>
                      {'distance' in line && (
                        <div className="text-xs text-blue-600 mt-1">
                          {((line as NearbyBusLine).distance < 0.1
                            ? 'Very close'
                            : `${(line as NearbyBusLine).distance.toFixed(1)} miles away`)}
                        </div>
                      )}
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
      <div className="border-t border-gray-200 p-4 text-center">
        <a
          href="https://github.com/saadiq/bus-time"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm"
          title="View source on GitHub"
        >
          <svg height="16" width="16" viewBox="0 0 16 16" className="fill-current">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />          </svg>
          <span>Source</span>
        </a>
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
