"use client";

import { useState } from 'react';
import { Button, Chip, Input, Label, ListBox, Popover, Select } from '@heroui/react';
import { Check, Clock, Copy, Link2, Share2 } from 'lucide-react';
import { createShareLink, createShareLinkForClip } from '@/app/actions/sharing';
import { useToast } from '@/components/toast-provider';

interface SharePopoverProps {
    recordingId: string;
}

const expirations = [
    { value: '1h', label: '1 Hour', detail: 'Good for immediate follow-up' },
    { value: '24h', label: '24 Hours', detail: 'Best default for quick review' },
    { value: '7d', label: '7 Days', detail: 'Use when collaborators need more time' },
];

export function SharePopover({ recordingId }: SharePopoverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [link, setLink] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [expiration, setExpiration] = useState<string>('24h');
    const [clipStartInput, setClipStartInput] = useState('');
    const [clipEndInput, setClipEndInput] = useState('');
    const { toast } = useToast();

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
                description: 'The share link is now in your clipboard.',
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

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open);
        if (!open) {
            setLink(null);
            setCopied(false);
            setClipStartInput('');
            setClipEndInput('');
        }
    };

    const selectedExpiration = expirations.find((item) => item.value === expiration) ?? expirations[1];

    return (
        <Popover isOpen={isOpen} onOpenChange={handleOpenChange}>
            <Popover.Trigger>
                <Button variant="ghost" size="sm" className="h-8 gap-2 text-default-600">
                    <Share2 className="size-4" />
                    <span className="hidden sm:inline">Share</span>
                </Button>
            </Popover.Trigger>
            <Popover.Content className="w-[360px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[1.6rem] border border-default-200/80 bg-background/98 p-0 shadow-[0_24px_64px_-44px_rgba(15,23,42,0.45)]" placement="bottom">
                <Popover.Dialog className="flex flex-col gap-4 p-4">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Popover.Heading className="flex items-center gap-2 text-sm font-semibold tracking-[-0.02em]">
                                <Share2 className="size-4" />
                                Share recording
                            </Popover.Heading>
                            <Chip size="sm" variant="soft" color="accent">Temporary link</Chip>
                        </div>
                        <p className="text-sm leading-6 text-default-500">
                            Create a public review link for this recording and control how long it stays active.
                        </p>
                    </div>

                    {!link ? (
                        <div className="space-y-4">
                            <div className="rounded-[1.2rem] border border-default-200/80 bg-default-50/70 p-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                    <Clock className="size-4 text-primary" />
                                    Expiration window
                                </div>
                                <p className="mt-2 text-sm leading-6 text-default-500">{selectedExpiration.detail}</p>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-medium">Expires in</Label>
                                <Select
                                    aria-label="Share link expiration"
                                    placeholder="Expires in"
                                    defaultSelectedKey="24h"
                                    onSelectionChange={(key) => {
                                        if (key !== null) {
                                            setExpiration(key.toString());
                                        }
                                    }}
                                >
                                    <Select.Trigger>
                                        <Clock className="mr-2 size-4 text-default-400" />
                                        <Select.Value />
                                        <Select.Indicator />
                                    </Select.Trigger>
                                    <Select.Popover>
                                        <ListBox>
                                            {expirations.map((exp) => (
                                                <ListBox.Item key={exp.value} id={exp.value} textValue={exp.label}>
                                                    <div className="flex flex-col">
                                                        <span>{exp.label}</span>
                                                        <span className="text-xs text-default-400">{exp.detail}</span>
                                                    </div>
                                                </ListBox.Item>
                                            ))}
                                        </ListBox>
                                    </Select.Popover>
                                </Select>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label className="text-sm font-medium">Clip start (sec)</Label>
                                    <Input
                                        aria-label="Clip start seconds"
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={clipStartInput}
                                        onChange={(event) => setClipStartInput(event.target.value)}
                                        variant="secondary"
                                        placeholder="Optional"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-sm font-medium">Clip end (sec)</Label>
                                    <Input
                                        aria-label="Clip end seconds"
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={clipEndInput}
                                        onChange={(event) => setClipEndInput(event.target.value)}
                                        variant="secondary"
                                        placeholder="Optional"
                                    />
                                </div>
                            </div>

                            <Button variant="primary" onPress={handleGenerate} isPending={loading} className="w-full rounded-full">
                                Generate link
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-[1.2rem] border border-default-200/80 bg-default-50/70 p-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                    <Link2 className="size-4 text-primary" />
                                    Link ready to share
                                </div>
                                <p className="mt-2 text-sm leading-6 text-default-500">
                                    Anyone with this link can open the shared recording until it expires.
                                </p>
                            </div>

                            <div className="relative">
                                <Input
                                    aria-label="Generated share link"
                                    readOnly
                                    value={link}
                                    variant="secondary"
                                    className="pr-12"
                                />
                                <div className="absolute right-1 top-1/2 z-10 -translate-y-1/2">
                                    <Button
                                        isIconOnly
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 min-w-7 rounded-full"
                                        onPress={handleCopy}
                                        aria-label="Copy share link"
                                    >
                                        {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
                                    </Button>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <Button variant="ghost" size="sm" onPress={() => setLink(null)} className="w-full rounded-full">
                                    Create another link
                                </Button>
                                <Button variant="primary" size="sm" onPress={handleCopy} className="w-full rounded-full">
                                    {copied ? 'Copied' : 'Copy link'}
                                </Button>
                            </div>
                        </div>
                    )}
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}
