import React from 'react';
import { Direction } from '@/types';

interface DirectionSelectorProps {
  directions: Direction[];
  selectedDirection: string;
  currentStopsCount: number;
  onDirectionChange: (direction: string) => void;
}

const DirectionSelector = ({
  directions,
  selectedDirection,
  currentStopsCount,
  onDirectionChange,
}: DirectionSelectorProps) => {
  return (
    <div>
      <label className="font-display text-sm tracking-wide block mb-2">DIRECTION</label>
      <select
        value={selectedDirection}
        onChange={(e) => onDirectionChange(e.target.value)}
        className="brutal-select w-full"
      >
        {directions.map((direction, index) => (
          <option key={`dir-${direction.id}-${index}`} value={direction.id}>
            {direction.name}
          </option>
        ))}
      </select>
      <p className="text-xs text-[var(--muted)] mt-1 font-mono">
        {currentStopsCount} STOPS
      </p>
    </div>
  );
};

export default DirectionSelector;
