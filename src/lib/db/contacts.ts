export {
    countContactsByUser,
    findContactByName,
    findContactByPhone,
    getContactsByUser,
} from './contacts/read';

export { incrementContactRecordings, linkRecordingsToContact, recalculateContactStats } from './contacts/link';

export { createContact, updateContact, upsertContacts } from './contacts/write';
