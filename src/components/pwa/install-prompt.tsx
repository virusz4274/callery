'use client';

import { useState, useEffect } from 'react';
import { Button } from '@heroui/react';
import { Download, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * Custom PWA Install Prompt component.
 * Shows a bottom sheet/banner when the browser detects the app can be installed.
 */
export function InstallPwaPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isIOS, setIsIOS] = useState(false);

    useEffect(() => {
        // Check if device is iOS
        const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        setIsIOS(isIosDevice);

        // Check if running in standalone mode (already installed)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;

        if (isStandalone) {
            return;
        }

        const handleBeforeInstallPrompt = (e: any) => {
            // Prevent Chrome 67 and earlier from automatically showing the prompt
            e.preventDefault();
            // Stash the event so it can be triggered later.
            setDeferredPrompt(e);
            // Update UI to notify the user they can add to home screen
            setIsVisible(true);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        // For iOS, check if we should show a custom instruction (optional logic)
        // Usually we check simply if it's not standalone and IS iOS
        if (isIosDevice && !isStandalone) {
            // Logic to show iOS instructions could go here
            // For now we keep it simple or show it once per session
            const hasSeenPrompt = sessionStorage.getItem('ios-install-prompt-seen');
            if (!hasSeenPrompt) {
                setIsVisible(true);
            }
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) {
            // If iOS, we can't programmatically trigger install, so just close or show modal
            if (isIOS) {
                // Ideally show a modal with instructions
                alert("To install on iOS: Tap 'Share' icon and select 'Add to Home Screen'");
                handleDismiss();
            }
            return;
        }

        // Show the install prompt
        deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const choiceResult = await deferredPrompt.userChoice;

        if (choiceResult.outcome === 'accepted') {
            console.log('User accepted the A2HS prompt');
        } else {
            console.log('User dismissed the A2HS prompt');
        }

        setDeferredPrompt(null);
        setIsVisible(false);
    };

    const handleDismiss = () => {
        setIsVisible(false);
        if (isIOS) {
            sessionStorage.setItem('ios-install-prompt-seen', 'true');
        }
    };

    if (!isVisible) return null;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 p-4 bg-background/80 backdrop-blur-lg border border-default-200 rounded-lg shadow-lg flex flex-col gap-3"
                >
                    <div className="flex items-start justify-between">
                        <div className="flex gap-3">
                            <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <img src="/icons/android-chrome-192x192.png" alt="VoSift" className="size-8 object-contain" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm">Install VoSift</h3>
                                <p className="text-xs text-muted-foreground">
                                    {isIOS
                                        ? "Add to Home Screen for the best experience."
                                        : "Install our app for easier access and better performance."}
                                </p>
                            </div>
                        </div>
                        <button onClick={handleDismiss} className="text-default-400 hover:text-default-600">
                            <X className="size-4" />
                        </button>
                    </div>

                    <Button
                        size="sm"
                        variant="primary"
                        onPress={handleInstallClick}
                        className="w-full"
                    >
                        {!isIOS && <Download className="size-3 mr-2" />}
                        {isIOS ? "How to Install" : "Install App"}
                    </Button>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
