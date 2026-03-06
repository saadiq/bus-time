import React from 'react';
import { BusStop } from '@/types';

interface StopSelectorsProps {
  originId: string;
  destinationId: string;
  busLineId: string;
  selectedDirection: string;
  currentStops: BusStop[];
  directionsCount: number;
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onSwapDirections: () => void;
}

const StopSelectors = ({
  originId,
  destinationId,
  busLineId,
  selectedDirection,
  currentStops,
  directionsCount,
  onOriginChange,
  onDestinationChange,
  onSwapDirections,
}: StopSelectorsProps) => {
  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1">
        <label className="text-sm font-semibold text-[var(--text-primary)] block mb-2">From</label>
        <select
          value={originId}
          onChange={(e) => onOriginChange(e.target.value)}
          className="select w-full text-sm"
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
        onClick={onSwapDirections}
        className="btn-ghost p-2.5 mb-[1px] rounded-lg"
        aria-label="Switch direction"
        title={directionsCount > 1 ? "Switch to opposite direction" : "Swap origin and destination"}
        disabled={!busLineId || !selectedDirection}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4-4m-4 4l4 4" />
        </svg>
      </button>

      <div className="flex-1">
        <label className="text-sm font-semibold text-[var(--text-primary)] block mb-2">To</label>
        <select
          value={destinationId}
          onChange={(e) => onDestinationChange(e.target.value)}
          className="select w-full text-sm"
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
  );
};

export default StopSelectors;
