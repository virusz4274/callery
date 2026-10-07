
"use client";

import React, { createContext, useContext, useState, useCallback } from 'react';
import { Alert, Button } from "@heroui/react";
import { X } from 'lucide-react';

export type ToastStatus = 'default' | 'accent' | 'success' | 'warning' | 'danger';

export interface Toast {
    id: string;
    title?: string;
    description?: string;
    status?: ToastStatus;
    duration?: number;
}

interface ToastContextType {
    toast: (props: Omit<Toast, 'id'>) => void;
    dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const dismiss = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const toast = useCallback(({ title, description, status = 'default', duration = 5000 }: Omit<Toast, 'id'>) => {
        const id = Math.random().toString(36).substring(2, 9);
        const newToast = { id, title, description, status, duration };
        setToasts((prev) => [...prev, newToast]);

        if (duration > 0) {
            setTimeout(() => {
                dismiss(id);
            }, duration);
        }
    }, [dismiss]);

    return (
        <ToastContext.Provider value={{ toast, dismiss }}>
            {children}
            <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 flex max-h-[calc(100dvh-1.5rem)] flex-col gap-2 overflow-y-auto pointer-events-none md:inset-x-auto md:top-auto md:bottom-4 md:right-4 md:w-full md:max-w-sm">
                {toasts.map((t) => (
                    <div key={t.id} className="pointer-events-auto animate-in slide-in-from-bottom-5 fade-in duration-300 relative">
                        <Alert status={t.status} className="min-w-0 pr-14 shadow-lg [overflow-wrap:anywhere]">
                            <Alert.Indicator />
                            <Alert.Content>
                                {t.title && <Alert.Title className="font-bold">{t.title}</Alert.Title>}
                                {t.description && <Alert.Description>{t.description}</Alert.Description>}
                            </Alert.Content>
                        </Alert>
                        <Button
                            isIconOnly
                            variant="ghost"
                            size="sm"
                            onPress={() => dismiss(t.id)}
                            className="absolute top-1 right-1 size-11 text-muted hover:text-foreground"
                            aria-label="Dismiss notification"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
