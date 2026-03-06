import React from 'react';
import { BusArrival } from '@/types';

interface ArrivalsDisplayProps {
  loading: boolean;
  error: string | null;
  arrivals: BusArrival[];
  lastRefresh: Date | null;
  nextRefreshIn: number;
  getBusStatus: (arrivalTime: Date | null) => string;
  formatTime: (date: Date | null) => string;
  getMinutesUntil: (date: Date | null) => number | string;
}

const ArrivalsDisplay = ({
  loading,
  error,
  arrivals,
  lastRefresh,
  nextRefreshIn,
  getBusStatus,
  formatTime,
  getMinutesUntil,
}: ArrivalsDisplayProps) => {
  return (
    <section className="brutal-card border-t-0 min-h-[200px]">
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
                  <div className={`status-bar ${statusClass}`}></div>

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
  );
};

export default ArrivalsDisplay;
