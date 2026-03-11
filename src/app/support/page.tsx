'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, Button, Input, TextArea, TextField, Label } from "@heroui/react";
import { MessageCircle, FileText } from 'lucide-react';
import { authFetch } from '@/lib/api-client';

export default function SupportPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitting(true);
        setSubmitStatus(null);

        try {
            const response = await authFetch('/api/support', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name,
                    email,
                    subject,
                    message,
                }),
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || 'Failed to send message');
            }

            setSubmitStatus({
                type: 'success',
                message: 'Your message has been sent. We will get back to you soon.',
            });
            setSubject('');
            setMessage('');
        } catch (error) {
            setSubmitStatus({
                type: 'error',
                message: error instanceof Error ? error.message : 'Failed to send message',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <div className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold mb-4">Help & Support</h1>
                    <p className="text-default-500 text-lg">
                        How can we help you today?
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6 mb-12">
                    <Card className="p-6">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 rounded-full bg-primary/10 text-primary">
                                <MessageCircle size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold">Contact Support</h3>
                                <p className="text-small text-default-500">Get in touch with our team</p>
                            </div>
                        </div>
                        <p className="text-default-500 mb-6">
                            Have a question or need assistance? Send us a message and we&apos;ll get back to you as soon as possible.
                        </p>
                        <a href="mailto:support@vosift.com" className="block">
                            <Button className="w-full bg-primary text-white">
                                Start Chat
                            </Button>
                        </a>
                    </Card>

                    <Card className="p-6">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 rounded-full bg-secondary/10 text-secondary">
                                <FileText size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold">Documentation</h3>
                                <p className="text-small text-default-500">Guides and FAQs</p>
                            </div>
                        </div>
                        <p className="text-default-500 mb-6">
                            Check our detailed documentation and frequently asked questions to find quick answers.
                        </p>
                        <Link href="/changelog" className="block">
                            <Button className="w-full bg-secondary text-white">
                                View Docs
                            </Button>
                        </Link>
                    </Card>
                </div>

                <Card className="p-8">
                    <h2 className="text-2xl font-bold mb-6">Send us a message</h2>
                    <form className="space-y-4" onSubmit={handleSubmit} id="support-form">
                        <div className="grid md:grid-cols-2 gap-4">
                            <TextField value={name} onChange={setName} isRequired>
                                <Label>Name</Label>
                                <Input placeholder="Your name" />
                            </TextField>
                            <TextField value={email} onChange={setEmail} isRequired>
                                <Label>Email</Label>
                                <Input placeholder="your@email.com" type="email" />
                            </TextField>
                        </div>
                        <TextField value={subject} onChange={setSubject} isRequired>
                            <Label>Subject</Label>
                            <Input placeholder="How can we help?" />
                        </TextField>
                        <TextField>
                            <Label>Message</Label>
                            <TextArea
                                placeholder="Describe your issue..."
                                rows={4}
                                value={message}
                                onChange={(event) => setMessage(event.target.value)}
                                required
                            />
                        </TextField>
                        {submitStatus && (
                            <p className={submitStatus.type === 'success' ? 'text-success text-sm' : 'text-danger text-sm'}>
                                {submitStatus.message}
                            </p>
                        )}
                        <div className="flex justify-end mt-4">
                            <Button className="bg-primary text-white" type="submit" isPending={isSubmitting}>
                                {isSubmitting ? 'Sending...' : 'Send Message'}
                            </Button>
                        </div>
                    </form>
                </Card>
            </div>
        </div>
    );
}
