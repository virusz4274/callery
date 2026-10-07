'use client';

import { useRef, useState } from 'react';
import { Button, Calendar, DateField, DatePicker, Input, Label, ListBox, Modal, Select, Switch, TextArea, TimeField, type TimeValue } from '@heroui/react';
import { getLocalTimeZone, parseAbsoluteToLocal, type DateValue } from '@internationalized/date';
import { AdminAnnouncementSchema, announcementState, validationFailure, type AdminFieldErrors } from '@/lib/admin-validation';
import { FieldError, focusInvalid } from './admin-form-errors';
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

type AnnouncementDateTimeFieldProps = {
    ariaLabel: string;
    label: string;
    onChange: (value: AnnouncementDateValue) => void;
    onClear?: () => void;
    value: AnnouncementDateValue;
    error?: string;
    fieldName: string;
};

function AnnouncementDateTimeField({
    ariaLabel,
    label,
    onChange,
    onClear,
    value,
    error,
    fieldName,
}: AnnouncementDateTimeFieldProps) {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex min-h-11 items-center justify-between gap-3">
                <Label id={`${fieldName}-label`} className="text-sm font-medium">{label}</Label>
                {onClear && value ? (
                    <Button className="min-h-11" aria-label={`Clear ${label}`} variant="ghost" onPress={onClear}>
                        Clear
                    </Button>
                ) : null}
            </div>

            <DatePicker
                aria-label={ariaLabel}
                aria-labelledby={`${fieldName}-label`}
                aria-invalid={!!error}
                aria-describedby={error ? `${fieldName}-error` : undefined}
                className="w-full"
                granularity="minute"
                hideTimeZone
                shouldForceLeadingZeros
                value={value}
                onChange={onChange}
            >
                {({ state }) => (
                    <>
                        <DateField.Group fullWidth variant="secondary" className="min-h-11">
                            <DateField.InputContainer>
                                <DateField.Input>
                                    {(segment) => <DateField.Segment segment={segment} />}
                                </DateField.Input>
                            </DateField.InputContainer>
                            <DateField.Suffix>
                                <DatePicker.Trigger className="size-11">
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

                            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                                <Label id={`${fieldName}-time-label`} className="text-sm font-medium">Time</Label>
                                <TimeField
                                    aria-label={`${ariaLabel} time`} aria-labelledby={`${fieldName}-time-label`}
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

export function AnnouncementFormDialog(props: AnnouncementFormDialogProps) {
    if (!props.isOpen) return null;
    return <AnnouncementFormFields key={props.announcementToEdit?.id || 'new'} {...props} />;
}

function AnnouncementFormFields({ isOpen, onClose, announcementToEdit }: AnnouncementFormDialogProps) {
    const isEditing = !!announcementToEdit;
    const router = useRouter();
    const { toast } = useToast();
    const [title, setTitle] = useState(announcementToEdit?.title || '');
    const [message, setMessage] = useState(announcementToEdit?.message || '');
    const [type, setType] = useState<'info' | 'warning' | 'alert' | 'success'>(announcementToEdit?.type || 'info');
    const [isActive, setActive] = useState(announcementToEdit?.isActive ?? true);
    const [startDate, setStartDate] = useState<AnnouncementDateValue>(() => toDateValue(announcementToEdit?.startDate || new Date()));
    const [endDate, setEndDate] = useState<AnnouncementDateValue>(() => toDateValue(announcementToEdit?.endDate));
    const [pending, setPending] = useState(false);
    const [errors, setErrors] = useState<AdminFieldErrors>({});
    const [error, setError] = useState<string | null>(null);
    const busy = useRef(false);
    const form = useRef<HTMLFormElement>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy.current) return;
        const payload = { title, message, type, isActive, startDate: toJsDate(startDate), endDate: toJsDate(endDate) || undefined };
        const validation = AdminAnnouncementSchema.safeParse(payload);
        if (!validation.success) { setErrors(validationFailure(validation.error).fieldErrors); focusInvalid(form.current); return; }
        busy.current = true; setPending(true); setErrors({}); setError(null);
        try {
            const data = { ...payload, startDate: validation.data.startDate };
            const result = announcementToEdit ? await updateAnnouncement(announcementToEdit.id, data) : await createAnnouncement(data);
            if (result?.fieldErrors) { setErrors(result.fieldErrors); focusInvalid(form.current); return; }
            toast({ title: isEditing ? 'Announcement updated' : 'Announcement created', status: 'success' });
            router.refresh(); onClose();
        } catch (error) { setError(error instanceof Error ? error.message : 'Please try again.'); }
        finally { busy.current = false; setPending(false); }
    };
    const start = toJsDate(startDate);
    const end = toJsDate(endDate);
    const state = start ? announcementState(isActive, start.toISOString(), end?.toISOString()) : 'Choose a start date';
    return <Modal.Backdrop isOpen={isOpen} onOpenChange={open => { if (!open && !busy.current) onClose(); }} isDismissable={!pending}><Modal.Container size="lg" scroll="inside"><Modal.Dialog className="p-0">
            <Modal.CloseTrigger className="size-11" aria-label="Close announcement editor" isDisabled={pending} />
            <Modal.Header className="px-5 py-4 pr-16"><Modal.Heading>{isEditing ? 'Edit announcement' : 'Create announcement'}</Modal.Heading><p className="text-sm text-muted">{state}</p></Modal.Header>
            <Modal.Body className="border-y border-border px-5 py-4">
                <form ref={form} id="admin-announcement-form" noValidate onSubmit={submit} className="space-y-5">
                    <div className="space-y-2"><Label htmlFor="announcement-title">Title</Label><Input id="announcement-title" value={title} onChange={e => setTitle(e.target.value)} aria-invalid={!!errors.title} aria-describedby={errors.title ? 'title-error' : undefined} className="min-h-11 w-full" /><FieldError errors={errors} name="title" /></div>
                    <div className="space-y-2"><Label htmlFor="announcement-message">Message</Label><TextArea id="announcement-message" value={message} onChange={e => setMessage(e.target.value)} aria-invalid={!!errors.message} aria-describedby={errors.message ? 'message-error' : undefined} rows={5} className="w-full" /><FieldError errors={errors} name="message" /></div>
                    <Select aria-label="Announcement type" selectedKey={type} onSelectionChange={key => setType(key as typeof type)}><Label>Type</Label><Select.Trigger className="min-h-11"><Select.Value /><Select.Indicator /></Select.Trigger><Select.Popover><ListBox>{TYPES.map(item => <ListBox.Item key={item.value} id={item.value} textValue={item.label}>{item.label}</ListBox.Item>)}</ListBox></Select.Popover></Select>
                    <Switch isSelected={isActive} onChange={setActive}><Switch.Content className="min-h-11"><Switch.Control><Switch.Thumb /></Switch.Control><Label>Enabled during its schedule</Label></Switch.Content></Switch>
                    <div><AnnouncementDateTimeField ariaLabel="Announcement start date and time" label="Start date & time" value={startDate} onChange={setStartDate} fieldName="startDate" error={errors.startDate} /><FieldError errors={errors} name="startDate" /></div>
                    <div><AnnouncementDateTimeField ariaLabel="Announcement end date and time" label="End date & time" value={endDate} onChange={setEndDate} onClear={() => setEndDate(null)} fieldName="endDate" error={errors.endDate} /><FieldError errors={errors} name="endDate" /></div>
                    {error && <p role="alert" className="text-sm text-danger">{error} Your changes are retained; try saving again.</p>}
                </form>
            </Modal.Body>
            <Modal.Footer className="flex-wrap gap-2 px-5 py-4"><Button variant="secondary" className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal py-2" isDisabled={pending} onPress={onClose}>Cancel</Button><Button type="submit" form="admin-announcement-form" className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal py-2" isPending={pending}>{error ? 'Retry save' : isEditing ? 'Save changes' : 'Create announcement'}</Button></Modal.Footer>
        </Modal.Dialog></Modal.Container></Modal.Backdrop>;
}
