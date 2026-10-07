'use client';
import { useEffect, useRef, useState } from 'react';
import { Card, Button, Chip } from '@heroui/react';
import { Edit, Trash2, Plus } from 'lucide-react';
import type { AnnouncementResponse } from '@/lib/db/types';
import { announcementState } from '@/lib/admin-validation';
import { deleteAnnouncement } from '@/app/actions/admin-announcements';
import { AnnouncementFormDialog } from './announcement-form-dialog';
import { ConfirmActionDialog } from './confirm-action-dialog';
import { useToast } from '@/components/toast-provider';
import { useRouter } from 'next/navigation';
export function AnnouncementsList({ announcements }: { announcements: AnnouncementResponse[] }) {
    const [editing, setEditing] = useState<AnnouncementResponse | null>(null);
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<AnnouncementResponse | null>(null);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => { const update = () => setNow(Date.now()); const timer = setInterval(update, 30000); return () => clearInterval(timer); }, []);
    const busy = useRef(false);
    const { toast } = useToast();
    const router = useRouter();
    const remove = async () => {
        if (!deleting || busy.current) return;
        busy.current = true; setPending(true); setError(null);
        try { await deleteAnnouncement(deleting.id); toast({ title: 'Announcement deleted', status: 'success' }); setDeleting(null); router.refresh(); }
        catch (error) { setError(error instanceof Error ? error.message : 'Please try again.'); }
        finally { busy.current = false; setPending(false); }
    };
    return <div className="space-y-5">
        <div className="flex justify-end"><Button className="min-h-11" onPress={() => setCreating(true)}><Plus className="size-4" />Create announcement</Button></div>
        {!announcements.length && <Card className="items-center gap-3 py-10 text-center"><h2 className="text-lg font-semibold">No announcements yet</h2><p className="text-sm text-muted">Create a notice with a message and display schedule.</p><Button variant="secondary" className="min-h-11" onPress={() => setCreating(true)}>Create your first announcement</Button></Card>}
        {announcements.map(ann => {
            const state = now === null ? ann.isActive ? 'Enabled' : 'Inactive' : announcementState(ann.isActive, ann.startDate, ann.endDate, now);
            return <Card key={ann.id} className="min-w-0 gap-4 p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1 space-y-2"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-lg font-semibold">{ann.title}</h2><Chip size="sm" variant="soft" color={ann.type === 'alert' ? 'danger' : ann.type === 'warning' ? 'warning' : ann.type === 'success' ? 'success' : 'accent'}>{ann.type}</Chip><Chip size="sm" variant="soft" color={state === 'Visible' ? 'success' : 'default'}>{state}</Chip></div><p className="line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted">{ann.message}</p><div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"><span>Starts {new Date(ann.startDate).toLocaleString()}</span><span>{ann.endDate ? `Ends ${new Date(ann.endDate).toLocaleString()}` : 'No end date'}</span></div></div>
                <div className="flex shrink-0 gap-2"><Button aria-label={`Edit ${ann.title}`} isIconOnly variant="secondary" className="size-11" onPress={() => setEditing(ann)}><Edit className="size-4" /></Button><Button aria-label={`Delete ${ann.title}`} isIconOnly variant="danger-soft" className="size-11" isDisabled={pending} onPress={() => { setError(null); setDeleting(ann); }}><Trash2 className="size-4" /></Button></div>
            </div></Card>;
        })}
        <AnnouncementFormDialog isOpen={creating} onClose={() => setCreating(false)} />
        {editing && <AnnouncementFormDialog isOpen announcementToEdit={editing} onClose={() => setEditing(null)} />}
        {deleting && <ConfirmActionDialog title={`Delete ${deleting.title}?`} description="Remove this announcement from the console and user notices." label="Delete announcement" pending={pending} error={error} onConfirm={() => void remove()} onClose={() => setDeleting(null)} />}
    </div>;
}
