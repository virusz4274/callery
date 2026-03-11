'use client';

import { Card, Chip } from "@heroui/react";

export default function ChangelogPage() {
    const changes = [
        {
            version: 'v0.1.0',
            date: 'February 2, 2026',
            type: 'Beta',
            items: [
                'Initial beta release',
                'Call recording and transcription',
                'Contact management',
                'Basic file management'
            ]
        }
    ];

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <div className="flex-1 container mx-auto px-4 py-12 max-w-3xl">
                <div className="mb-12">
                    <h1 className="text-4xl font-bold mb-4">Changelog</h1>
                    <p className="text-default-500 text-lg">
                        Latest updates and improvements to VoSift.
                    </p>
                </div>

                <div className="space-y-8">
                    {changes.map((change) => (
                        <div key={change.version} className="relative pl-8 border-l border-default-200">
                            <div className="absolute left-[-5px] top-0 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
                            <div className="flex items-center gap-3 mb-2">
                                <h2 className="text-xl font-bold">{change.version}</h2>
                                <Chip size="sm" color="accent" variant="soft">{change.type}</Chip>
                                <span className="text-small text-default-400">{change.date}</span>
                            </div>
                            <ul className="list-disc list-outside ml-4 space-y-1 text-default-600">
                                {change.items.map((item, i) => (
                                    <li key={i}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
