import { ContactsPage } from '@/components/contacts-page';
import { contacts, recordings } from '@/lib/data';

export default function Contacts() {
  return <ContactsPage allContacts={contacts} allRecordings={recordings} />;
}
