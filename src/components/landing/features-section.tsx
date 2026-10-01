"use client";

import { Card } from "@heroui/react";
import { Upload, Search, Zap } from "lucide-react";
import React from "react";

// Static classes: Tailwind can't generate `bg-${color}` interpolations.
const features = [
    {
        icon: <Upload className="h-6 w-6" />,
        title: "Effortless Ingestion",
        description: "Drag & drop call recordings in any format. We handle the processing and organization instantly.",
        className: "bg-primary/10 text-primary"
    },
    {
        icon: <Search className="h-6 w-6" />,
        title: "Deep Search",
        description: "Find exactly what was said. Search across transcripts, dates, and contacts with pinpoint accuracy.",
        className: "bg-secondary/10 text-secondary"
    },
    {
        icon: <Zap className="h-6 w-6" />,
        title: "AI Transcription",
        description: "Get accurate, speaker-diarized transcripts. Turn audio into actionable text in seconds.",
        className: "bg-warning/10 text-warning"
    },
];

export function FeaturesSection() {
    return (
        <section id="features" className="w-full py-24 md:py-32">
            <div className="container mx-auto px-4 md:px-6">
                <div className="text-center mb-16 md:mb-24">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl mb-4">
                        Everything you need to <br />
                        <span className="text-primary">master your calls</span>
                    </h2>
                    <p className="max-w-[700px] mx-auto text-default-500 md:text-lg">
                        Powerful features designed to turn your audio archives into accessible, searchable assets.
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {features.map((feature) => (
                        <Card key={feature.title} className="p-1 h-full bg-gradient-to-br from-content1 to-content2/50 border-none shadow-medium hover:shadow-xl transition-shadow duration-300">
                            <div className="h-full bg-background/80 backdrop-blur-md rounded-lg p-6 flex flex-col items-start gap-4 hover:bg-background/40 transition-colors">
                                <div className={`p-3 rounded-xl ${feature.className}`}>
                                    {feature.icon}
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                                    <p className="text-default-500 leading-relaxed text-sm">
                                        {feature.description}
                                    </p>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>

            {/* Stats Section */}
            <div className="py-24 mt-24 bg-primary text-primary-foreground relative overflow-hidden">
                <div className="absolute inset-0 bg-black/10" />
                <div className="container mx-auto px-4 relative z-10">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                        {[
                            { label: "Calls Processed", value: "10k+" },
                            { label: "Search Queries", value: "50k+" },
                            { label: "Active Users", value: "2k+" },
                            { label: "Time Saved", value: "1000h+" }
                        ].map((stat) => (
                            <div key={stat.label} className="space-y-1">
                                <div className="text-4xl md:text-5xl font-bold">{stat.value}</div>
                                <div className="text-sm md:text-base opacity-80 font-medium">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
