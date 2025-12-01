
import { AdminDashboard } from '@/components/admin/admin-dashboard';
import { contacts, recordings } from '@/lib/data/data';

export default function AdminPage() {
    // In a real app, you'd fetch all users and recordings.
    // For now, we'll use our mock data to simulate this.
    return <AdminDashboard allUsers={contacts} allRecordings={recordings} />;
}
