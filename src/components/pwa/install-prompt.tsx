'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Chip, Card } from '@heroui/react';
import { Download, Share2, Smartphone, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Logo } from '@/components/icons';

type DeferredInstallPrompt = {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export function InstallPwaPrompt() {
    const reduceMotion = useReducedMotion();
    const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [showIosSteps, setShowIosSteps] = useState(false);

    const isIOS = useMemo(() => {
        if (typeof navigator === 'undefined' || typeof window === 'undefined') {
            return false;
        }
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
    }, []);

    useEffect(() => {
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone;
        if (isStandalone) {
            return;
        }

        const checkDismissal = () => {
            const dismissedAt = localStorage.getItem('install-prompt-dismissed-at');
            if (!dismissedAt) {
                return false;
            }

            const diff = Date.now() - parseInt(dismissedAt, 10);
            return diff < 7 * 24 * 60 * 60 * 1000;
        };

        if (checkDismissal()) {
            return;
        }

        const handleBeforeInstallPrompt = (event: Event) => {
            const promptEvent = event as Event & DeferredInstallPrompt & { preventDefault: () => void };
            promptEvent.preventDefault();
            setDeferredPrompt(promptEvent);

            if (!checkDismissal()) {
                setIsVisible(true);
            }
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        if (isIOS && !isStandalone && !checkDismissal()) {
            setTimeout(() => setIsVisible(true), 0);
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, [isIOS]);

    const handleInstallClick = async () => {
        if (!deferredPrompt) {
            if (isIOS) {
                setShowIosSteps((prev) => !prev);
            }
            return;
        }

        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;

        setDeferredPrompt(null);
        setIsVisible(false);
    };

    const handleDismiss = () => {
        setIsVisible(false);
        setShowIosSteps(false);
        localStorage.setItem('install-prompt-dismissed-at', Date.now().toString());
    };

    if (!isVisible) {
        return null;
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.15 }}
                className="relative mx-3 my-2 md:pointer-fine:fixed md:pointer-fine:bottom-4 md:pointer-fine:left-auto md:pointer-fine:right-4 md:pointer-fine:z-[60] md:pointer-fine:m-0 md:pointer-fine:w-[24rem]"
            >
                <Card className="overflow-hidden p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
                                <Logo className="size-8" />
                            </div>
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-sm font-semibold text-foreground">Install Callery</h3>
                                    <Chip size="sm" variant="soft" color="accent">
                                        {isIOS ? 'iPhone / iPad' : 'App install available'}
                                    </Chip>
                                </div>
                                <p className="text-sm leading-6 text-muted">
                                    {isIOS
                                        ? 'Add Callery to your home screen for faster access to your call archive.'
                                        : 'Install the app for quicker access, better launch behavior, and a more reliable mobile workflow.'}
                                </p>
                            </div>
                        </div>
                        <Button isIconOnly variant="ghost" size="sm" className="size-11 shrink-0" onPress={handleDismiss} aria-label="Dismiss install prompt">
                            <X className="size-4" />
                        </Button>
                    </div>

                    <div className="mt-4 hidden gap-3 md:grid md:grid-cols-2">
                        <div className="rounded-xl border border-border bg-default-50/70 p-3">
                            <p className="text-xs font-semibold uppercase text-muted">Why install</p>
                            <p className="mt-2 text-sm leading-6 text-muted">
                                Faster returning sessions, cleaner fullscreen feel, and easier access while reviewing calls on mobile.
                            </p>
                        </div>
                        <div className="rounded-xl border border-border bg-default-50/70 p-3">
                            <p className="text-xs font-semibold uppercase text-muted">Prompt timing</p>
                            <p className="mt-2 text-sm leading-6 text-muted">
                                If you dismiss this, we will wait a week before asking again.
                            </p>
                        </div>
                    </div>

                    {isIOS && showIosSteps && (
                        <div className="mt-4 rounded-xl border border-border bg-background p-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                <Share2 className="size-4 text-primary" />
                                Install on iPhone or iPad
                            </div>
                            <ol className="mt-3 space-y-2 text-sm leading-6 text-muted">
                                <li>1. Open the browser share menu.</li>
                                <li>2. Choose <span className="font-medium text-foreground">Add to Home Screen</span>.</li>
                                <li>3. Confirm the app name, then tap <span className="font-medium text-foreground">Add</span>.</li>
                            </ol>
                        </div>
                    )}

                    <div className="mt-4 flex gap-3">
                        <Button variant="ghost" className="flex-1" onPress={handleDismiss}>
                            Not now
                        </Button>
                        <Button size="sm" variant="primary" onPress={handleInstallClick} className="flex-1 font-semibold">
                            {isIOS ? <Smartphone className="mr-2 size-4" /> : <Download className="mr-2 size-4" />}
                            {isIOS ? (showIosSteps ? 'Hide steps' : 'Show steps') : 'Install app'}
                        </Button>
                    </div>
                </Card>
            </motion.div>
        </AnimatePresence>
    );
}
