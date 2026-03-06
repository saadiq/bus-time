import React from 'react';
import { Switch } from '@headlessui/react';
import { useSettings } from '@/contexts/SettingsContext';

const CutoffSection = () => {
  const { enableCutoff, cutoffTime, onCutoffChange, onCutoffTimeChange } = useSettings();

  return (
    <div className="pt-4 border-t border-[var(--border-light)]">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <Switch
            checked={enableCutoff}
            onChange={onCutoffChange}
            className={`${enableCutoff ? 'bg-[var(--accent)]' : 'bg-gray-200'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}
          >
            <span className={`${enableCutoff ? 'translate-x-5' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm`} />
          </Switch>
          <span className="text-sm font-medium text-[var(--text-primary)]">Arrive by</span>
        </div>
        <input
          type="time"
          value={cutoffTime}
          onChange={(e) => onCutoffTimeChange(e.target.value)}
          className="input text-sm"
          disabled={!enableCutoff}
        />
      </div>
    </div>
  );
};

export default CutoffSection;
