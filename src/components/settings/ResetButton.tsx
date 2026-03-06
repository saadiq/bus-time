import React from 'react';
import { useSettings } from '@/contexts/SettingsContext';

const ResetButton = () => {
  const { onReset, onClose } = useSettings();

  return (
    <button
      onClick={() => { onReset(); onClose(); }}
      className="w-full py-2.5 text-sm font-medium text-[var(--status-danger)] bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
    >
      Reset Route
    </button>
  );
};

export default ResetButton;
