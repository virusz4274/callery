export {
    countContactsByUser,
    findContactByName,
    findContactByPhone,
    getContactsByUser,
} from './contacts/read';

export { incrementContactRecordings, linkRecordingsToContact, recalculateContactStats } from './contacts/link';

export { upsertContacts } from './contacts/write/upsert-contacts';
