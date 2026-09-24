export interface PlaybackSettings {
  id: number;
  song_id: number;
  start_time: number;
  end_time: number | null;
  transition_duration: number;
  transition_type: string;
  playback_speed: number;
}

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
  cut_sections: string | null;
  created_at: string;
  categories: CategoryInSong[];
  stems: StemInSong[];
  playback_settings: PlaybackSettings | null;
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
  title?: string;
}

export type DeckId = 'A' | 'B';

export interface MuteSection {
  start: number;
  end: number;
}

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
  muteSections: MuteSection[];
  muteSectionsActive: boolean;
}

export interface MidiMapping {
  channel: number;
  control: number;
  type: 'cc' | 'note';
  action: string;
  deckId?: DeckId;
}

// Sessions
export interface SessionListItem {
  id: number;
  name: string;
  share_code: string;
  has_password: boolean;
  is_public: boolean;
  allow_suggestions: boolean;
  parent_session_id: number | null;
  created_at: string;
  updated_at: string;
  item_count: number;
  pending_suggestions: number;
}

export interface SessionNote {
  id: number;
  session_id: number;
  content: string;
  author_name: string;
  created_at: string;
}

export interface SessionFolder {
  id: number;
  session_id: number;
  name: string;
  color: string;
  position: number;
}

export interface SessionData {
  id: number;
  name: string;
  share_code: string;
  has_password: boolean;
  is_public: boolean;
  allow_suggestions: boolean;
  parent_session_id: number | null;
  created_at: string;
  updated_at: string;
  items: SessionItem[];
  folders: SessionFolder[];
  suggestions: Suggestion[];
  notes: SessionNote[];
}

export interface SessionItem {
  id: number;
  session_id: number;
  song_id: number;
  position: number;
  folder_id: number | null;
  folder_position: number | null;
  is_played: boolean;
  played_at: string | null;
  added_by: string;
  notes: string;
  separator_text: string | null;
  // Per-session playback settings (override song-level when set)
  start_time: number | null;
  end_time: number | null;
  transition_duration: number | null;
  transition_type: string | null;
  playback_speed: number | null;
  mute_sections: string | null;
  song: Song;
}

/** Resolve effective playback settings: session-item overrides > song-level > defaults */
export function getEffectivePlaybackSettings(item: SessionItem): {
  start_time: number;
  end_time: number | null;
  transition_duration: number;
  transition_type: string;
  playback_speed: number;
} {
  const ps = item.song.playback_settings;
  return {
    start_time: item.start_time ?? ps?.start_time ?? 0,
    end_time: item.end_time ?? ps?.end_time ?? null,
    transition_duration: item.transition_duration ?? ps?.transition_duration ?? 4,
    transition_type: item.transition_type ?? ps?.transition_type ?? 'smooth',
    playback_speed: item.playback_speed ?? ps?.playback_speed ?? 1.0,
  };
}

/** Normalize text for search: lowercase, strip accents/diacritics */
function normalizeSearch(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Tokenized search: every word in the query must appear somewhere in title or artist */
export function matchesSearch(query: string, title: string, artist: string): boolean {
  if (!query) return true;
  const normalizedTitle = normalizeSearch(title);
  const normalizedArtist = normalizeSearch(artist);
  const combined = normalizedTitle + ' ' + normalizedArtist;
  const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);
  return tokens.every(token => combined.includes(token));
}

/** Parse mute_sections JSON from a session item into typed array */
export function getEffectiveMuteSections(item: SessionItem): MuteSection[] {
  if (!item.mute_sections) return [];
  try { return JSON.parse(item.mute_sections); } catch { return []; }
}

/** Parse cut_sections JSON from the song (song-level, not per-session) */
export function getEffectiveCutSections(item: SessionItem): MuteSection[] {
  if (!item.song.cut_sections) return [];
  try { return JSON.parse(item.song.cut_sections); } catch { return []; }
}

export interface Suggestion {
  id: number;
  session_id: number;
  suggestion_type: string;
  youtube_url: string | null;
  youtube_title: string | null;
  youtube_thumbnail: string | null;
  manual_title: string | null;
  manual_artist: string | null;
  status: string;
  submitted_by: string;
  created_at: string;
  reviewed_at: string | null;
}

export interface QueueEntry {
  item: SessionItem;
  source: 'manual';
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
