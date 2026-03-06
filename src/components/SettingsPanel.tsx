import React from 'react';
import { Dialog, DialogPanel, DialogBackdrop } from '@headlessui/react';
import { BusLine, BusStop, Direction, NearbyBusLine } from '@/types';
import BusLineSearch from './BusLineSearch';
import DirectionSelector from './DirectionSelector';
import StopSelectors from './StopSelectors';
import CutoffTimePicker from './CutoffTimePicker';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
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

const SettingsPanel = ({
  isOpen,
  onClose,
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
}: SettingsPanelProps) => {
  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />

      <div className="fixed inset-0 flex items-end justify-center">
        <DialogPanel className="w-full max-w-xl bg-[var(--bg)] rounded-t-2xl shadow-lg animate-slide-up max-h-[85vh] overflow-auto">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-[var(--border-light)] rounded-full" />
          </div>

          <div className="px-5 pb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Settings</h2>
            <button onClick={onClose} className="btn-ghost text-sm">
              Done
            </button>
          </div>

          <div className="px-5 pb-6 space-y-5">
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
              <div className="p-3 bg-amber-50 text-amber-800 text-sm font-medium rounded-lg border border-amber-200">
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
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <div className="animate-spin h-4 w-4 border-2 border-[var(--accent)] border-t-transparent rounded-full"></div>
                <span>Loading stops...</span>
              </div>
            )}

            <CutoffTimePicker
              enableCutoff={enableCutoff}
              cutoffTime={cutoffTime}
              onCutoffChange={onCutoffChange}
              onCutoffTimeChange={onCutoffTimeChange}
            />

            <button
              onClick={() => { onReset(); onClose(); }}
              className="w-full py-2.5 text-sm font-medium text-[var(--status-danger)] bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              Reset Route
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};

export default SettingsPanel;
