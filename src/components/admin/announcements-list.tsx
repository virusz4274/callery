'use client';

import React, { useState, useTransition } from 'react';
import { Card, Button, Chip } from '@heroui/react';
import { Edit, Trash2, Calendar } from 'lucide-react';
import { AnnouncementResponse } from '@/lib/db/types';
import { deleteAnnouncement } from '@/app/actions/admin-announcements';
import { AnnouncementFormDialog } from './announcement-form-dialog';

type AnnouncementsListProps = {
    announcements: AnnouncementResponse[];
};

export function AnnouncementsList({ announcements }: AnnouncementsListProps) {
    const [editingAnnouncement, setEditingAnnouncement] = useState<AnnouncementResponse | null>(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [, startTransition] = useTransition();

    const handleDelete = (id: string) => {
        if (confirm('Delete this announcement?')) {
            startTransition(async () => {
                await deleteAnnouncement(id);
            });
        }
    };

    const getTypeColor = (
        type: string
    ): 'default' | 'accent' | 'success' | 'warning' | 'danger' => {
        switch (type) {
            case 'info': return 'accent';
            case 'warning': return 'warning';
            case 'alert': return 'danger';
            case 'success': return 'success';
            default: return 'default';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <Button
                    variant="primary"
                    onPress={() => setIsCreateOpen(true)}
                    className="rounded-full bg-primary px-5 text-white"
                >
                    Create Announcement
                </Button>
            </div>

            <div className="grid gap-4">
                {announcements.length === 0 && (
                    <div className="rounded-[1.5rem] bg-default-50 py-10 text-center text-default-500">
                        No announcements found.
                    </div>
                )}

                {announcements.map((ann) => (
                    <Card key={ann.id} className="rounded-[1.75rem] border border-default-200/80 p-4 shadow-[0_20px_54px_-42px_rgba(15,23,42,0.4)]">
                        <div className="flex justify-between items-start gap-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-lg">{ann.title}</h3>
                                    <Chip
                                        size="sm"
                                        color={getTypeColor(ann.type)}
                                        variant="soft"
                                    >
                                        {ann.type.toUpperCase()}
                                    </Chip>
                                    {!ann.isActive && (
                                        <Chip size="sm" color="default" variant="soft">Inactive</Chip>
                                    )}
                                </div>
                                <p className="text-default-500 whitespace-pre-wrap line-clamp-2">{ann.message}</p>
                                <div className="flex items-center gap-4 text-xs text-default-400 mt-2">
                                    <div className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        <span>Start: {new Date(ann.startDate).toLocaleDateString()}</span>
                                    </div>
                                    {ann.endDate && (
                                        <div className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            <span>End: {new Date(ann.endDate).toLocaleDateString()}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    isIconOnly
                                    size="sm"
                                    variant="ghost"
                                    onPress={() => setEditingAnnouncement(ann)}
                                >
                                    <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                    isIconOnly
                                    size="sm"
                                    variant="ghost"
                                    className="text-danger"
                                    onPress={() => handleDelete(ann.id)}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Create Dialog */}
            <AnnouncementFormDialog
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
            />

            {/* Edit Dialog */}
            {editingAnnouncement && (
                <AnnouncementFormDialog
                    isOpen={!!editingAnnouncement}
                    announcementToEdit={editingAnnouncement}
                    onClose={() => setEditingAnnouncement(null)}
                />
            )}
        </div>
    );
}
