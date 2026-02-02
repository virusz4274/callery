'use client';

import React from 'react';
import { Card, Button, Input, TextArea, TextField, Label } from "@heroui/react";
import { Mail, MessageCircle, FileText } from 'lucide-react';
import { AppHeader } from '@/components/app-header';
import { FooterSection } from '@/components/landing/footer-section';

export default function SupportPage() {
    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Note: The main Layout usually wraps pages, but for standalone pages like this 
           we might need to ensure header consistency if it's not in the main dashboard layout. 
           However, given the file structure, this page will likely be rendered inside the root layout 
           which handles the header if structured correctly. 
           For now, we'll assume it renders in the main layout area. 
       */}

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
                            Have a question or need assistance? Send us a message and we'll get back to you as soon as possible.
                        </p>
                        <Button className="w-full bg-primary text-white">
                            Start Chat
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
                            Check our detailed documentation and frequently asked questions to find quick answers.
                        </p>
                        <Button className="w-full bg-secondary text-white">
                            View Docs
                        </Button>
                    </Card>
                </div>

                <Card className="p-8">
                    <h2 className="text-2xl font-bold mb-6">Send us a message</h2>
                    <form className="space-y-4">
                        <div className="grid md:grid-cols-2 gap-4">
                            <TextField>
                                <Label>Name</Label>
                                <Input placeholder="Your name" />
                            </TextField>
                            <TextField>
                                <Label>Email</Label>
                                <Input placeholder="your@email.com" type="email" />
                            </TextField>
                        </div>
                        <TextField>
                            <Label>Subject</Label>
                            <Input placeholder="How can we help?" />
                        </TextField>
                        <TextField>
                            <Label>Message</Label>
                            <TextArea placeholder="Describe your issue..." minRows={4} />
                        </TextField>
                        <div className="flex justify-end mt-4">
                            <Button className="bg-primary text-white" type="submit">
                                Send Message
                            </Button>
                        </div>
                    </form>
                </Card>
            </div>
        </div>
    );
}
