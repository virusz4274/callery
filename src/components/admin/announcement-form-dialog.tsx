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
import { DatePicker } from '@/components/ui/date-picker';
import { AnnouncementResponse } from '@/lib/db/types';
import { createAnnouncement, updateAnnouncement } from '@/app/actions/admin-announcements';
import { parseAbsoluteToLocal, getLocalTimeZone, now, ZonedDateTime } from '@internationalized/date';

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

export function AnnouncementFormDialog({ isOpen, onClose, announcementToEdit }: AnnouncementFormDialogProps) {
    const isEditing = !!announcementToEdit;

    // Form State
    const [title, setTitle] = useState(announcementToEdit?.title || '');
    const [message, setMessage] = useState(announcementToEdit?.message || '');
    const [type, setType] = useState<'info' | 'warning' | 'alert' | 'success'>(announcementToEdit?.type as 'info' | 'warning' | 'alert' | 'success' || 'info');
    const [isActive, setIsActive] = useState(announcementToEdit ? announcementToEdit.isActive : true);

    // Date State handling with @internationalized/date
    const [startDate, setStartDate] = useState<ZonedDateTime>(
        announcementToEdit
            ? parseAbsoluteToLocal(new Date(announcementToEdit.startDate).toISOString())
            : now(getLocalTimeZone())
    );

    const [endDate, setEndDate] = useState<ZonedDateTime | null>(
        announcementToEdit?.endDate
            ? parseAbsoluteToLocal(new Date(announcementToEdit.endDate).toISOString())
            : null
    );

    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        setLoading(true);
        try {
            const payload = {
                title,
                message,
                type,
                isActive,
                startDate: startDate.toDate(),
                endDate: endDate ? endDate.toDate() : undefined,
            };

            if (isEditing && announcementToEdit) {
                await updateAnnouncement(announcementToEdit.id, payload);
            } else {
                await createAnnouncement(payload);
            }
            onClose();
        } catch (error) {
            console.error('Failed to save announcement', error);
            alert('Failed to save');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Modal.Backdrop className="bg-background/80 backdrop-blur-sm">
                <Modal.Container>
                    <Modal.Dialog className="w-full max-w-2xl bg-card p-6 rounded-xl shadow-xl border border-default-200">
                        <Modal.CloseTrigger />
                        <Modal.Header>
                            <Modal.Heading className="text-xl font-bold">{isEditing ? 'Edit Announcement' : 'New Announcement'}</Modal.Heading>
                        </Modal.Header>
                        <Modal.Body>
                            <div className="flex flex-col gap-6 py-4">
                                <div className="flex flex-col gap-2">
                                    <Label className="text-sm font-medium">Title</Label>
                                    <Input
                                        placeholder="e.g. Scheduled Maintenance"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="w-full"
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label className="text-sm font-medium">Message</Label>
                                    <TextArea
                                        placeholder="Enter full details..."
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        className="w-full"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="flex flex-col gap-2">
                                        <Label className="text-sm font-medium">Type</Label>
                                        <Select
                                            selectedKey={type}
                                            onSelectionChange={(key) => setType(key as 'info' | 'warning' | 'alert' | 'success')}
                                        >
                                            <Select.Trigger className="w-full">
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

                                    <div className="flex flex-col gap-2">
                                        <Label className="text-sm font-medium">Status</Label>
                                        <div className="flex items-center justify-between h-10 px-3 border border-default-200 rounded-md">
                                            <span className="text-sm text-default-500">Active</span>
                                            <Switch isSelected={isActive} onChange={setIsActive}>
                                                <Switch.Control>
                                                    <Switch.Thumb />
                                                </Switch.Control>
                                            </Switch>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="flex flex-col gap-2">
                                        <Label className="text-sm font-medium">Start Date & Time</Label>
                                        <DatePicker
                                            showTime
                                            date={startDate.toDate()}
                                            setDate={(d) => {
                                                if (d) {
                                                    setStartDate(parseAbsoluteToLocal(d.toISOString()));
                                                }
                                            }}
                                            className="w-full"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Label className="text-sm font-medium">End Date & Time (Optional)</Label>
                                        <DatePicker
                                            showTime
                                            date={endDate ? endDate.toDate() : undefined}
                                            setDate={(d) => {
                                                if (d) {
                                                    setEndDate(parseAbsoluteToLocal(d.toISOString()));
                                                } else {
                                                    setEndDate(null);
                                                }
                                            }}
                                            className="w-full"
                                            placeholder="Pick end date"
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
