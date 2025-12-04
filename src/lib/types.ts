
export type CallRecording = {
  id: string;
  contactName: string | null;
  phoneNumber: string;
  date: string; // ISO string
  duration: number; // in seconds
  filePath: string;
  transcriptSnippet: string;
};

// This was updated to match the UserProfile entity to allow for live data.
export type Contact = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string; // Keep for compatibility where name is used as combination
  phoneNumber: string;
  createdAt: any;
  role: 'user' | 'admin';
  plan: 'Free' | 'Pro';
  timezone: string;
  notificationSettings: {
    activityDigest: 'off' | 'weekly' | 'monthly';
    ingestSuccess: boolean;
    ingestFail: boolean;
  };
  storageSettings: {
    deletionPolicy: 'never' | '3m' | '6m' | '1y';
  };
  storageUsed: number;
  storageAllocation: number;
  transcriptionUsed: number;
  transcriptionAllocation: number;
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
