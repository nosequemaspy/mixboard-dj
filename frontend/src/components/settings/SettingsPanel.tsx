import { useState } from 'react';
import { AudioSection } from './AudioSection';
import { MixerSection } from './MixerSection';
import { MidiSection } from './MidiSection';

type SettingsTab = 'audio' | 'mixer' | 'midi';

const tabs: { id: SettingsTab; label: string }[] = [
  { id: 'audio', label: 'Audio' },
  { id: 'mixer', label: 'Mixer' },
  { id: 'midi', label: 'MIDI' },
];

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('audio');

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-bg-secondary">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted mr-2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        <span className="text-sm font-semibold text-text-primary mr-4">Settings</span>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'audio' && <AudioSection />}
        {activeTab === 'mixer' && <MixerSection />}
        {activeTab === 'midi' && <MidiSection />}
      </div>
    </div>
  );
}
