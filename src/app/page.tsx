import { AppLayout } from '@/components/app-layout';
import { recordings, contacts } from '@/lib/data';

export default function Home() {
  return (
    <AppLayout allRecordings={recordings} allContacts={contacts} />
  );
}
