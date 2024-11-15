"use client";

import React, { useState, useEffect, Suspense } from 'react';
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

const POLLING_INTERVAL = 30000; // 30 seconds

const BusTrackerContent = () => {
  const router = useRouter();
  const query = useSearchParams();

  const [arrivals, setArrivals] = useState<BusArrival[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BusData | null>(null);
  const [cutoffTime, setCutoffTime] = useState('08:00');
  const [enableCutoff, setEnableCutoff] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [nextRefreshIn, setNextRefreshIn] = useState<number>(POLLING_INTERVAL / 1000);

  useEffect(() => {
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    if (query.get('cutoff') === 'true') {
      setEnableCutoff(true);
      const timeQuery = query.get('time');
      setCutoffTime(timeQuery || '08:00');
    }
  }, [query]);

  const handleCutoffChange = (value: boolean) => {
    setEnableCutoff(value);
    if (value) {
      router.replace(`?cutoff=true&time=${cutoffTime}`);
    } else {
      router.replace('/');
    }
  };

  const handleCutoffTimeChange = (time: string) => {
    setCutoffTime(time);
    if (enableCutoff) {
      router.replace(`?cutoff=true&time=${time}`);
    }
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
        const response = await fetch('/api/bus-times');
        if (!response.ok) throw new Error('Failed to fetch bus data');

        const data = await response.json();
        setData(data);
        setArrivals(data.buses.map((bus: BusResponse) => ({
          vehicleId: bus.vehicleRef,
          originArrival: new Date(bus.originArrival),
          stopsAway: bus.originStopsAway,
          destinationArrival: bus.destinationArrival ? new Date(bus.destinationArrival) : null,
          destination: bus.destination,
        })));
        setError(null);
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
  }, []);

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
    if (!date) return 'N/A';
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getMinutesUntil = (date: Date | null) => {
    if (!date) return 'N/A';
    const diff = date.getTime() - new Date().getTime();
    const minutes = Math.floor(diff / 60000);
    return minutes < 1 ? 'NOW' : minutes;
  };

  return (
    <div className="max-w-lg mx-auto bg-white rounded-lg shadow-md">
      <div className="bg-blue-500 text-white p-6 rounded-t-lg">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          🚍 Morning Commute
        </h1>
        <div className="text-sm mt-1">
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
        {error && <div className="text-red-500 text-center py-4">{error}</div>}
        {!loading && !error && arrivals.length === 0 && <div className="text-center py-4">No buses currently scheduled</div>}
        {!loading && !error && arrivals.length > 0 && (
          <div className="space-y-4">
            {arrivals.map((bus, index) => {
              const previousBus = arrivals.slice(0, index).reverse().find(b => b.destinationArrival);
              const previousStatus = previousBus && previousBus.destinationArrival 
                ? getBusStatus(previousBus.destinationArrival) 
                : 'normal';
              const status = bus.destinationArrival ? getBusStatus(bus.destinationArrival) : previousStatus;
              return (
                <div key={bus.vehicleId} className={`p-4 rounded-lg ${status === 'late' ? 'bg-red-50' : status === 'warning' ? 'bg-yellow-50' : 'bg-gray-50'}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-blue-500">🚌</span>
                      <div className="font-semibold text-gray-900">
                        {(() => {
                          const minutes = getMinutesUntil(bus.originArrival);
                          return minutes === 'NOW' ? 'NOW' : `${minutes} min`;
                        })()}
                      </div>
                      <span className="text-sm text-gray-500">
                        {bus.stopsAway === 0 ? '(here)' : `(${bus.stopsAway} ${bus.stopsAway === 1 ? 'stop' : 'stops'} away)`}
                      </span>                    
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-gray-400">→</div>
                      <div className="font-medium text-gray-600">@ {formatTime(bus.destinationArrival)}</div>
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
