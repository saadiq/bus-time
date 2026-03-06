import React from 'react';
import { Dialog, DialogPanel, DialogBackdrop } from '@headlessui/react';
import { useSettings } from '@/contexts/SettingsContext';
import SearchSection from './settings/SearchSection';
import RouteSection from './settings/RouteSection';
import CutoffSection from './settings/CutoffSection';
import ResetButton from './settings/ResetButton';

const SettingsPanel = () => {
  const { isOpen, onClose } = useSettings();

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
            <SearchSection />
            <RouteSection />
            <CutoffSection />
            <ResetButton />
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};

export default SettingsPanel;
