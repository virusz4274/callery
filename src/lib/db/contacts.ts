export {
    countContactsByUser,
    findContactByName,
    findContactByPhone,
    getContactsByUser,
} from './contacts/read';

export { incrementContactRecordings, linkRecordingsToContact } from './contacts/link';

export { createContact, updateContact, upsertContacts } from './contacts/write';
