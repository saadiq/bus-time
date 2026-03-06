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
      <label className="text-sm font-semibold text-[var(--text-primary)] block mb-2">Direction</label>
      <select
        value={selectedDirection}
        onChange={(e) => onDirectionChange(e.target.value)}
        className="select w-full"
      >
        {directions.map((direction, index) => (
          <option key={`dir-${direction.id}-${index}`} value={direction.id}>
            {direction.name}
          </option>
        ))}
      </select>
      <p className="text-xs text-[var(--text-muted)] mt-1">
        {currentStopsCount} stops
      </p>
    </div>
  );
};

export default DirectionSelector;
