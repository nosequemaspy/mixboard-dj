import { create } from 'zustand';
import type { BackgroundTaskInfo } from '../types';

type ViewPanel = 'library' | 'download' | 'editor' | 'settings' | 'sessions';

interface MixerStore {
  activePanel: ViewPanel;
  tasks: Map<string, BackgroundTaskInfo>;
  midiLearnMode: boolean;
  midiLearnTarget: string | null;
  setActivePanel: (panel: ViewPanel) => void;
  updateTask: (task: BackgroundTaskInfo) => void;
  removeTask: (taskId: string) => void;
  setMidiLearnMode: (enabled: boolean, target?: string) => void;
}

export const useMixerStore = create<MixerStore>((set) => ({
  activePanel: 'library',
  tasks: new Map(),
  midiLearnMode: false,
  midiLearnTarget: null,
  setActivePanel: (panel) => set({ activePanel: panel }),
  updateTask: (task) => set(state => {
    const tasks = new Map(state.tasks);
    tasks.set(task.task_id, task);
    return { tasks };
  }),
  removeTask: (taskId) => set(state => {
    const tasks = new Map(state.tasks);
    tasks.delete(taskId);
    return { tasks };
  }),
  setMidiLearnMode: (enabled, target) => set({
    midiLearnMode: enabled,
    midiLearnTarget: target || null,
  }),
}));
