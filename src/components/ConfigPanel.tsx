import React from 'react';
import { BusLine, BusStop, Direction, NearbyBusLine } from '@/types';
import BusLineSearch from './BusLineSearch';
import DirectionSelector from './DirectionSelector';
import StopSelectors from './StopSelectors';
import CutoffTimePicker from './CutoffTimePicker';

interface ConfigPanelProps {
  busLineSearch: string;
  busLineId: string;
  geoLoading: boolean;
  geoError: string | null;
  showBusLineResults: boolean;
  busLineResults: (BusLine | NearbyBusLine)[];
  busStopError: string | null;
  directions: Direction[];
  selectedDirection: string;
  currentStops: BusStop[];
  originId: string;
  destinationId: string;
  stopsLoading: boolean;
  enableCutoff: boolean;
  cutoffTime: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onInputFocus: () => void;
  onGeolocation: () => void;
  onSelectBusLine: (line: BusLine) => void;
  onReset: () => void;
  onDirectionChange: (direction: string) => void;
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onSwapDirections: () => void;
  onCutoffChange: (value: boolean) => void;
  onCutoffTimeChange: (time: string) => void;
}

const ConfigPanel = ({
  busLineSearch,
  busLineId,
  geoLoading,
  geoError,
  showBusLineResults,
  busLineResults,
  busStopError,
  directions,
  selectedDirection,
  currentStops,
  originId,
  destinationId,
  stopsLoading,
  enableCutoff,
  cutoffTime,
  onSearchChange,
  onInputFocus,
  onGeolocation,
  onSelectBusLine,
  onReset,
  onDirectionChange,
  onOriginChange,
  onDestinationChange,
  onSwapDirections,
  onCutoffChange,
  onCutoffTimeChange,
}: ConfigPanelProps) => {
  return (
    <div className="border-t-[3px] border-[var(--black)] p-6 space-y-5 bg-[var(--concrete-dark)]">
      <BusLineSearch
        busLineSearch={busLineSearch}
        geoLoading={geoLoading}
        geoError={geoError}
        showBusLineResults={showBusLineResults}
        busLineResults={busLineResults}
        onSearchChange={onSearchChange}
        onInputFocus={onInputFocus}
        onGeolocation={onGeolocation}
        onSelectBusLine={onSelectBusLine}
        onReset={onReset}
      />

      {busStopError && (
        <div className="p-3 bg-[var(--mta-yellow)] text-[var(--black)] text-sm font-medium border-l-4 border-[var(--black)]">
          {busStopError}
        </div>
      )}

      {busLineId && directions.length > 0 && (
        <DirectionSelector
          directions={directions}
          selectedDirection={selectedDirection}
          currentStopsCount={currentStops.length}
          onDirectionChange={onDirectionChange}
        />
      )}

      <StopSelectors
        originId={originId}
        destinationId={destinationId}
        busLineId={busLineId}
        selectedDirection={selectedDirection}
        currentStops={currentStops}
        directionsCount={directions.length}
        onOriginChange={onOriginChange}
        onDestinationChange={onDestinationChange}
        onSwapDirections={onSwapDirections}
      />

      {stopsLoading && (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <div className="animate-spin h-4 w-4 border-2 border-[var(--black)] border-t-transparent"></div>
          <span className="font-mono">LOADING...</span>
        </div>
      )}

      <CutoffTimePicker
        enableCutoff={enableCutoff}
        cutoffTime={cutoffTime}
        onCutoffChange={onCutoffChange}
        onCutoffTimeChange={onCutoffTimeChange}
      />
    </div>
  );
};

export default ConfigPanel;
