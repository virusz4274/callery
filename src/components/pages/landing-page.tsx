"use client"

import { Button, Card, Avatar, Chip } from "@heroui/react";
import { Search, Upload, Zap, MessageSquareQuote } from "lucide-react";
import { useRouter } from "next/navigation";
import { Logo } from "../icons";
import { PricingSection } from "../pricing-section";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import React from "react";
import Link from "next/link"; // Changed to default export

const features = [
    {
        icon: <Upload className="h-6 w-6" />,
        title: "Effortless Ingestion",
        description: "Drag & drop call recordings in any format. We handle the processing and organization instantly.",
        color: "primary"
    },
    {
        icon: <Search className="h-6 w-6" />,
        title: "Deep Search",
        description: "Find exactly what was said. Search across transcripts, dates, and contacts with pinpoint accuracy.",
        color: "secondary"
    },
    {
        icon: <Zap className="h-6 w-6" />,
        title: "AI Transcription",
        description: "Get accurate, speaker-diarized transcripts. Turn audio into actionable text in seconds.",
        color: "warning"
    },
];

const testimonials = [
    {
        name: "Sarah L.",
        role: "Freelance Consultant",
        quote: "Call Memo has been a game-changer. I can finally find important client conversations in seconds. The search is incredibly fast!",
        avatarId: "user5",
    },
    {
        name: "Michael B.",
        role: "Sales Manager",
        quote: "We use Call Memo to onboard new sales reps. Listening to top performers' calls cut our ramp-up time in half.",
        avatarId: "user6",
    },
    {
        name: "Jessica P.",
        role: "Small Business Owner",
        quote: "File ingestion is so simple. I just upload my files and everything is organized automatically. It's saved me hours.",
        avatarId: "user7",
    }
];

export function LandingPage() {
    const router = useRouter();

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-primary/20">
            <main className="flex-1">
                {/* Hero Section */}
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
                                Your all-in-one solution to organize, search, and manage call recordings.
                                Transform messy audio into a structured knowledge base.
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
                                                    {[
                                                        { name: "Client Sync - Project X", time: "2 mins ago", status: "Processing", color: "warning" },
                                                        { name: "Weekly Team Standup", time: "2 hours ago", status: "Completed", color: "success" },
                                                        { name: "Discovery Call - Acme", time: "5 hours ago", status: "Completed", color: "success" },
                                                        { name: "Q3 Roadmap Review", time: "1 day ago", status: "Analyzed", color: "accent" },
                                                    ].map((item, i) => (
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
                                                            <Chip size="sm" variant="soft" color={item.color as any} className="h-6 text-[10px]">
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

                {/* Social Proof */}
                <section className="py-12 border-y border-default-100 bg-default-50/50">
                    <div className="container mx-auto px-4 text-center">
                        <p className="text-small font-medium text-default-400 mb-6 uppercase tracking-wider">Trusted by innovative teams at</p>
                        <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                            {/* Placeholder Company Logos */}
                            {['Acme Corp', 'GlobalTech', 'Nebula', 'Circle', 'FoxRun'].map((name) => (
                                <div key={name} className="text-xl font-bold font-serif text-default-600 flex items-center gap-2">
                                    <div className="h-6 w-6 rounded-full bg-current" />
                                    {name}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Features Section */}
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
                            {features.map((feature, idx) => (
                                <Card key={feature.title} className="p-1 h-full bg-gradient-to-br from-content1 to-content2/50 border-none shadow-medium hover:shadow-xl transition-shadow duration-300">
                                    <div className="h-full bg-background/80 backdrop-blur-md rounded-lg p-6 flex flex-col items-start gap-4 hover:bg-background/40 transition-colors">
                                        <div className={`p-3 rounded-xl bg-${feature.color}/10 text-${feature.color}`}>
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
                </section>

                {/* Stats Section */}
                <section className="py-24 bg-primary text-primary-foreground relative overflow-hidden">
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
                </section>

                {/* Pricing Placeholder */}
                <section id="pricing" className="w-full py-24 bg-default-50">
                    <div className="container mx-auto px-4 md:px-6">
                        <PricingSection />
                    </div>
                </section>

                {/* Testimonials Section */}
                <section id="testimonials" className="w-full py-24 md:py-32">
                    <div className="container mx-auto px-4 md:px-6">
                        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
                            <div className="max-w-xl">
                                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">Loved by our users</h2>
                                <p className="text-default-500 text-lg">
                                    Join thousands of professionals who trust Call Memo to manage their conversations.
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                className="font-medium"
                            >
                                Read more stories
                                <div className="h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center text-[10px] ml-2">&rarr;</div>
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {testimonials.map((testimonial, index) => {
                                const avatar = PlaceHolderImages.find(img => img.id === testimonial.avatarId);
                                return (
                                    <Card key={index} className="p-6 bg-content1 border border-default-100 shadow-sm hover:shadow-md transition-all">
                                        <div className="flex gap-4 mb-4">
                                            <Avatar size="md" className="flex-shrink-0">
                                                <Avatar.Image src={avatar?.imageUrl} alt={testimonial.name} />
                                                <Avatar.Fallback>{testimonial.name.charAt(0)}</Avatar.Fallback>
                                            </Avatar>
                                            <div>
                                                <p className="font-semibold text-foreground">{testimonial.name}</p>
                                                <p className="text-xs text-default-400">{testimonial.role}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 mb-3 text-warning">
                                            {[1, 2, 3, 4, 5].map(i => (
                                                <svg key={i} className="w-4 h-4 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                                            ))}
                                        </div>
                                        <blockquote className="text-default-500 text-sm leading-relaxed">
                                            "{testimonial.quote}"
                                        </blockquote>
                                    </Card>
                                )
                            })}
                        </div>
                    </div>
                </section>

                {/* Creator's Message - Redesigned */}
                <section className="w-full py-24 bg-gradient-to-br from-primary/5 to-secondary/5">
                    <div className="container mx-auto px-4 md:px-6">
                        <Card className="max-w-4xl mx-auto overflow-visible !bg-transparent shadow-none border-none md:p-8">
                            <div className="relative bg-background rounded-2xl p-8 md:p-12 shadow-2xl border border-default-100">
                                <div className="absolute -top-10 -left-6 md:-left-10 bg-primary text-primary-foreground p-6 rounded-2xl shadow-xl transform -rotate-6">
                                    <MessageSquareQuote className="h-10 w-10" />
                                </div>

                                <div className="space-y-6">
                                    <h3 className="text-2xl font-bold">A Message from the Creator</h3>
                                    <p className="text-lg text-default-500 italic leading-relaxed">
                                        "I created Call Memo because I was drowning in a sea of unorganized audio files. Finding a specific piece of information was impossible. I knew there had to be a better way. This tool is the result: a simple, powerful platform to bring order to the chaos of call recordings."
                                    </p>
                                    <div className="flex items-center gap-4 pt-4 border-t border-default-100">
                                        <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-white font-bold text-xl">
                                            C
                                        </div>
                                        <div>
                                            <p className="font-semibold text-foreground">Call Memo Team</p>
                                            <p className="text-xs text-default-400">Founders</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>
                </section>
            </main>
            {/* Footer */}
            <footer className="bg-default-50 border-t border-default-200 py-12">
                <div className="container mx-auto px-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
                        <div className="col-span-1 md:col-span-2 space-y-4">
                            <div className="flex items-center gap-2">
                                <Logo className="h-8 w-8 text-primary" />
                                <span className="font-bold text-xl tracking-tight">Call Memo</span>
                            </div>
                            <p className="max-w-xs text-sm text-default-500">
                                Transforming how you store, search, and analyze your most important conversations.
                            </p>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-4">Product</h4>
                            <ul className="space-y-2 text-sm text-default-500">
                                <li><Link href="/#features" className="hover:text-primary transition-colors">Features</Link></li>
                                <li><Link href="/#pricing" className="hover:text-primary transition-colors">Pricing</Link></li>
                                <li><Link href="/changelog" className="hover:text-primary transition-colors">Changelog</Link></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-4">Legal</h4>
                            <ul className="space-y-2 text-sm text-default-500">
                                <li><Link href="/terms-of-service" className="hover:text-primary transition-colors">Terms of Service</Link></li>
                                <li><Link href="/privacy-policy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
                            </ul>
                        </div>
                    </div>
                    <div className="pt-8 border-t border-default-200 flex flex-col md:flex-row justify-between items-center gap-4">
                        <p className="text-xs text-default-400">© 2024 Call Memo. All rights reserved.</p>
                        <div className="flex gap-4">
                            {/* Social Icons Placeholder */}
                            <div className="w-8 h-8 rounded-full bg-default-200/50 flex items-center justify-center text-default-500 hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer">
                                <span className="sr-only">Twitter</span>
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path></svg>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-default-200/50 flex items-center justify-center text-default-500 hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer">
                                <span className="sr-only">GitHub</span>
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                            </div>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}

