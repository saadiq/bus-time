import React from 'react';
import { BusLine, NearbyBusLine } from '@/types';

interface BusLineSearchProps {
  busLineSearch: string;
  geoLoading: boolean;
  geoError: string | null;
  showBusLineResults: boolean;
  busLineResults: (BusLine | NearbyBusLine)[];
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onInputFocus: () => void;
  onGeolocation: () => void;
  onSelectBusLine: (line: BusLine) => void;
  onReset: () => void;
}

const BusLineSearch = ({
  busLineSearch,
  geoLoading,
  geoError,
  showBusLineResults,
  busLineResults,
  onSearchChange,
  onInputFocus,
  onGeolocation,
  onSelectBusLine,
  onReset,
}: BusLineSearchProps) => {
  return (
    <div className="relative">
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-semibold text-[var(--text-primary)]">Bus Line</label>
        <button
          onClick={onReset}
          className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          Reset
        </button>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={busLineSearch}
          onChange={onSearchChange}
          onFocus={onInputFocus}
          placeholder="Type route (e.g. B52, M15)"
          className="input flex-1"
        />
        <button
          onClick={onGeolocation}
          disabled={geoLoading}
          className="btn px-3"
          title="Find nearby bus lines"
        >
          {geoLoading ? (
            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V2c0-.55-.45-1-1-1s-1 .45-1 1v1.06C6.83 3.52 3.52 6.83 3.06 11H2c-.55 0-1 .45-1 1s.45 1 1 1h1.06c.46 4.17 3.77 7.48 7.94 7.94V22c0 .55.45 1 1 1s1-.45 1-1v-1.06c4.17-.46 7.48-3.77 7.94-7.94H22c.55 0 1-.45 1-1s-.45-1-1-1h-1.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
            </svg>
          )}
        </button>
      </div>

      {geoError && (
        <div className="mt-2 p-3 bg-red-50 text-[var(--status-danger)] text-sm font-medium rounded-lg">
          {geoError}
        </div>
      )}

      {showBusLineResults && busLineResults.length > 0 && (
        <div className="absolute z-20 mt-1 left-0 right-0 bg-white rounded-xl shadow-lg border border-[var(--border-light)] max-h-60 overflow-auto">
          {busLineResults.map(line => (
            <div
              key={line.id}
              className="px-4 py-3 hover:bg-[var(--bg-card)] cursor-pointer border-b border-[var(--border-light)] last:border-b-0 transition-colors"
              onClick={() => onSelectBusLine(line as BusLine)}
            >
              <div className="text-sm font-semibold">{line.shortName}</div>
              <div className="text-xs text-[var(--text-secondary)]">{line.longName}</div>
              {'distance' in line && (
                <div className="text-xs font-medium text-[var(--accent)] mt-0.5">
                  {((line as NearbyBusLine).distance < 0.1
                    ? 'Nearby'
                    : `${(line as NearbyBusLine).distance.toFixed(1)} mi`)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BusLineSearch;
