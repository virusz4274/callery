"use client";

import { Button, Chip, Avatar, Card } from "@heroui/react";
import { Search, Upload, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import React from "react";

type MockRecording = {
    name: string;
    time: string;
    status: string;
    color: React.ComponentProps<typeof Chip>['color'];
};

const MOCK_RECORDINGS: MockRecording[] = [
    { name: "Client Sync - Project X", time: "2 mins ago", status: "Processing", color: "warning" },
    { name: "Weekly Team Standup", time: "2 hours ago", status: "Completed", color: "success" },
    { name: "Discovery Call - Acme", time: "5 hours ago", status: "Completed", color: "success" },
    { name: "Q3 Roadmap Review", time: "1 day ago", status: "Analyzed", color: "accent" },
];

export function HeroSection() {
    const router = useRouter();

    return (
        <section className="relative w-full py-24 md:py-32 lg:py-48 overflow-hidden">
            {/* Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10">
                <div className="absolute -top-[30%] -right-[10%] w-[700px] h-[700px] rounded-full bg-primary/10 blur-3xl opacity-50 animate-pulse" />
                <div className="absolute top-[20%] -left-[10%] w-[500px] h-[500px] rounded-full bg-secondary/10 blur-3xl opacity-40" />
            </div>

            <div className="container mx-auto px-4 md:px-6 relative z-10 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-default-100 border border-default-200 mb-8 animate-fade-in-up">
                    <Chip size="sm" color="success" variant="soft">New</Chip>
                    <span className="text-small text-default-500">AI-Powered Call Analysis v2.0</span>
                </div>

                <div className="max-w-4xl mx-auto space-y-6">
                    <h1 className="text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/50">
                        Turn Conversations <br />
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">Into Intelligence</span>
                    </h1>
                    <p className="max-w-2xl mx-auto text-xl text-default-500 md:text-2xl leading-relaxed">
                        Search deeper than words. Your all-in-one solution to organize, search, and manage call recordings.
                    </p>
                </div>

                <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4 items-center">
                    <Button
                        onPress={() => router.push("/signup")}
                        variant="primary"
                        size="lg"
                        className="font-semibold px-8 h-12 text-lg shadow-xl shadow-primary/20 hover:scale-105 transition-transform rounded-full"
                    >
                        Get Started Free
                    </Button>
                    <Button
                        onPress={() => router.push("/login")}
                        variant="ghost"
                        size="lg"
                        className="font-semibold px-8 h-12 text-lg hover:bg-default-100 rounded-full"
                    >
                        Sign In
                    </Button>
                </div>

                {/* Abstract UI representation / Dashboard Preview */}
                <div className="mt-16 sm:mt-24 relative max-w-5xl mx-auto hidden md:block">
                    <div className="relative rounded-xl border border-default-200 bg-background/50 backdrop-blur-xl shadow-2xl p-2 lg:p-4">
                        <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-secondary/5 to-background rounded-xl -z-10" />
                        <div className="rounded-lg overflow-hidden border border-default-100/50">
                            {/* Detailed UI Mockup */}
                            <div className="h-[450px] w-full bg-content2/50 flex flex-col font-sans">
                                {/* Window Controls */}
                                <div className="h-10 border-b border-default-200/50 flex items-center px-4 gap-2 bg-background/50">
                                    <div className="w-3 h-3 rounded-full bg-danger/80" />
                                    <div className="w-3 h-3 rounded-full bg-warning/80" />
                                    <div className="w-3 h-3 rounded-full bg-success/80" />
                                </div>

                                <div className="flex-1 flex overflow-hidden">
                                    {/* Sidebar */}
                                    <div className="w-48 bg-background/30 border-r border-default-200/50 flex flex-col p-4 gap-4 hidden sm:flex">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary font-medium text-sm">
                                                <Search className="w-4 h-4" />
                                                Dashboard
                                            </div>
                                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-default-500 hover:bg-default-100 transition-colors text-sm">
                                                <Upload className="w-4 h-4" />
                                                Recordings
                                            </div>
                                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-default-500 hover:bg-default-100 transition-colors text-sm">
                                                <Zap className="w-4 h-4" />
                                                Analytics
                                            </div>
                                        </div>
                                        <div className="mt-auto flex items-center gap-2 px-2">
                                            <Avatar size="sm" color="accent" className="ring-2 ring-background">
                                                <Avatar.Image src="https://i.pravatar.cc/150?u=a042581f4e29026704d" alt="Alex M." />
                                                <Avatar.Fallback>AM</Avatar.Fallback>
                                            </Avatar>
                                            <div className="text-xs">
                                                <p className="font-semibold text-foreground">Alex M.</p>
                                                <p className="text-default-400">Pro Plan</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Main Content */}
                                    <div className="flex-1 p-6 flex flex-col gap-6 overflow-hidden">
                                        {/* Header & Search */}
                                        <div className="flex justify-between items-center">
                                            <h2 className="text-xl font-bold text-foreground">Overview</h2>
                                            <div className="h-8 w-48 rounded-full bg-default-100 border border-default-200 flex items-center px-3 text-xs text-default-500 gap-2">
                                                <Search className="w-3 h-3" />
                                                <span>Search calls...</span>
                                            </div>
                                        </div>

                                        {/* Stats Cards */}
                                        <div className="grid grid-cols-3 gap-4">
                                            <Card className="p-3 bg-background/60 shadow-sm border border-default-100">
                                                <p className="text-xs text-default-500">Total Calls</p>
                                                <p className="text-xl font-bold text-foreground">1,248</p>
                                            </Card>
                                            <Card className="p-3 bg-background/60 shadow-sm border border-default-100">
                                                <p className="text-xs text-default-500">Processing</p>
                                                <p className="text-xl font-bold text-warning">12</p>
                                            </Card>
                                            <Card className="p-3 bg-background/60 shadow-sm border border-default-100">
                                                <p className="text-xs text-default-500">Saved Time</p>
                                                <p className="text-xl font-bold text-success">42h</p>
                                            </Card>
                                        </div>

                                        {/* Recent Activity List */}
                                        <div className="flex-1 bg-background/60 rounded-xl border border-default-100 p-4 space-y-3">
                                            <div className="flex justify-between items-center mb-2">
                                                <h3 className="text-sm font-semibold text-foreground">Recent Recordings</h3>
                                                <span className="text-xs text-primary cursor-pointer">View All</span>
                                            </div>
                                            {MOCK_RECORDINGS.map((item, i) => (
                                                <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-default-50 transition-colors group cursor-pointer">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-8 w-8 rounded-full bg-default-100 flex items-center justify-center text-default-500 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                                            <div className="w-4 h-4 rounded-full border-2 border-current" />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium text-foreground">{item.name}</p>
                                                            <p className="text-[10px] text-default-400">{item.time}</p>
                                                        </div>
                                                    </div>
                                                    <Chip size="sm" variant="soft" color={item.color} className="h-6 text-[10px]">
                                                        {item.status}
                                                    </Chip>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
