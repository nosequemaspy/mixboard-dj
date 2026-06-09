import type { DeckId, MidiMapping } from '../types';

type MidiActionHandler = (action: string, value: number, deckId?: DeckId) => void;
type MidiLearnCallback = (channel: number, control: number, type: 'cc' | 'note') => void;

const DDJ_REV7_DEFAULTS: MidiMapping[] = [
  // Deck A
  { channel: 0, control: 0x0B, type: 'note', action: 'play', deckId: 'A' },
  { channel: 0, control: 0x0C, type: 'note', action: 'cue', deckId: 'A' },
  { channel: 0, control: 0x58, type: 'note', action: 'sync', deckId: 'A' },
  { channel: 0, control: 0x13, type: 'cc', action: 'volume', deckId: 'A' },
  { channel: 0, control: 0x17, type: 'cc', action: 'eq_high', deckId: 'A' },
  { channel: 0, control: 0x16, type: 'cc', action: 'eq_mid', deckId: 'A' },
  { channel: 0, control: 0x15, type: 'cc', action: 'eq_low', deckId: 'A' },
  { channel: 0, control: 0x00, type: 'cc', action: 'tempo', deckId: 'A' },
  // Deck B
  { channel: 1, control: 0x0B, type: 'note', action: 'play', deckId: 'B' },
  { channel: 1, control: 0x0C, type: 'note', action: 'cue', deckId: 'B' },
  { channel: 1, control: 0x58, type: 'note', action: 'sync', deckId: 'B' },
  { channel: 1, control: 0x13, type: 'cc', action: 'volume', deckId: 'B' },
  { channel: 1, control: 0x17, type: 'cc', action: 'eq_high', deckId: 'B' },
  { channel: 1, control: 0x16, type: 'cc', action: 'eq_mid', deckId: 'B' },
  { channel: 1, control: 0x15, type: 'cc', action: 'eq_low', deckId: 'B' },
  { channel: 1, control: 0x00, type: 'cc', action: 'tempo', deckId: 'B' },
  // Crossfader
  { channel: 0, control: 0x1F, type: 'cc', action: 'crossfader' },
];

const STORAGE_KEY = 'mixboard_midi_mappings';

export class MidiEngine {
  private access: MIDIAccess | null = null;
  private mappings: MidiMapping[] = [];
  private actionHandler: MidiActionHandler | null = null;
  private learnCallback: MidiLearnCallback | null = null;
  private learnMode = false;

  async init() {
    if (!navigator.requestMIDIAccess) return;
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.loadMappings();
      this.access.inputs.forEach(input => this.attachInput(input));
      this.access.onstatechange = (e) => {
        const port = (e as MIDIConnectionEvent).port;
        if (port && port.type === 'input' && port.state === 'connected') {
          this.attachInput(port as MIDIInput);
        }
      };
    } catch {
      console.warn('MIDI not available');
    }
  }

  private attachInput(input: MIDIInput) {
    input.onmidimessage = (e) => this.handleMessage(e);
  }

  private handleMessage(e: MIDIMessageEvent) {
    if (!e.data || e.data.length < 3) return;
    const status = e.data[0];
    const control = e.data[1];
    const value = e.data[2];
    const channel = status & 0x0F;
    const msgType = status & 0xF0;

    let type: 'cc' | 'note';
    if (msgType === 0xB0) type = 'cc';
    else if (msgType === 0x90 || msgType === 0x80) type = 'note';
    else return;

    // MIDI Learn mode
    if (this.learnMode && this.learnCallback && value > 0) {
      this.learnCallback(channel, control, type);
      return;
    }

    // Find mapping
    const mapping = this.mappings.find(
      m => m.channel === channel && m.control === control && m.type === type
    );
    if (mapping && this.actionHandler) {
      const normalizedValue = type === 'note' ? (value > 0 ? 1 : 0) : value / 127;
      this.actionHandler(mapping.action, normalizedValue, mapping.deckId);
    }
  }

  setActionHandler(handler: MidiActionHandler) {
    this.actionHandler = handler;
  }

  startLearn(callback: MidiLearnCallback) {
    this.learnMode = true;
    this.learnCallback = callback;
  }

  stopLearn() {
    this.learnMode = false;
    this.learnCallback = null;
  }

  addMapping(mapping: MidiMapping) {
    // Remove existing mapping for same control
    this.mappings = this.mappings.filter(
      m => !(m.channel === mapping.channel && m.control === mapping.control && m.type === mapping.type)
    );
    this.mappings.push(mapping);
    this.saveMappings();
  }

  removeMapping(action: string, deckId?: DeckId) {
    this.mappings = this.mappings.filter(
      m => !(m.action === action && m.deckId === deckId)
    );
    this.saveMappings();
  }

  resetToDefaults() {
    this.mappings = [...DDJ_REV7_DEFAULTS];
    this.saveMappings();
  }

  getMappings(): MidiMapping[] {
    return [...this.mappings];
  }

  getDevices(): string[] {
    if (!this.access) return [];
    const names: string[] = [];
    this.access.inputs.forEach(input => {
      if (input.name) names.push(input.name);
    });
    return names;
  }

  private loadMappings() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.mappings = JSON.parse(stored);
      } else {
        this.mappings = [...DDJ_REV7_DEFAULTS];
      }
    } catch {
      this.mappings = [...DDJ_REV7_DEFAULTS];
    }
  }

  private saveMappings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.mappings));
  }

  destroy() {
    if (this.access) {
      this.access.inputs.forEach(input => {
        input.onmidimessage = null;
      });
    }
  }
}
