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
};
