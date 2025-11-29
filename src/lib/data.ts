import type { CallRecording, Contact } from './types';

export const contacts: Contact[] = [
  { name: 'Alice Johnson', phoneNumber: '+1-202-555-0182' },
  { name: 'Bob Williams', phoneNumber: '+1-202-555-0191' },
  { name: 'Charlie Brown', phoneNumber: '+1-202-555-0143' },
  { name: 'Diana Miller', phoneNumber: '+1-202-555-0167' },
];

const contactMap = new Map(contacts.map(c => [c.phoneNumber, c.name]));

const generateRecording = (id: number, daysAgo: number, phoneNumber: string, duration: number, transcript: string): CallRecording => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return {
    id: `rec_${id}`,
    contactName: contactMap.get(phoneNumber) || null,
    phoneNumber,
    date: date.toISOString(),
    duration,
    filePath: `/recordings/${contactMap.has(phoneNumber) ? contactMap.get(phoneNumber)?.replace(' ', '_') : phoneNumber}/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/call_${date.getTime()}.mp3`,
    transcriptSnippet: transcript,
  };
};

const unsortedRecordings: CallRecording[] = [
  generateRecording(1, 2, '+1-202-555-0182', 185, "Hey Alice, just following up on our meeting from yesterday. I think we have a solid plan..."),
  generateRecording(2, 3, '+1-202-555-0111', 45, "Hi, I'm calling about the recent advertisement. Can you provide more details?"),
  generateRecording(3, 5, '+1-202-555-0191', 320, "Bob, it's about the quarterly report. I need your slides by end of day tomorrow at the latest."),
  generateRecording(4, 7, '+1-202-555-0167', 95, "Hi Diana, are you free for lunch next week? Maybe Tuesday? Let me know what works for you."),
  generateRecording(5, 10, '+1-202-555-0182', 610, "Alice, great news! The client approved the proposal. We're moving forward with phase two..."),
  generateRecording(6, 12, '+1-202-555-0123', 120, "This is a reminder for your dental appointment tomorrow at 10:30 AM. Please confirm by pressing 1."),
  generateRecording(7, 15, '+1-202-555-0143', 240, "Charlie, just wanted to check in on the project timeline. Are we still on track for the deadline?"),
  generateRecording(8, 20, '+1-202-555-0191', 150, "Hey Bob, I saw your email. I'll get back to you with the figures shortly. Just need to compile them."),
  generateRecording(9, 25, '+1-202-555-0182', 480, "Alice, I've hit a roadblock with the API integration. Could we schedule a quick call to debug?"),
  generateRecording(10, 35, '+1-202-555-0143', 75, "Hey Charlie, quick question about the invoice you sent over. Can you give me a call back?"),
  generateRecording(11, 40, '+1-202-555-0134', 30, "Unknown caller, likely spam. No message left."),
  generateRecording(12, 50, '+1-202-555-0167', 900, "Diana, we need to finalize the guest list for the event. The venue needs final numbers by Friday."),
  generateRecording(13, 65, '+1-202-555-0182', 125, "Just confirming our call for 3 PM today, Alice. Talk to you then."),
  generateRecording(14, 80, '+1-202-555-0191', 180, "Bob, thanks for sending over the documents. I've reviewed them and have a few comments."),
  generateRecording(15, 100, '+1-202-555-0155', 65, "Hi, your package has been delivered. You can find it at your front door. Thank you."),
];

export const recordings: CallRecording[] = unsortedRecordings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
