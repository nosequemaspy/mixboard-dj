export interface Song {
  id: number;
  title: string;
  artist: string;
  duration_seconds: number;
  bpm: number | null;
  key: string | null;
  file_path: string;
  file_format: string;
  source_url: string | null;
  source_type: string;
  stems_status: string;
  waveform_peaks: string | null;
  created_at: string;
  categories: CategoryInSong[];
  stems: StemInSong[];
}

export interface CategoryInSong {
  id: number;
  name: string;
  color: string;
}

export interface StemInSong {
  id: number;
  stem_type: string;
  file_path: string;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  song_count: number;
}

export interface Playlist {
  id: number;
  name: string;
  description: string;
  event_date: string | null;
  is_active: boolean;
  created_at: string;
  items: PlaylistItem[];
}

export interface PlaylistItem {
  id: number;
  playlist_id: number;
  song_id: number;
  position: number;
  is_played: boolean;
  played_at: string | null;
  notes: string;
  song: Song;
}

export interface Stem {
  id: number;
  song_id: number;
  stem_type: string;
  file_path: string;
  model_used: string;
  created_at: string;
}

export interface EditedSong {
  id: number;
  original_song_id: number;
  name: string;
  file_path: string;
  edit_type: string;
  edit_metadata: string;
  duration_seconds: number;
  created_at: string;
}

export interface DownloadPreview {
  title: string;
  artist: string;
  duration_seconds: number;
  thumbnail_url: string | null;
  url: string;
}

export interface BackgroundTaskInfo {
  task_id: string;
  progress: number;
  status: string;
  error?: string;
  song_id?: number;
}

export type DeckId = 'A' | 'B';

export interface DeckState {
  id: DeckId;
  song: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  tempo: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  vocalMuted: boolean;
  cuePoint: number;
}

export interface MidiMapping {
  channel: number;
  control: number;
  type: 'cc' | 'note';
  action: string;
  deckId?: DeckId;
}

export type CrossfaderCurve = 'smooth' | 'sharp' | 'linear';

export interface AudioSettings {
  masterDeviceId: string;
  headphoneDeviceId: string;
  masterVolume: number;
  headphoneVolume: number;
  headphoneCueMix: number;
  cueA: boolean;
  cueB: boolean;
  crossfaderCurve: CrossfaderCurve;
}
