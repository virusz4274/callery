
import type { CallRecording, Contact } from '../types';

export const contacts: Contact[] = [
  {
    id: 'user_1',
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Johnson',
    name: 'Alice Johnson',
    phoneNumber: '+1-202-555-0182',
    plan: 'Pro',
    storageUsed: 4.2,
    transcriptionUsed: 125,
    storageAllocation: 5,
    transcriptionAllocation: 500,
    createdAt: new Date().toISOString(),
    role: 'user',
    timezone: 'America/New_York',
    notificationSettings: {
      activityDigest: 'weekly',
      ingestSuccess: true,
      ingestFail: true
    },
    storageSettings: {
      deletionPolicy: '1y'
    }
  },
  {
    id: 'user_2',
    email: 'bob@example.com',
    firstName: 'Bob',
    lastName: 'Williams',
    name: 'Bob Williams',
    phoneNumber: '+1-202-555-0191',
    plan: 'Pro',
    storageUsed: 8.1,
    transcriptionUsed: 450,
    storageAllocation: 10,
    transcriptionAllocation: 500,
    createdAt: new Date().toISOString(),
    role: 'user',
    timezone: 'America/Chicago',
    notificationSettings: {
      activityDigest: 'weekly',
      ingestSuccess: true,
      ingestFail: true
    },
    storageSettings: {
      deletionPolicy: 'never'
    }
  },
  {
    id: 'user_3',
    email: 'charlie@example.com',
    firstName: 'Charlie',
    lastName: 'Brown',
    name: 'Charlie Brown',
    phoneNumber: '+1-202-555-0143',
    plan: 'Free',
    storageUsed: 0.05,
    transcriptionUsed: 10,
    storageAllocation: 0.1,
    transcriptionAllocation: 15,
    createdAt: new Date().toISOString(),
    role: 'user',
    timezone: 'America/Los_Angeles',
    notificationSettings: {
      activityDigest: 'off',
      ingestSuccess: false,
      ingestFail: true
    },
    storageSettings: {
      deletionPolicy: '3m'
    }
  },
  {
    id: 'user_4',
    email: 'diana@example.com',
    firstName: 'Diana',
    lastName: 'Miller',
    name: 'Diana Miller',
    phoneNumber: '+1-202-555-0167',
    plan: 'Free',
    storageUsed: 0.09,
    transcriptionUsed: 2,
    storageAllocation: 0.1,
    transcriptionAllocation: 15,
    createdAt: new Date().toISOString(),
    role: 'user',
    timezone: 'America/Denver',
    notificationSettings: {
      activityDigest: 'monthly',
      ingestSuccess: true,
      ingestFail: false
    },
    storageSettings: {
      deletionPolicy: '6m'
    }
  },
];

const contactMap = new Map(contacts.map(c => [c.phoneNumber, c.name]));

const generateRecording = (id: number, daysAgo: number, phoneNumber: string, duration: number, transcript: string): CallRecording => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const contactName = contactMap.get(phoneNumber) || null;
  const contactDirName = (contactName || phoneNumber).replace(/[^a-zA-Z0-9-]/g, '_');
  const year = date.getFullYear().toString();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dateStr = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const timeStr = `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;

  return {
    id: `rec_${id}`,
    contactName: contactName,
    phoneNumber,
    date: date.toISOString(),
    duration,
    filePath: `recordings/${contactDirName}/${year}/${month}/${contactDirName}_${dateStr}_${timeStr}.m4a`,
    transcriptSnippet: transcript,
  };
};

const unsortedRecordings: CallRecording[] = [
  generateRecording(1, 2, '+1-202-555-0182', 185, "Hey Alice, just following up on our meeting from yesterday. I think we have a solid plan... This is a longer placeholder to demonstrate how the transcript section will look. It will contain the full text of the conversation once we implement the full transcription feature. For now, we are just using the snippet we already had available."),
  generateRecording(2, 3, '+1-202-555-0111', 45, "Hi, I'm calling about the recent advertisement. Can you provide more details? I am interested in the product you showcased on your website."),
  generateRecording(3, 5, '+1-202-555-0191', 320, "Bob, it's about the quarterly report. I need your slides by end of day tomorrow at the latest. The executive team is waiting for them. Please prioritize this."),
  generateRecording(4, 7, '+1-202-555-0167', 95, "Hi Diana, are you free for lunch next week? Maybe Tuesday? Let me know what works for you. I'd love to catch up."),
  generateRecording(5, 10, '+1-202-555-0182', 610, "Alice, great news! The client approved the proposal. We're moving forward with phase two. Let's schedule a kickoff meeting for next week."),
  generateRecording(6, 12, '+1-202-555-0123', 120, "This is a reminder for your dental appointment tomorrow at 10:30 AM. To confirm, please press 1. To reschedule, please press 2."),
  generateRecording(7, 15, '+1-202-555-0143', 240, "Charlie, just wanted to check in on the project timeline. Are we still on track for the deadline? Let me know if you are facing any blockers."),
  generateRecording(8, 20, '+1-202-555-0191', 150, "Hey Bob, I saw your email. I'll get back to you with the figures shortly. Just need to compile them from the latest sales data."),
  generateRecording(9, 25, '+1-202-555-0182', 480, "Alice, I've hit a roadblock with the API integration. The third-party service is returning unexpected errors. Could we schedule a quick call to debug this together?"),
  generateRecording(10, 35, '+1-202-555-0143', 75, "Hey Charlie, quick question about the invoice you sent over. There seems to be a discrepancy in the line items. Can you give me a call back?"),
  generateRecording(11, 40, '+1-202-555-0134', 30, "Unknown caller, likely spam. No message left."),
  generateRecording(12, 50, '+1-202-555-0167', 900, "Diana, we need to finalize the guest list for the event. The venue needs final numbers by Friday. Please send me your updated list as soon as possible."),
  generateRecording(13, 65, '+1-202-555-0182', 125, "Just confirming our call for 3 PM today, Alice. I've sent the meeting link to your calendar. Talk to you then."),
  generateRecording(14, 80, '+1-202-555-0191', 180, "Bob, thanks for sending over the documents. I've reviewed them and have a few comments. I'll send them over via email shortly."),
  generateRecording(15, 100, '+1-202-555-0155', 65, "Hi, your package has been delivered. You can find it at your front door. Thank you for your order."),
];

export const recordings: CallRecording[] = unsortedRecordings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
