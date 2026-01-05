
'use client';

import React from 'react';
import { Modal, Button, Link } from '@heroui/react';

interface GoogleConnectDialogProps {
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
}

export function GoogleConnectDialog({ onOpenChange, onConfirm }: GoogleConnectDialogProps) {
    return (
        <Modal isOpen onOpenChange={onOpenChange}>
            <Modal.Backdrop className="bg-background/20 backdrop-blur-md">
                <Modal.Container>
                    <Modal.Dialog className="bg-card/70 backdrop-blur-xl border border-default-200 shadow-2xl">
                        <Modal.CloseTrigger />
                        <Modal.Header>
                            <Modal.Heading>Connect Google Account</Modal.Heading>
                        </Modal.Header>
                        <Modal.Body>
                            <div className="space-y-4">
                                <p className="text-default-500">
                                    Connecting your Google account allows CallMemo to sync your contacts and better identify callers.
                                </p>
                                <div className="rounded-lg bg-default-100 p-4 text-sm text-default-600">
                                    <p className="mb-2 font-medium">We will only access:</p>
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li>Contact names and phone numbers</li>
                                        <li>Primary email addresses</li>
                                    </ul>
                                </div>
                                <p className="text-xs text-default-400">
                                    By clicking continue, you agree to our{' '}
                                    <Link href="/privacy" className="underline text-small">Privacy Policy</Link>
                                    {' '}regarding contact data usage.
                                </p>
                            </div>
                        </Modal.Body>
                        <Modal.Footer>
                            <Button variant="ghost" onPress={() => onOpenChange(false)}>Cancel</Button>
                            <Button variant="primary" onPress={onConfirm}>
                                Continue to Google
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}
