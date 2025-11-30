
import { ContactsPage } from '@/components/pages/contacts-page';
import { contacts, recordings } from '@/lib/data/data';

export default function Contacts() {
  return <ContactsPage allContacts={contacts} allRecordings={recordings} />;
}
