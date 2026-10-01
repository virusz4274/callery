/**
 * Frontend type definitions.
 * Re-exports from db/types for consistency, keeping unique UI-only types here.
 */

// Re-export API response types for frontend use
export type {
  RecordingResponse,
  ContactResponse,
  UserResponse,
  TranscriptionSegment,
  TranscriptionWord,
} from './db/types';

// Type aliases for semantic clarity in UI code
export { type RecordingResponse as Recording } from './db/types';
export { type ContactResponse as Contact } from './db/types';
export { type UserResponse as User } from './db/types';

// UI-only types (not stored in MongoDB)

export type FileSystemNode = {
  id: string;
  name: string;
  type: 'folder' | 'file';
  lastModified: string;
  size?: string;
  children?: FileSystemNode[];
  /** Set on file nodes: the recording to open on click. */
  recordingId?: string;
};

export type Invoice = {
  id: string;
  date: string;
  amount: number;
  status: 'Paid' | 'Pending' | 'Failed';
};
