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

const statusConfig = {
  late: { label: 'LATE', color: 'text-[var(--status-danger)]', border: 'status-bar--danger' },
  warning: { label: 'CUTTING IT CLOSE', color: 'text-[var(--status-warning)]', border: 'status-bar--warning' },
  normal: { label: 'ON TIME', color: 'text-[var(--status-good)]', border: 'status-bar--good' },
};

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
    <section className="flex-1 px-1">
      <div className="flex justify-between items-center px-3 py-2 text-xs text-[var(--text-muted)]">
        <span>
          {lastRefresh
            ? `Updated ${lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
            : '...'}
        </span>
        <span className={nextRefreshIn <= 5 ? 'animate-pulse-slow' : ''}>
          {nextRefreshIn}s
        </span>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="animate-spin h-6 w-6 border-2 border-[var(--accent)] border-t-transparent rounded-full"></div>
          <span className="text-sm text-[var(--text-secondary)]">Loading arrivals...</span>
        </div>
      )}

      {error && (
        <div className="mx-2 p-4 bg-red-50 text-[var(--status-danger)] rounded-xl">
          <p className="font-medium text-sm">{error}</p>
          <p className="text-xs mt-1 opacity-70">Try different stops or route.</p>
        </div>
      )}

      {!loading && !error && arrivals.length === 0 && (
        <div className="py-16 text-center">
          <div className="text-5xl mb-3 opacity-30">&#128652;</div>
          <p className="text-lg font-semibold text-[var(--text-secondary)]">No buses right now</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">None scheduled at this time</p>
        </div>
      )}

      {!loading && !error && arrivals.length > 0 && (
        <div className="space-y-3 stagger-children px-1">
          {arrivals.map((bus) => {
            const destinationStatus = bus.destinationArrival ? getBusStatus(bus.destinationArrival) : 'normal';
            const config = statusConfig[destinationStatus as keyof typeof statusConfig] || statusConfig.normal;

            return (
              <div
                key={bus.vehicleId}
                className="card flex overflow-hidden"
              >
                <div className={`status-bar ${config.border}`}></div>

                <div className="flex-1 p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-bold leading-none tracking-tight">{getMinutesUntil(bus.originArrival)}</span>
                      <span className="text-base font-medium text-[var(--text-muted)]">min</span>
                    </div>
                    <div className="mt-1">
                      <span className={`text-xs font-semibold ${config.color}`}>
                        {config.label}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-[var(--text-muted)]">
                      {bus.stopsAway} {bus.stopsAway === 1 ? 'stop' : 'stops'} away
                    </div>
                    <div className="text-base font-semibold mt-0.5">
                      {bus.isEstimated && <span className="text-[var(--text-muted)]">~</span>}
                      {formatTime(bus.destinationArrival)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default ArrivalsDisplay;
