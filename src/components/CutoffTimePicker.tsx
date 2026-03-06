import React from 'react';
import { Switch } from '@headlessui/react';

interface CutoffTimePickerProps {
  enableCutoff: boolean;
  cutoffTime: string;
  onCutoffChange: (value: boolean) => void;
  onCutoffTimeChange: (time: string) => void;
}

const CutoffTimePicker = ({
  enableCutoff,
  cutoffTime,
  onCutoffChange,
  onCutoffTimeChange,
}: CutoffTimePickerProps) => {
  return (
    <div className="pt-3 border-t-2 border-[var(--black)] border-dashed">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <Switch
            checked={enableCutoff}
            onChange={onCutoffChange}
            className={`${enableCutoff ? 'bg-[var(--mta-yellow)]' : 'bg-[var(--muted)]'} relative inline-flex h-6 w-11 items-center border-2 border-[var(--black)] transition-colors`}
          >
            <span className={`${enableCutoff ? 'translate-x-5' : 'translate-x-0'} inline-block h-5 w-5 transform bg-[var(--black)] transition-transform`} />
          </Switch>
          <span className="text-sm font-medium">ARRIVE BY</span>
        </div>
        <input
          type="time"
          value={cutoffTime}
          onChange={(e) => onCutoffTimeChange(e.target.value)}
          className="brutal-input text-sm font-mono"
          disabled={!enableCutoff}
        />
      </div>
    </div>
  );
};

export default CutoffTimePicker;
