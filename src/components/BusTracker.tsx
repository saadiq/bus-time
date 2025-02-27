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

  const [arrivals, setArrivals] = useState<BusArrival[]>([]);
  const [error, setError] = useState<string | null>(null);
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
  const [busLineId, setBusLineId] = useState('MTA NYCT_B52');
  const [originId, setOriginId] = useState('MTA_304213');
  const [destinationId, setDestinationId] = useState('MTA_302434');
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // Load initial data
  useEffect(() => {
    setLastRefresh(new Date());
  }, []);

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
      console.log('Bus line info response:', data);
      
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
    setStopsLoading(true);
    try {
      const response = await fetch(`/api/bus-stops?lineId=${encodeURIComponent(lineId)}`);
      if (!response.ok) throw new Error('Failed to fetch bus stops');
      
      const data = await response.json();
      
      console.log('Received stops data:', {
        totalStops: data.stops?.length || 0,
        directions: data.directions || [],
        firstFewStops: data.stops?.slice(0, 3) || []
      });
      
      if (data.stops && data.stops.length > 0) {
        setStops(data.stops);
        
        if (data.directions && data.directions.length > 0) {
          setDirections(data.directions);
          // We'll just use the first direction by default
          // The swap button will handle switching between directions
          setSelectedDirection(data.directions[0].id);
          
          console.log('Setting direction to:', data.directions[0].id, data.directions[0].name);
        } else {
          console.warn('No directions found in the API response');
        }
        
        // Group stops by direction for better debugging
        const stopsByDirection: Record<string, BusStop[]> = {};
        data.stops.forEach((stop: BusStop) => {
          if (!stopsByDirection[stop.direction]) {
            stopsByDirection[stop.direction] = [];
          }
          stopsByDirection[stop.direction].push(stop);
        });
        
        console.log('Stops by direction:', Object.keys(stopsByDirection).map(dir => ({
          direction: dir,
          stopCount: stopsByDirection[dir]?.length || 0
        })));
        
        // Set default origin and destination, but try to preserve existing selections if they exist
        if (data.directions && data.directions.length > 0) {
          const firstDirectionName = data.directions[0].name;
          const firstDirectionStops = data.stops.filter(
            (stop: BusStop) => stop.direction === firstDirectionName
          );
          
          console.log('First direction stops count:', firstDirectionStops.length);
          
          if (firstDirectionStops.length > 0) {
            const firstStop = firstDirectionStops[0];
            const lastStop = firstDirectionStops[firstDirectionStops.length - 1];
            
            // Check if we need to preserve user selections
            const allStopIds = data.stops.map((s: BusStop) => s.id);
            const shouldPreserveOrigin = preserveOriginId && allStopIds.includes(preserveOriginId);
            const shouldPreserveDestination = preserveDestinationId && allStopIds.includes(preserveDestinationId);
            
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
            
            console.log('Set origin/destination:', {
              preserved: {
                origin: shouldPreserveOrigin,
                destination: shouldPreserveDestination
              },
              origin: newOriginId,
              destination: newDestinationId
            });
          } else {
            console.warn('No stops found for the first direction:', firstDirectionName);
          }
        }
      } else {
        console.warn('No stops found in the API response');
        setStops([]);
        setDirections([]);
      }
    } catch (err) {
      console.error('Error fetching bus stops:', err);
      setStops([]);
      setDirections([]);
    } finally {
      setStopsLoading(false);
    }
  }, [updateUrl]); // Added updateUrl to dependency array

  // Load parameters from URL
  useEffect(() => {
    // Get parameters from URL
    if (query.get('busLine')) {
      const busLine = query.get('busLine') || 'MTA NYCT_B52';
      setBusLineId(busLine);
      // Fetch bus line details to update the display
      fetchBusLineDetails(busLine);
      // Also trigger fetching of stops for this line
      fetchStopsForLine(busLine, 
        query.get('originId') || undefined, 
        query.get('destinationId') || undefined);
      
      // Auto-expand settings panel when bus line is passed in URL
      setIsConfigOpen(true);
    } else {
      // If no bus line in URL, fetch the default line's stops
      fetchStopsForLine('MTA NYCT_B52', 
        query.get('originId') || undefined, 
        query.get('destinationId') || undefined);
    }
    if (query.get('originId')) {
      setOriginId(query.get('originId') || 'MTA_304213');
    }
    if (query.get('destinationId')) {
      setDestinationId(query.get('destinationId') || 'MTA_302434');
    }
    if (query.get('cutoff') === 'true') {
      setEnableCutoff(true);
      const timeQuery = query.get('time');
      setCutoffTime(timeQuery || '08:00');
    }
  }, [query, fetchStopsForLine]);

  // At component mount, pre-fetch stop info for the default stops 
  // to ensure they have proper names on first render
  useEffect(() => {
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
    // Swap origin and destination
    const tempOrigin = originId;
    setOriginId(destinationId);
    setDestinationId(tempOrigin);
    
    // If we have more than one direction, also flip the selected direction
    if (directions.length > 1) {
      const currentDirIndex = directions.findIndex(d => d.id === selectedDirection);
      if (currentDirIndex !== -1) {
        // Get the opposite direction index
        const newDirIndex = (currentDirIndex + 1) % directions.length;
        setSelectedDirection(directions[newDirIndex].id);
        console.log(`Swapped direction from ${directions[currentDirIndex].name} to ${directions[newDirIndex].name}`);
      }
    }
    
    updateUrl({ originId: destinationId, destinationId: tempOrigin });
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
          // Log the raw bus data to debug
          console.log('Raw bus data from API:', data.buses);
          
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
            
            // Log each bus to debug arrival time consistency
            console.log(`Bus ${bus.vehicleRef} - Origin arrival: ${bus.originArrival}, Destination arrival: ${bus.destinationArrival}, Stops away: ${bus.originStopsAway}`);
            
            const result = {
              vehicleId: bus.vehicleRef,
              originArrival: originArrival || new Date(), // Fallback to current time if invalid
              stopsAway: bus.originStopsAway, // Always a number now
              destinationArrival: destinationArrival, // Can be null if not available
              destination: bus.destination,
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
    if (!direction) {
      console.warn('No direction found with id:', selectedDirection);
      return [];
    }
    
    const filteredStops = stops.filter(stop => stop.direction === direction.name);
    console.log('Filtered stops for direction', direction.name, ':', filteredStops.length);
    
    if (filteredStops.length === 0) {
      console.warn('No stops found for direction:', direction.name);
      
      // If no stops match the exact direction name, try a more flexible approach
      // Sometimes API direction names might have slight differences
      const allDirectionNames = [...new Set(stops.map(s => s.direction))];
      console.log('Available direction names in stops:', allDirectionNames);
      
      // Try to find a direction name that contains our direction name or vice versa
      const similarDirection = allDirectionNames.find(
        dirName => dirName.includes(direction.name) || direction.name.includes(dirName)
      );
      
      if (similarDirection) {
        console.log('Found similar direction name:', similarDirection);
        const directionStops = stops.filter(s => s.direction === similarDirection)
          .map(s => ({
            value: s.id,
            label: s.name
          }));
        
        if (directionStops.length > 0) {
          return directionStops;
        }
      }
    }
    
    return filteredStops.map(stop => ({
      value: stop.id,
      label: stop.name
    }));
  }, [directions, selectedDirection, stops]);
  
  // Make sure we only compute currentStops once
  const currentStops = React.useMemo(() => {
    const directionStops = getDirectionStops();
    console.log('Current stops count:', directionStops.length);
    return directionStops.length > 0 ? directionStops : DEFAULT_STOPS;
  }, [getDirectionStops]);

  return (
    <div className="max-w-lg mx-auto bg-white rounded-lg shadow-md">
      <div className="bg-blue-500 text-white p-6 rounded-t-lg">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          🚍 Bus Tracker
          <button 
            onClick={() => setIsConfigOpen(!isConfigOpen)} 
            className="ml-auto text-sm bg-blue-600 px-3 py-1 rounded-full hover:bg-blue-700"
          >
            {isConfigOpen ? 'Hide Settings' : 'Settings'}
          </button>
        </h1>

        {isConfigOpen && (
          <div className="mt-4 space-y-3 p-3 bg-blue-600 rounded-lg">
            <div className="relative">
              <label className="text-sm mb-1 block">Bus Line</label>
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
            
            <div className="flex space-x-2">
              <div className="flex-1">
                <label className="text-sm mb-1 block">Origin</label>
                <select 
                  value={originId} 
                  onChange={(e) => handleOriginChange(e.target.value)}
                  className="text-gray-800 rounded px-2 py-1 w-full"
                >
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
                >
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
                  className={`p-4 rounded-lg ${
                    destinationStatus === 'late' ? 'bg-gray-50 border-l-4 border-red-500' : 
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
                      <span className="text-gray-600 text-base">@ {formatTime(bus.destinationArrival || null)}</span>
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
