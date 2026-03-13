'use client';

import React, { useEffect, useState } from 'react';
import {
    Button,
    Calendar,
    Chip,
    DateField,
    DatePicker,
    Input,
    Label,
    ListBox,
    Modal,
    Select,
    Switch,
    TextArea,
    TimeField,
    type TimeValue,
} from '@heroui/react';
import { getLocalTimeZone, parseAbsoluteToLocal, type DateValue } from '@internationalized/date';
import { CalendarClock, Megaphone, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createAnnouncement, updateAnnouncement } from '@/app/actions/admin-announcements';
import { useToast } from '@/components/toast-provider';
import { AnnouncementResponse } from '@/lib/db/types';

type AnnouncementFormDialogProps = {
    isOpen: boolean;
    onClose: () => void;
    announcementToEdit?: AnnouncementResponse | null;
};

const TYPES = [
    { value: 'info', label: 'Info', description: 'General product or account updates.' },
    { value: 'warning', label: 'Warning', description: 'Important notices that need attention.' },
    { value: 'alert', label: 'Alert', description: 'Critical incidents or service disruption.' },
    { value: 'success', label: 'Success', description: 'Positive rollout or feature completion notice.' },
] as const;

type AnnouncementDateValue = DateValue | null;

function toDateValue(date: Date | string | undefined | null): AnnouncementDateValue {
    if (!date) {
        return null;
    }

    return parseAbsoluteToLocal(new Date(date).toISOString());
}

function toJsDate(value: AnnouncementDateValue): Date | null {
    if (!value) {
        return null;
    }

    return value.toDate(getLocalTimeZone());
}

function formatPreviewDate(value: AnnouncementDateValue) {
    return toJsDate(value)?.toLocaleString() ?? '';
}

type AnnouncementDateTimeFieldProps = {
    ariaLabel: string;
    label: string;
    onChange: (value: AnnouncementDateValue) => void;
    onClear?: () => void;
    value: AnnouncementDateValue;
};

function AnnouncementDateTimeField({
    ariaLabel,
    label,
    onChange,
    onClear,
    value,
}: AnnouncementDateTimeFieldProps) {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
                <Label className="text-sm font-medium">{label}</Label>
                {onClear && value ? (
                    <Button size="sm" variant="ghost" onPress={onClear}>
                        Clear
                    </Button>
                ) : null}
            </div>

            <DatePicker
                aria-label={ariaLabel}
                className="w-full"
                granularity="minute"
                hideTimeZone
                shouldForceLeadingZeros
                value={value}
                onChange={onChange}
            >
                {({ state }) => (
                    <>
                        <DateField.Group fullWidth variant="secondary">
                            <DateField.InputContainer>
                                <DateField.Input>
                                    {(segment) => <DateField.Segment segment={segment} />}
                                </DateField.Input>
                            </DateField.InputContainer>
                            <DateField.Suffix>
                                <DatePicker.Trigger>
                                    <DatePicker.TriggerIndicator />
                                </DatePicker.Trigger>
                            </DateField.Suffix>
                        </DateField.Group>

                        <DatePicker.Popover className="flex w-full min-w-[18rem] flex-col gap-3">
                            <Calendar aria-label={ariaLabel}>
                                <Calendar.Header>
                                    <Calendar.YearPickerTrigger>
                                        <Calendar.YearPickerTriggerHeading />
                                        <Calendar.YearPickerTriggerIndicator />
                                    </Calendar.YearPickerTrigger>
                                    <Calendar.NavButton slot="previous" />
                                    <Calendar.NavButton slot="next" />
                                </Calendar.Header>
                                <Calendar.Grid>
                                    <Calendar.GridHeader>
                                        {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                                    </Calendar.GridHeader>
                                    <Calendar.GridBody>
                                        {(date) => <Calendar.Cell date={date} />}
                                    </Calendar.GridBody>
                                </Calendar.Grid>
                                <Calendar.YearPickerGrid>
                                    <Calendar.YearPickerGridBody>
                                        {({ year }) => <Calendar.YearPickerCell year={year} />}
                                    </Calendar.YearPickerGridBody>
                                </Calendar.YearPickerGrid>
                            </Calendar>

                            <div className="flex items-center justify-between gap-3 border-t border-default-100 pt-3">
                                <Label className="text-sm font-medium">Time</Label>
                                <TimeField
                                    aria-label={`${ariaLabel} time`}
                                    granularity="minute"
                                    hideTimeZone
                                    shouldForceLeadingZeros
                                    value={state.timeValue}
                                    onChange={(nextValue) => state.setTimeValue(nextValue as TimeValue)}
                                >
                                    <TimeField.Group variant="secondary">
                                        <TimeField.Input>
                                            {(segment) => <TimeField.Segment segment={segment} />}
                                        </TimeField.Input>
                                    </TimeField.Group>
                                </TimeField>
                            </div>
                        </DatePicker.Popover>
                    </>
                )}
            </DatePicker>
        </div>
    );
}

function getTypePresentation(type: 'info' | 'warning' | 'alert' | 'success') {
    switch (type) {
        case 'warning':
            return {
                color: 'warning' as const,
                icon: TriangleAlert,
                tone: 'bg-warning/10 text-warning',
            };
        case 'alert':
            return {
                color: 'danger' as const,
                icon: ShieldAlert,
                tone: 'bg-danger/10 text-danger',
            };
        case 'success':
            return {
                color: 'success' as const,
                icon: Megaphone,
                tone: 'bg-success/10 text-success',
            };
        default:
            return {
                color: 'accent' as const,
                icon: Megaphone,
                tone: 'bg-primary/10 text-primary',
            };
    }
}

export function AnnouncementFormDialog({ isOpen, onClose, announcementToEdit }: AnnouncementFormDialogProps) {
    const isEditing = !!announcementToEdit;
    const router = useRouter();
    const { toast } = useToast();

    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [type, setType] = useState<'info' | 'warning' | 'alert' | 'success'>('info');
    const [isActive, setIsActive] = useState(true);
    const [startDate, setStartDate] = useState<AnnouncementDateValue>(null);
    const [endDate, setEndDate] = useState<AnnouncementDateValue>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        setTitle(announcementToEdit?.title || '');
        setMessage(announcementToEdit?.message || '');
        setType((announcementToEdit?.type as 'info' | 'warning' | 'alert' | 'success') || 'info');
        setIsActive(announcementToEdit ? announcementToEdit.isActive : true);
        setStartDate(toDateValue(announcementToEdit?.startDate || new Date()));
        setEndDate(toDateValue(announcementToEdit?.endDate));
    }, [announcementToEdit, isOpen]);

    const selectedType = TYPES.find((item) => item.value === type) ?? TYPES[0];
    const typePresentation = getTypePresentation(type);
    const TypeIcon = typePresentation.icon;

    const handleSave = async () => {
        const startDateAsDate = toJsDate(startDate);
        const endDateAsDate = toJsDate(endDate);

        if (!startDateAsDate) {
            toast({
                title: 'Start date required',
                description: 'Choose when this announcement should become visible.',
                status: 'warning',
            });
            return;
        }

        if (endDateAsDate && endDateAsDate < startDateAsDate) {
            toast({
                title: 'Invalid schedule',
                description: 'The end date must be later than the start date.',
                status: 'warning',
            });
            return;
        }

        setLoading(true);
        try {
            const payload = {
                title,
                message,
                type,
                isActive,
                startDate: startDateAsDate,
                endDate: endDateAsDate || undefined,
            };

            if (isEditing && announcementToEdit) {
                await updateAnnouncement(announcementToEdit.id, payload);
            } else {
                await createAnnouncement(payload);
            }

            router.refresh();
            toast({
                title: isEditing ? 'Announcement updated' : 'Announcement created',
                description: `${title || 'Announcement'} is ready for the admin queue.`,
                status: 'success',
            });
            onClose();
        } catch (error) {
            console.error('Failed to save announcement', error);
            toast({
                title: 'Announcement save failed',
                description: error instanceof Error ? error.message : 'Please try again.',
                status: 'danger',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Modal.Backdrop className="bg-background/80 backdrop-blur-md">
                <Modal.Container>
                    <Modal.Dialog className="w-full max-w-3xl overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/98 p-0 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.55)]">
                        <Modal.CloseTrigger />
                        <Modal.Header className="border-b border-default-100/80 px-6 py-6 sm:px-8">
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-wrap items-center gap-3">
                                    <Chip variant="soft" color="default" className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
                                        Admin announcement
                                    </Chip>
                                    <Chip variant="soft" color={typePresentation.color} className="rounded-full px-3 py-1 text-[11px] font-semibold">
                                        {selectedType.label}
                                    </Chip>
                                    <Chip variant="soft" color={isActive ? 'success' : 'default'} className="rounded-full px-3 py-1 text-[11px] font-semibold">
                                        {isActive ? 'Visible' : 'Draft'}
                                    </Chip>
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-2xl font-bold tracking-[-0.04em] text-foreground">
                                        {isEditing ? 'Refine announcement' : 'Compose announcement'}
                                    </h2>
                                    <p className="max-w-2xl text-sm leading-6 text-default-500">
                                        Use this panel to schedule product-wide notices with the right urgency, timing, and visibility.
                                    </p>
                                </div>
                            </div>
                        </Modal.Header>

                        <Modal.Body className="px-6 py-6 sm:px-8">
                            <div className="space-y-6">
                                <div className="rounded-[1.5rem] border border-default-200/80 bg-default-50/70 p-5">
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="flex items-start gap-4">
                                            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${typePresentation.tone}`}>
                                                <TypeIcon className="h-5 w-5" />
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-sm font-semibold text-foreground">Announcement preview</p>
                                                <p className="text-sm leading-6 text-default-500">{selectedType.description}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2 text-sm text-default-500">
                                            <div className="flex items-center gap-2">
                                                <CalendarClock className="h-4 w-4" />
                                                <span>{startDate ? `Starts ${formatPreviewDate(startDate)}` : 'Start time not set'}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <CalendarClock className="h-4 w-4" />
                                                <span>{endDate ? `Ends ${formatPreviewDate(endDate)}` : 'No automatic end date'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
                                    <div className="space-y-6 rounded-[1.5rem] border border-default-200/80 bg-background p-5">
                                        <div className="flex flex-col gap-2">
                                            <Label className="text-sm font-medium">Title</Label>
                                            <Input
                                                aria-label="Announcement title"
                                                placeholder="Scheduled maintenance, indexing delay, feature rollout..."
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                className="w-full"
                                            />
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <Label className="text-sm font-medium">Message</Label>
                                            <TextArea
                                                aria-label="Announcement message"
                                                placeholder="Tell customers what is happening, who is affected, and what to expect next."
                                                value={message}
                                                onChange={(e) => setMessage(e.target.value)}
                                                className="w-full"
                                                rows={6}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-6 rounded-[1.5rem] border border-default-200/80 bg-default-50/60 p-5">
                                        <div className="flex flex-col gap-2">
                                            <Label className="text-sm font-medium">Type</Label>
                                            <Select
                                                aria-label="Announcement type"
                                                selectedKey={type}
                                                onSelectionChange={(key) => setType(key as 'info' | 'warning' | 'alert' | 'success')}
                                            >
                                                <Select.Trigger className="w-full">
                                                    <Select.Value />
                                                    <Select.Indicator />
                                                </Select.Trigger>
                                                <Select.Popover>
                                                    <ListBox>
                                                        {TYPES.map((item) => (
                                                            <ListBox.Item key={item.value} id={item.value} textValue={item.label}>
                                                                <div className="flex flex-col">
                                                                    <span>{item.label}</span>
                                                                    <span className="text-xs text-default-400">{item.description}</span>
                                                                </div>
                                                            </ListBox.Item>
                                                        ))}
                                                    </ListBox>
                                                </Select.Popover>
                                            </Select>
                                        </div>

                                        <div className="rounded-[1.25rem] border border-default-200/80 bg-background px-4 py-3">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="space-y-1">
                                                    <p className="text-sm font-medium text-foreground">Visibility</p>
                                                    <p className="text-xs leading-5 text-default-500">Keep inactive until the content and timing are ready.</p>
                                                </div>
                                                <Switch aria-label="Announcement visibility" isSelected={isActive} onChange={setIsActive}>
                                                    <Switch.Control>
                                                        <Switch.Thumb />
                                                    </Switch.Control>
                                                </Switch>
                                            </div>
                                        </div>

                                        <AnnouncementDateTimeField
                                            ariaLabel="Announcement start date and time"
                                            label="Start date & time"
                                            value={startDate}
                                            onChange={setStartDate}
                                        />

                                        <AnnouncementDateTimeField
                                            ariaLabel="Announcement end date and time"
                                            label="End date & time"
                                            value={endDate}
                                            onChange={setEndDate}
                                            onClear={() => setEndDate(null)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </Modal.Body>

                        <Modal.Footer className="border-t border-default-100/80 px-6 py-5 sm:px-8">
                            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm text-default-500">
                                    Announcements appear across the product shell, so clear timing and severity matter.
                                </p>
                                <div className="flex gap-3 self-end">
                                    <Button variant="ghost" onPress={onClose} isDisabled={loading}>
                                        Cancel
                                    </Button>
                                    <Button variant="primary" onPress={handleSave} isPending={loading}>
                                        {isEditing ? 'Save changes' : 'Publish announcement'}
                                    </Button>
                                </div>
                            </div>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}
