'use client';

import React, { useState } from 'react';
import { Card, Button, Input, TextArea, TextField, Label } from "@heroui/react";
import { Mail, MessageCircle, FileText, ChevronDown } from 'lucide-react';
import { useToast } from '@/components/toast-provider';

const FAQS = [
    {
        question: 'How do I upload call recordings?',
        answer: 'Go to the Upload page and drop your audio files (MP3, M4A, WAV, and more). Recordings are matched to your contacts automatically by phone number.',
    },
    {
        question: 'How does transcription work?',
        answer: 'Every upload can be transcribed automatically with speaker labels (diarization). You can also trigger transcription manually from any recording. Usage counts toward your plan quota.',
    },
    {
        question: 'How do I find a specific conversation?',
        answer: 'Use the search bar at the top for keyword search across contacts, transcripts, and summaries — or Semantic Search on the dashboard to find calls by meaning (e.g. "refund request").',
    },
    {
        question: 'How do contacts get matched to recordings?',
        answer: 'Connect your Google account in Settings → Data Sources to sync contacts. Recordings are linked by phone number, including ones uploaded before the contact existed.',
    },
    {
        question: 'Can I recover deleted recordings?',
        answer: 'No — deletion permanently removes the recording and its audio file. Use Archive instead if you want to hide a recording without deleting it.',
    },
    {
        question: 'How do I manage my subscription?',
        answer: 'Open Settings → Billing to upgrade, open the billing portal, or review invoices. Usage-based overage can be enabled there as well.',
    },
];

function FaqItem({ question, answer }: { question: string; answer: string }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="border-b border-default-100 last:border-0">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between gap-4 py-4 text-left"
            >
                <span className="font-medium">{question}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-default-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <p className="pb-4 text-sm text-default-500 leading-relaxed">{answer}</p>
            )}
        </div>
    );
}

export default function SupportPage() {
    const { toast } = useToast();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);

    const scrollTo = (id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSending(true);
        try {
            const response = await fetch('/api/support', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, subject, message }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || 'Failed to send message');
            }
            toast({ title: 'Message sent', description: 'We\u2019ll get back to you as soon as possible.', status: 'success' });
            setName('');
            setEmail('');
            setSubject('');
            setMessage('');
        } catch (error) {
            toast({
                title: 'Could not send message',
                description: error instanceof Error ? error.message : 'Please try again later.',
                status: 'danger',
            });
        } finally {
            setIsSending(false);
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
                            Have a question or need assistance? Send us a message and we&rsquo;ll get back to you as soon as possible.
                        </p>
                        <Button className="w-full bg-primary text-white" onPress={() => scrollTo('contact-form')}>
                            Send a Message
                        </Button>
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
                            Check our frequently asked questions below to find quick answers.
                        </p>
                        <Button className="w-full bg-secondary text-white" onPress={() => scrollTo('faq')}>
                            View FAQs
                        </Button>
                    </Card>
                </div>

                <Card className="p-8 mb-12 scroll-mt-20" id="faq">
                    <h2 className="text-2xl font-bold mb-2">Frequently Asked Questions</h2>
                    <div className="mt-4">
                        {FAQS.map((faq) => (
                            <FaqItem key={faq.question} question={faq.question} answer={faq.answer} />
                        ))}
                    </div>
                </Card>

                <Card className="p-8 scroll-mt-20" id="contact-form">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-full bg-primary/10 text-primary">
                            <Mail size={20} />
                        </div>
                        <h2 className="text-2xl font-bold">Send us a message</h2>
                    </div>
                    <form className="space-y-4" onSubmit={handleSubmit}>
                        <div className="grid md:grid-cols-2 gap-4">
                            <TextField>
                                <Label>Name</Label>
                                <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
                            </TextField>
                            <TextField>
                                <Label>Email</Label>
                                <Input placeholder="your@email.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                            </TextField>
                        </div>
                        <TextField>
                            <Label>Subject</Label>
                            <Input placeholder="How can we help?" value={subject} onChange={(e) => setSubject(e.target.value)} required />
                        </TextField>
                        <TextField>
                            <Label>Message</Label>
                            <TextArea placeholder="Describe your issue..." rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required />
                        </TextField>
                        <div className="flex justify-end mt-4">
                            <Button className="bg-primary text-white" type="submit" isPending={isSending} isDisabled={isSending}>
                                Send Message
                            </Button>
                        </div>
                    </form>
                </Card>
            </div>
        </div>
    );
}
