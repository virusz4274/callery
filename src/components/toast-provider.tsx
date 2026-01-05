
"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
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
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none">
                {toasts.map((t) => (
                    <div key={t.id} className="pointer-events-auto animate-in slide-in-from-bottom-5 fade-in duration-300 relative">
                        <Alert status={t.status} className="pr-10 shadow-lg">
                            <Alert.Indicator />
                            <Alert.Content>
                                {t.title && <Alert.Title className="font-bold">{t.title}</Alert.Title>}
                                {t.description && <Alert.Description>{t.description}</Alert.Description>}
                            </Alert.Content>
                        </Alert>
                        <button
                            onClick={() => dismiss(t.id)}
                            className="absolute top-2 right-2 p-1 rounded-full bg-background/20 hover:bg-background/40 transition-colors text-foreground"
                            aria-label="Close"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
