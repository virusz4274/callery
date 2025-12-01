
export type CallRecording = {
  id: string;
  contactName: string | null;
  phoneNumber: string;
  date: string; // ISO string
  duration: number; // in seconds
  filePath: string;
  transcriptSnippet: string;
};

export type Contact = {
  name: string;
  phoneNumber: string;
  plan: 'Free' | 'Pro';
  storageUsed: number; // in GB
  transcriptionUsed: number; // in minutes
  storageAllocation: number; // in GB
  transcriptionAllocation: number; // in minutes
};

export type FileSystemNode = {
  id: string;
  name: string;
  type: 'folder' | 'file';
  lastModified: string; // ISO string
  size?: string;
  children?: FileSystemNode[];
};

export type Invoice = {
    id: string;
    date: string; // ISO string
    amount: number;
    status: 'Paid' | 'Pending' | 'Failed';
};
