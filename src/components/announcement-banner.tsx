'use client';

import React, { useEffect, useState } from 'react';
import { getActiveAnnouncements } from '@/app/actions/admin-announcements';
import { AnnouncementResponse } from '@/lib/db/types';
import { Alert, CloseButton } from '@heroui/react';

export function AnnouncementBanner() {
    const [announcements, setAnnouncements] = useState<AnnouncementResponse[]>([]);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());

    useEffect(() => {
        // Fetch active announcements on mount
        const fetchAnnouncements = async () => {
            try {
                const data = await getActiveAnnouncements();
                setAnnouncements(data);
            } catch (error) {
                void error;
            }
        };
        fetchAnnouncements();
    }, []);

    const handleDismiss = (id: string) => {
        setDismissed(prev => {
            const newSet = new Set(prev);
            newSet.add(id);
            return newSet;
        });
    };

    const getAlertStatus = (type: string): "default" | "success" | "warning" | "danger" | "accent" => {
        switch (type) {
            case 'success': return 'success';
            case 'warning': return 'warning';
            case 'alert': return 'danger';
            case 'info': return 'accent'; // Use accent for info to stand out
            default: return 'default';
        }
    };

    const visibleAnnouncements = announcements.filter(a => !dismissed.has(a.id));

    if (visibleAnnouncements.length === 0) return null;

    return (
        <div className="space-y-4 mb-6">
            {visibleAnnouncements.map((ann) => (
                <Alert
                    key={ann.id}
                    status={getAlertStatus(ann.type)}
                    className="shadow-sm border-1"
                >
                    <Alert.Indicator />
                    <Alert.Content>
                        <Alert.Title>{ann.title}</Alert.Title>
                        <Alert.Description className="whitespace-pre-wrap">
                            {ann.message}
                        </Alert.Description>
                    </Alert.Content>
                    <CloseButton onPress={() => handleDismiss(ann.id)} />
                </Alert>
            ))}
        </div>
    );
}
