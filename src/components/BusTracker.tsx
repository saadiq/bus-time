// src/components/BusTracker.tsx
"use client";

import React, { useState, useEffect } from 'react';

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

const BusTracker = () => {
  const [arrivals, setArrivals] = useState<BusArrival[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BusData | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/bus-times');

        if (!response.ok) {
          throw new Error('Failed to fetch bus data');
        }

        const data = await response.json();
        setData(data);
        setArrivals(data.buses.map((bus: BusResponse) => ({
          vehicleId: bus.vehicleRef,
          originArrival: new Date(bus.originArrival),
          stopsAway: bus.originStopsAway,
          destinationArrival: bus.destinationArrival ? new Date(bus.destinationArrival) : null,
          destination: bus.destination
        })));
        setError(null);
      } catch (err) {
        setError('Unable to load bus arrival times. Please try again later.');
        console.error('Error fetching bus data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date | null) => {
    return date?.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }) || 'N/A';
  };

  const getMinutesUntil = (date: Date | null) => {
    if (!date) return 'N/A';
    const diff = date.getTime() - new Date().getTime();
    const minutes = Math.round(diff / 60000);
    return `${minutes} min`;
  };

  return (
    <div className="max-w-lg mx-auto bg-white rounded-lg shadow-md">
      <div className="bg-blue-500 text-white p-6 rounded-t-lg">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          🚌 B52 Bus Arrivals
        </h1>
        <div className="text-sm mt-1">
          📍 {data?.originName} → {data?.destinationName}
        </div>
      </div>

      <div className="p-6">
        {loading && (
          <div className="text-center py-4">Loading arrival times...</div>
        )}
        
        {error && (
          <div className="text-red-500 text-center py-4">{error}</div>
        )}
        
        {!loading && !error && arrivals.length === 0 && (
          <div className="text-center py-4">No buses currently scheduled</div>
        )}
        
        {!loading && !error && arrivals.length > 0 && (
          <div className="space-y-4">
            {arrivals.map((bus) => (
              <div
                key={bus.vehicleId}
                className="p-4 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-500">🚌</span>
                    <span className="text-sm text-gray-500">
                      {bus.stopsAway === 0 ? 'approaching' : `${bus.stopsAway} stops away`}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="text-sm text-gray-500">{data?.originName}</div>
                    <div className="font-medium text-lg text-black">
                      in {getMinutesUntil(bus.originArrival)}
                    </div>
                  </div>
                  
                  <div className="text-gray-400">→</div>
                  
                  <div className="flex-1 text-right">
                    <div className="text-sm text-gray-500">{data?.destinationName}</div>
                    <div className="font-medium text-lg text-black">@ {formatTime(bus.destinationArrival)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BusTracker;
