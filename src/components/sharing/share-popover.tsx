"use client";

import { useState } from 'react';
import { 
    Popover, 
    Button, 
    Input,
    Select,
    Label,
    ListBox
} from '@heroui/react';
import { Share2, Copy, Check, Clock } from 'lucide-react';
import { createShareLink } from '@/app/actions/sharing';
import { useToast } from '@/components/toast-provider';

interface SharePopoverProps {
    recordingId: string;
}

const expirations = [
    { value: '1h', label: '1 Hour' },
    { value: '24h', label: '24 Hours' },
    { value: '7d', label: '7 Days' },
];

export function SharePopover({ recordingId }: SharePopoverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [link, setLink] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [expiration, setExpiration] = useState<string>('24h');
    const { toast } = useToast();

    const handleGenerate = async () => {
        setLoading(true);
        try {
            const url = await createShareLink(recordingId, expiration);
            setLink(url);
        } catch (error) {
            console.error(error);
            toast({
                title: 'Error',
                description: 'Failed to generate link',
                status: 'danger'
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
                title: 'Copied',
                description: 'Link copied to clipboard',
                status: 'success'
            });
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            toast({
                title: 'Error',
                description: 'Failed to copy',
                status: 'danger'
            });
        }
    };

    // Reset state when closed
    const handleOpenChange = (open: boolean) => {
        setIsOpen(open);
        if (!open) {
            setLink(null);
            setCopied(false);
        }
    };

    return (
        <Popover isOpen={isOpen} onOpenChange={handleOpenChange}>
            <Popover.Trigger>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 gap-2 text-default-600"
                >
                    <Share2 className="size-4" />
                    <span className="hidden sm:inline">Share</span>
                </Button>
            </Popover.Trigger>
            <Popover.Content className="w-[340px] p-4" placement="bottom">
                <Popover.Dialog className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                        <Popover.Heading className="text-sm font-semibold flex items-center gap-2">
                            <Share2 className="size-4" />
                            Share Recording
                        </Popover.Heading>
                        <p className="text-xs text-muted-foreground">
                            Create a temporary public link to this recording.
                        </p>
                    </div>

                    {!link ? (
                        <div className="flex flex-col gap-3">
                            <Select 
                                placeholder="Expires In" 
                                defaultSelectedKey="24h"
                                onSelectionChange={(key) => {
                                    if (key !== null) {
                                        setExpiration(key.toString());
                                    }
                                }}
                            >
                                <Label>Expires In</Label>
                                <Select.Trigger>
                                     <Clock className="size-4 text-default-400 mr-2" />
                                     <Select.Value />
                                     <Select.Indicator />
                                </Select.Trigger>
                                <Select.Popover>
                                    <ListBox>
                                        {expirations.map((exp) => (
                                            <ListBox.Item key={exp.value} id={exp.value} textValue={exp.label}>
                                                {exp.label}
                                            </ListBox.Item>
                                        ))}
                                    </ListBox>
                                </Select.Popover>
                            </Select>
                            <Button 
                                variant="primary" 
                                onPress={handleGenerate} 
                                isPending={loading}
                                className="w-full"
                            >
                                Generate Link
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <div className="relative">
                                <Input
                                    readOnly
                                    value={link}
                                    variant="secondary"
                                />
                                <div className="absolute right-1 top-1/2 -translate-y-1/2 z-10">
                                    <Button
                                        isIconOnly
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 min-w-6"
                                        onPress={handleCopy}
                                    >
                                        {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                                    </Button>
                                </div>
                            </div>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onPress={() => { setLink(null); }}
                                className="w-full"
                            >
                                Generate New Link
                            </Button>
                        </div>
                    )}
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}
