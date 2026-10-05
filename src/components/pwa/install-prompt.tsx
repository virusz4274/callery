'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Chip } from '@heroui/react';
import { Download, Share2, Smartphone, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';

type DeferredInstallPrompt = {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export function InstallPwaPrompt() {
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
                initial={{ y: 200, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 200, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 500 }}
                className="fixed bottom-24 left-4 right-4 z-[60] md:bottom-4 md:left-auto md:right-4 md:w-[24rem]"
            >
                <div className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/96 p-4 shadow-[0_24px_64px_-40px_rgba(15,23,42,0.45)] backdrop-blur-xl">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
                                <Image
                                    src="/icons/android-chrome-192x192.png"
                                    alt="Callery"
                                    width={34}
                                    height={34}
                                    className="size-8 object-contain"
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-sm font-semibold tracking-[-0.02em] text-foreground">Install Callery</h3>
                                    <Chip size="sm" variant="soft" color="accent">
                                        {isIOS ? 'iPhone / iPad' : 'App install available'}
                                    </Chip>
                                </div>
                                <p className="text-sm leading-6 text-default-500">
                                    {isIOS
                                        ? 'Add Callery to your home screen for faster access to your call archive.'
                                        : 'Install the app for quicker access, better launch behavior, and a more reliable mobile workflow.'}
                                </p>
                            </div>
                        </div>
                        <Button isIconOnly variant="ghost" size="sm" onPress={handleDismiss} aria-label="Dismiss install prompt">
                            <X className="size-4" />
                        </Button>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-default-200/80 bg-default-50/70 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-400">Why install</p>
                            <p className="mt-2 text-sm leading-6 text-default-500">
                                Faster returning sessions, cleaner fullscreen feel, and easier access while reviewing calls on mobile.
                            </p>
                        </div>
                        <div className="rounded-xl border border-default-200/80 bg-default-50/70 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-400">Prompt timing</p>
                            <p className="mt-2 text-sm leading-6 text-default-500">
                                If you dismiss this, we will wait a week before asking again.
                            </p>
                        </div>
                    </div>

                    {isIOS && showIosSteps && (
                        <div className="mt-4 rounded-xl border border-default-200/80 bg-background p-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                <Share2 className="size-4 text-primary" />
                                Install on iPhone or iPad
                            </div>
                            <ol className="mt-3 space-y-2 text-sm leading-6 text-default-500">
                                <li>1. Open the browser share menu.</li>
                                <li>2. Choose <span className="font-medium text-foreground">Add to Home Screen</span>.</li>
                                <li>3. Confirm the app name, then tap <span className="font-medium text-foreground">Add</span>.</li>
                            </ol>
                        </div>
                    )}

                    <div className="mt-4 flex gap-3">
                        <Button variant="ghost" className="flex-1 rounded-full" onPress={handleDismiss}>
                            Not now
                        </Button>
                        <Button size="sm" variant="primary" onPress={handleInstallClick} className="flex-1 rounded-full font-semibold">
                            {isIOS ? <Smartphone className="mr-2 size-4" /> : <Download className="mr-2 size-4" />}
                            {isIOS ? (showIosSteps ? 'Hide steps' : 'Show steps') : 'Install app'}
                        </Button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
