'use client';

import React, { useState } from 'react';
import {
    Modal,
    Button,
    Input,
    Select,
    Switch,
    TextArea,
    Label,
    ListBox
} from '@heroui/react';
import { AnnouncementResponse } from '@/lib/db/types';
import { createAnnouncement, updateAnnouncement } from '@/app/actions/admin-announcements';
import { useToast } from '@/components/toast-provider';
import { useRouter } from 'next/navigation';

type AnnouncementFormDialogProps = {
    isOpen: boolean;
    onClose: () => void;
    announcementToEdit?: AnnouncementResponse | null;
};

const TYPES = [
    { value: 'info', label: 'Info' },
    { value: 'warning', label: 'Warning' },
    { value: 'alert', label: 'Alert' },
    { value: 'success', label: 'Success' },
];

/** Formats a date as a local `datetime-local` input value (no UTC shift). */
function toLocalDateTimeInput(value: string | Date): string {
    const d = new Date(value);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AnnouncementFormDialog({ isOpen, onClose, announcementToEdit }: AnnouncementFormDialogProps) {
    const isEditing = !!announcementToEdit;
    const { toast } = useToast();
    const router = useRouter();

    // Form State
    const [title, setTitle] = useState(announcementToEdit?.title || '');
    const [message, setMessage] = useState(announcementToEdit?.message || '');
    const [type, setType] = useState<'info' | 'warning' | 'alert' | 'success'>(announcementToEdit?.type as 'info' | 'warning' | 'alert' | 'success' || 'info');
    const [isActive, setIsActive] = useState(announcementToEdit ? announcementToEdit.isActive : true);

    // Dates need careful formatting for Input type="datetime-local" if used, or just type="date"
    // Using simple text or standard inputs for now
    // Default start date to now if new
    const defaultStart = announcementToEdit ? toLocalDateTimeInput(announcementToEdit.startDate) : toLocalDateTimeInput(new Date());
    const [startDate, setStartDate] = useState(defaultStart);

    const defaultEnd = announcementToEdit?.endDate ? toLocalDateTimeInput(announcementToEdit.endDate) : '';
    const [endDate, setEndDate] = useState(defaultEnd);

    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        if (!title.trim() || !message.trim()) {
            toast({ title: 'Title and message are required', status: 'warning' });
            return;
        }
        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : undefined;
        if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) {
            toast({ title: 'Invalid dates', description: 'Enter valid start/end dates.', status: 'warning' });
            return;
        }
        if (end && end <= start) {
            toast({ title: 'Invalid date range', description: 'End date must be after start date.', status: 'warning' });
            return;
        }
        setLoading(true);
        try {
            const payload = {
                title,
                message,
                type,
                isActive,
                startDate: start,
                endDate: end,
            };

            if (isEditing && announcementToEdit) {
                await updateAnnouncement(announcementToEdit.id, payload);
            } else {
                await createAnnouncement(payload);
            }
            toast({ title: isEditing ? 'Announcement updated' : 'Announcement created', status: 'success' });
            router.refresh();
            onClose();
        } catch (error) {
            console.error('Failed to save announcement', error);
            toast({
                title: 'Failed to save',
                description: error instanceof Error ? error.message : 'Please try again.',
                status: 'danger',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Button className="hidden" aria-hidden="true" />
            <Modal.Backdrop>
                <Modal.Container>
                    <Modal.Dialog>
                        <Modal.CloseTrigger />
                        <Modal.Header>
                            <Modal.Heading>{isEditing ? 'Edit Announcement' : 'New Announcement'}</Modal.Heading>
                        </Modal.Header>
                        <Modal.Body>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>Title</Label>
                                    <Input
                                        placeholder="e.g. Scheduled Maintenance"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Message</Label>
                                    <TextArea
                                        placeholder="Enter full details..."
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Type</Label>
                                        <Select
                                            selectedKey={type}
                                            onSelectionChange={(key) => setType(key as 'info' | 'warning' | 'alert' | 'success')}
                                        >
                                            <Label>Type</Label>
                                            <Select.Trigger>
                                                <Select.Value />
                                                <Select.Indicator />
                                            </Select.Trigger>
                                            <Select.Popover>
                                                <ListBox>
                                                    {TYPES.map(t => (
                                                        <ListBox.Item key={t.value} id={t.value} textValue={t.label}>{t.label}</ListBox.Item>
                                                    ))}
                                                </ListBox>
                                            </Select.Popover>
                                        </Select>
                                    </div>
                                    <div className="flex items-center justify-between pt-6">
                                        <Label>Active</Label>
                                        <Switch isSelected={isActive} onChange={setIsActive}>
                                            <Switch.Control>
                                                <Switch.Thumb />
                                            </Switch.Control>
                                        </Switch>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Start Date</Label>
                                        <Input
                                            type="datetime-local"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>End Date (Optional)</Label>
                                        <Input
                                            type="datetime-local"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </Modal.Body>
                        <Modal.Footer>
                            <Button variant="ghost" onPress={onClose}>Cancel</Button>
                            <Button variant="primary" onPress={handleSave} isPending={loading}>
                                {isEditing ? 'Update' : 'Create'}
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}
