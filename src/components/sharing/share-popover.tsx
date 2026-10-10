"use client";

import { useState } from 'react';
import { Accordion, Button, Input, Label, ListBox, Popover, Select } from '@heroui/react';
import { Check, Clock, Copy, Share2 } from 'lucide-react';
import { createShareLink, createShareLinkForClip } from '@/app/actions/sharing';
import { useToast } from '@/components/toast-provider';
import { useTeamPolicy } from '@/hooks/use-team-policy';

interface SharePopoverProps {
    recordingId: string;
}

const expirations = [
    { value: '1h', label: '1 Hour' },
    { value: '24h', label: '24 Hours' },
    { value: '7d', label: '7 Days' },
];

export function ShareRecordingForm({ recordingId }: SharePopoverProps) {
    const team = useTeamPolicy();
    const [loading, setLoading] = useState(false);
    const [link, setLink] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [expiration, setExpiration] = useState<string>('24h');
    const [clipStartInput, setClipStartInput] = useState('');
    const [clipEndInput, setClipEndInput] = useState('');
    const [clipExpanded, setClipExpanded] = useState(false);
    const { toast } = useToast();

    if (team) return <p className="text-sm text-muted">Public sharing is disabled for {team.companyName}. The company administrator can access the archive directly.</p>;
    const handleGenerate = async () => {
        setLoading(true);
        try {
            const clipStartValue = clipStartInput.trim();
            const clipEndValue = clipEndInput.trim();
            const clipStart = clipStartValue.length > 0 ? Number(clipStartValue) : undefined;
            const clipEnd = clipEndValue.length > 0 ? Number(clipEndValue) : undefined;

            if ((clipStartValue && !Number.isFinite(clipStart)) || (clipEndValue && !Number.isFinite(clipEnd))) {
                toast({
                    title: 'Invalid clip range',
                    description: 'Clip values must be valid numbers in seconds.',
                    status: 'warning',
                });
                return;
            }

            if (
                typeof clipStart === 'number' &&
                typeof clipEnd === 'number' &&
                clipEnd > 0 &&
                clipEnd <= clipStart
            ) {
                toast({
                    title: 'Invalid clip range',
                    description: 'End time must be greater than start time.',
                    status: 'warning',
                });
                return;
            }

            const url = typeof clipStart === 'number' || typeof clipEnd === 'number'
                ? await createShareLinkForClip(recordingId, expiration, clipStart, clipEnd)
                : await createShareLink(recordingId, expiration);
            setLink(url);
        } catch (error) {
            console.error(error);
            toast({
                title: 'Share link failed',
                description: 'We could not generate a recording link right now.',
                status: 'danger',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!link) return;

        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            toast({
                title: 'Link copied',
                status: 'success',
            });
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error(error);
            toast({
                title: 'Copy failed',
                description: 'Please copy the link manually.',
                status: 'danger',
            });
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="space-y-2">
                <h2 className="flex items-center gap-2 text-base font-semibold"><Share2 className="size-4" aria-hidden="true" />Share recording</h2>
                <p className="text-sm leading-6 text-muted">Anyone with the link can access this recording until it expires.</p>
            </div>
            {!link ? <div className="space-y-4">
                <Select aria-label="Share link expiration" selectedKey={expiration}
                    onSelectionChange={(key) => { if (key !== null) setExpiration(key.toString()); }}>
                    <Label>Expires in</Label>
                    <Select.Trigger className="min-h-11"><Clock className="mr-2 size-4 text-muted" aria-hidden="true" /><Select.Value /><Select.Indicator /></Select.Trigger>
                    <Select.Popover><ListBox>{expirations.map((item) =>
                        <ListBox.Item key={item.value} id={item.value} textValue={item.label}>{item.label}</ListBox.Item>
                    )}</ListBox></Select.Popover>
                </Select>
                <Accordion expandedKeys={clipExpanded ? ['clip'] : []} onExpandedChange={keys => setClipExpanded(keys.has('clip'))}>
                  <Accordion.Item id="clip"><Accordion.Heading><Accordion.Trigger className="min-h-11">Share a clip<Accordion.Indicator /></Accordion.Trigger></Accordion.Heading>
                  <Accordion.Panel><Accordion.Body>
                    <div className="grid gap-3 pb-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor={`clip-start-${recordingId}`}>Clip start (sec)</Label>
                            <Input id={`clip-start-${recordingId}`} aria-label="Clip start seconds" className="min-h-11 text-base" type="number" min={0} step={1}
                                value={clipStartInput} onChange={(event) => { setClipStartInput(event.target.value); if (event.target.value) setClipExpanded(true); }} variant="secondary" placeholder="Optional" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={`clip-end-${recordingId}`}>Clip end (sec)</Label>
                            <Input id={`clip-end-${recordingId}`} aria-label="Clip end seconds" className="min-h-11 text-base" type="number" min={0} step={1}
                                value={clipEndInput} onChange={(event) => { setClipEndInput(event.target.value); if (event.target.value) setClipExpanded(true); }} variant="secondary" placeholder="Optional" />
                        </div>
                    </div>
                </Accordion.Body></Accordion.Panel></Accordion.Item></Accordion>
                <Button variant="primary" onPress={handleGenerate} isPending={loading} className="min-h-11 w-full rounded-lg">Generate link</Button>
            </div> : <div className="space-y-3">
                <Input aria-label="Generated share link" readOnly value={link} variant="secondary" className="min-h-11 text-base" />
                <div className="flex flex-wrap gap-2">
                    <Button variant="primary" onPress={handleCopy} className="min-h-11 flex-1 gap-2 rounded-lg">
                        {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}{copied ? 'Copied' : 'Copy link'}
                    </Button>
                    <Button variant="ghost" onPress={() => { setLink(null); if (clipStartInput || clipEndInput) setClipExpanded(true); }} className="min-h-11 rounded-lg">Create another link</Button>
                </div>
            </div>}
        </div>
    );
}

export function SharePopover({ recordingId }: SharePopoverProps) {
    const team = useTeamPolicy();
    const [isOpen, setIsOpen] = useState(false);
    if (team) return null;
    return (
        <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
            <Popover.Trigger>
                <Button variant="ghost" size="sm" className="min-h-11 gap-2 text-default-600" aria-label="Share recording">
                    <Share2 className="size-4" /><span>Share</span>
                </Button>
            </Popover.Trigger>
            <Popover.Content className="w-[360px] max-w-[calc(100vw-1.5rem)] p-4" placement="bottom">
                <Popover.Dialog aria-label="Share recording">{isOpen && <ShareRecordingForm recordingId={recordingId} />}</Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}
