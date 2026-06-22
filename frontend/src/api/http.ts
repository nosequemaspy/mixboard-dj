const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

function passwordHeaders(password?: string): Record<string, string> {
  if (!password) return {};
  return { 'X-Session-Password': password };
}

export const api = {
  // Songs
  getSongs: (params?: { search?: string; category_id?: number; sort_by?: string; sort_dir?: string }) => {
    const sp = new URLSearchParams();
    if (params?.search) sp.set('search', params.search);
    if (params?.category_id) sp.set('category_id', String(params.category_id));
    if (params?.sort_by) sp.set('sort_by', params.sort_by);
    if (params?.sort_dir) sp.set('sort_dir', params.sort_dir);
    return request<{ songs: any[]; total: number }>(`/songs?${sp}`);
  },
  getSong: (id: number) => request<any>(`/songs/${id}`),
  uploadSong: async (file: File, title?: string, artist?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (title) form.append('title', title);
    if (artist) form.append('artist', artist);
    const res = await fetch(`${API_BASE}/songs/upload`, { method: 'POST', body: form });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  },
  updateSong: (id: number, data: any) => request<any>(`/songs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSong: (id: number) => request<any>(`/songs/${id}`, { method: 'DELETE' }),

  // Categories
  getCategories: () => request<any[]>('/categories'),
  createCategory: (data: any) => request<any>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: number, data: any) => request<any>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id: number) => request<any>(`/categories/${id}`, { method: 'DELETE' }),

  // Playlists
  getPlaylists: () => request<any[]>('/playlists'),
  getPlaylist: (id: number) => request<any>(`/playlists/${id}`),
  createPlaylist: (data: any) => request<any>('/playlists', { method: 'POST', body: JSON.stringify(data) }),
  updatePlaylist: (id: number, data: any) => request<any>(`/playlists/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePlaylist: (id: number) => request<any>(`/playlists/${id}`, { method: 'DELETE' }),
  addPlaylistItem: (playlistId: number, data: any) =>
    request<any>(`/playlists/${playlistId}/items`, { method: 'POST', body: JSON.stringify(data) }),
  updatePlaylistItem: (playlistId: number, itemId: number, data: any) =>
    request<any>(`/playlists/${playlistId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) }),
  removePlaylistItem: (playlistId: number, itemId: number) =>
    request<any>(`/playlists/${playlistId}/items/${itemId}`, { method: 'DELETE' }),
  reorderPlaylistItems: (playlistId: number, itemIds: number[]) =>
    request<any>(`/playlists/${playlistId}/reorder`, { method: 'PUT', body: JSON.stringify(itemIds) }),

  // Stems
  getStems: (songId: number) => request<any[]>(`/stems/${songId}`),
  separateStems: (songId: number) =>
    request<any>('/stems/separate', { method: 'POST', body: JSON.stringify({ song_id: songId }) }),

  // Downloads
  previewDownload: (url: string) =>
    request<any>('/downloads/preview', { method: 'POST', body: JSON.stringify({ url }) }),
  startDownload: (url: string, title?: string, artist?: string) =>
    request<any>('/downloads/start', { method: 'POST', body: JSON.stringify({ url, title, artist }) }),

  // Audio
  streamUrl: (songId: number) => `${API_BASE}/audio/stream/${songId}`,
  stemUrl: (stemId: number) => `${API_BASE}/audio/stem/${stemId}`,
  stemByTypeUrl: (songId: number, stemType: string) => `${API_BASE}/audio/stem-by-type/${songId}/${stemType}`,
  editStreamUrl: (editId: number) => `${API_BASE}/audio/edit/${editId}`,
  getEdits: (songId: number) => request<any[]>(`/audio/edits/${songId}`),
  createEdit: (data: any) => request<any>('/audio/edit', { method: 'POST', body: JSON.stringify(data) }),
  deleteEdit: (editId: number) => request<any>(`/audio/edit/${editId}`, { method: 'DELETE' }),

  // Settings
  getSettings: () => request<any>('/settings'),
  updateSettings: (data: Record<string, unknown>) =>
    request<any>('/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // Sessions
  getSessions: () => request<any[]>('/sessions'),
  getSession: (id: number, password?: string) =>
    request<any>(`/sessions/${id}`, { headers: passwordHeaders(password) }),
  getSessionByCode: (code: string, password?: string) =>
    request<any>(`/sessions/by-code/${code}`, { headers: passwordHeaders(password) }),
  createSession: (data: any) => request<any>('/sessions', { method: 'POST', body: JSON.stringify(data) }),
  updateSession: (id: number, data: any, password?: string) =>
    request<any>(`/sessions/${id}`, { method: 'PUT', body: JSON.stringify(data), headers: passwordHeaders(password) }),
  deleteSession: (id: number, password?: string) =>
    request<any>(`/sessions/${id}`, { method: 'DELETE', headers: passwordHeaders(password) }),
  verifySessionPassword: (id: number, password: string) =>
    request<any>(`/sessions/${id}/verify`, { method: 'POST', body: JSON.stringify({ password }) }),
  duplicateSession: (id: number, data: any, password?: string) =>
    request<any>(`/sessions/${id}/duplicate`, { method: 'POST', body: JSON.stringify(data), headers: passwordHeaders(password) }),

  // Session Folders
  getSessionFolders: (sessionId: number) => request<any[]>(`/sessions/${sessionId}/folders`),
  createSessionFolder: (sessionId: number, data: { name: string; color?: string }, password?: string) =>
    request<any>(`/sessions/${sessionId}/folders`, { method: 'POST', body: JSON.stringify(data), headers: passwordHeaders(password) }),
  updateSessionFolder: (sessionId: number, folderId: number, data: { name?: string; color?: string }, password?: string) =>
    request<any>(`/sessions/${sessionId}/folders/${folderId}`, { method: 'PUT', body: JSON.stringify(data), headers: passwordHeaders(password) }),
  deleteSessionFolder: (sessionId: number, folderId: number, password?: string) =>
    request<any>(`/sessions/${sessionId}/folders/${folderId}`, { method: 'DELETE', headers: passwordHeaders(password) }),
  reorderSessionFolders: (sessionId: number, folderIds: number[], password?: string) =>
    request<any>(`/sessions/${sessionId}/folders/reorder`, { method: 'PUT', body: JSON.stringify(folderIds), headers: passwordHeaders(password) }),
  assignItemFolder: (sessionId: number, itemId: number, folderId: number | null, password?: string) =>
    request<any>(`/sessions/${sessionId}/items/${itemId}/assign-folder`, { method: 'PUT', body: JSON.stringify({ folder_id: folderId }), headers: passwordHeaders(password) }),
  reorderFolderItems: (sessionId: number, folderId: number, itemIds: number[], password?: string) =>
    request<any>(`/sessions/${sessionId}/folders/${folderId}/reorder`, { method: 'PUT', body: JSON.stringify(itemIds), headers: passwordHeaders(password) }),

  // Session Items
  getSessionItems: (sessionId: number) => request<any[]>(`/sessions/${sessionId}/items`),
  addSessionItem: (sessionId: number, data: any, password?: string) =>
    request<any>(`/sessions/${sessionId}/items`, { method: 'POST', body: JSON.stringify(data), headers: passwordHeaders(password) }),
  updateSessionItem: (sessionId: number, itemId: number, data: any, password?: string) =>
    request<any>(`/sessions/${sessionId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data), headers: passwordHeaders(password) }),
  removeSessionItem: (sessionId: number, itemId: number, password?: string) =>
    request<any>(`/sessions/${sessionId}/items/${itemId}`, { method: 'DELETE', headers: passwordHeaders(password) }),
  reorderSessionItems: (sessionId: number, itemIds: number[], password?: string) =>
    request<any>(`/sessions/${sessionId}/reorder`, { method: 'PUT', body: JSON.stringify(itemIds), headers: passwordHeaders(password) }),

  // Suggestions
  getSessionSuggestions: (sessionId: number) => request<any[]>(`/sessions/${sessionId}/suggestions`),
  createSuggestion: (sessionId: number, data: any) =>
    request<any>(`/sessions/${sessionId}/suggestions`, { method: 'POST', body: JSON.stringify(data) }),
  updateSuggestion: (sessionId: number, suggestionId: number, data: any, password?: string) =>
    request<any>(`/sessions/${sessionId}/suggestions/${suggestionId}`, { method: 'PUT', body: JSON.stringify(data), headers: passwordHeaders(password) }),
  deleteSuggestion: (sessionId: number, suggestionId: number, password?: string) =>
    request<any>(`/sessions/${sessionId}/suggestions/${suggestionId}`, { method: 'DELETE', headers: passwordHeaders(password) }),

  // Notes
  getSessionNotes: (sessionId: number) => request<any[]>(`/sessions/${sessionId}/notes`),
  createNote: (sessionId: number, data: { content: string; author_name?: string }) =>
    request<any>(`/sessions/${sessionId}/notes`, { method: 'POST', body: JSON.stringify(data) }),
  deleteNote: (sessionId: number, noteId: number, password?: string) =>
    request<any>(`/sessions/${sessionId}/notes/${noteId}`, { method: 'DELETE', headers: passwordHeaders(password) }),

  // YouTube oEmbed
  youtubeOembed: (url: string) => request<any>(`/youtube/oembed?url=${encodeURIComponent(url)}`),
};
