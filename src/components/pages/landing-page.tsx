
"use client"

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Upload, Lock, Zap, MessageSquareQuote } from "lucide-react";
import Link from "next/link";
import { Logo } from "../icons";
import { PricingSection } from "../pricing-section";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PlaceHolderImages } from "@/lib/placeholder-images";

const features = [
    {
        icon: <Upload className="h-8 w-8" />,
        title: "Effortless Upload & Ingestion",
        description: "Quickly upload call recordings in any format. Our system automatically processes and organizes them for you.",
    },
    {
        icon: <Search className="h-8 w-8" />,
        title: "Powerful Search",
        description: "Instantly find any recording with our powerful search that scans contacts, dates, and even transcript content.",
    },
    {
        icon: <Zap className="h-8 w-8" />,
        title: "AI-Powered Transcription",
        description: "Get accurate, speaker-separated transcripts for all your calls, with optional advanced AI models for higher accuracy and analysis.",
    },
];

const testimonials = [
    {
        name: "Sarah L.",
        role: "Freelance Consultant",
        quote: "CallOrganizer has been a game-changer for my business. I can finally find important client conversations in seconds. The search is incredibly fast and the transcription is surprisingly accurate!",
        avatarId: "user5",
    },
    {
        name: "Michael B.",
        role: "Sales Manager",
        quote: "We use CallOrganizer to onboard new sales reps. They can listen to calls from our top performers and learn what works. It's cut our ramp-up time in half.",
        avatarId: "user6",
    },
    {
        name: "Jessica P.",
        role: "Small Business Owner",
        quote: "As someone who isn't very tech-savvy, I was worried about setup. But the file ingestion is so simple. I just upload my files and everything is organized automatically. It's saved me hours of manual work.",
        avatarId: "user7",
    }
];


export function LandingPage() {
    return (
        <div className="flex flex-col min-h-[calc(100vh-4rem)]">
            <main className="flex-1">
                {/* Hero Section */}
                <section className="w-full py-20 md:py-32 lg:py-40">
                    <div className="container mx-auto px-4 md:px-6 text-center">
                        <div className="max-w-3xl mx-auto space-y-4">
                            <div className="flex justify-center items-center gap-4">
                                <Logo className="h-16 w-16 text-primary" />
                                <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl">
                                    CallOrganizer
                                </h1>
                            </div>
                            <p className="text-lg text-muted-foreground md:text-xl">
                                Your all-in-one solution to organize, search, and manage call recordings effortlessly. Turn messy audio files into a structured, searchable knowledge base.
                            </p>
                        </div>
                        <div className="mt-8 flex justify-center gap-4">
                            <Button asChild size="lg">
                                <Link href="/signup">Get Started for Free</Link>
                            </Button>
                            <Button asChild variant="outline" size="lg">
                                <Link href="/login">Sign In</Link>
                            </Button>
                        </div>
                    </div>
                </section>

                {/* Features Section */}
                <section id="features" className="w-full py-12 md:py-24 lg:py-32 bg-muted/40">
                    <div className="container mx-auto px-4 md:px-6">
                        <div className="text-center mb-12">
                            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">Why You'll Love CallOrganizer</h2>
                            <p className="max-w-[700px] mx-auto text-muted-foreground md:text-lg">
                                From automated organization to powerful AI features, we've built the tools you need to stay on top of your call data.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                            {features.map((feature) => (
                                <Card key={feature.title} className="text-center p-6">
                                    <div className="flex justify-center mb-4 text-primary">
                                        {feature.icon}
                                    </div>
                                    <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                                    <p className="text-muted-foreground">{feature.description}</p>
                                </Card>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Pricing Section */}
                <section id="pricing" className="w-full py-12 md:py-24 lg:py-32">
                    <div className="container mx-auto px-4 md:px-6">
                        <PricingSection />
                    </div>
                </section>

                 {/* Testimonials Section */}
                <section id="testimonials" className="w-full py-12 md:py-24 lg:py-32 bg-muted/40">
                    <div className="container mx-auto px-4 md:px-6">
                        <div className="text-center mb-12">
                            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">Trusted by Professionals</h2>
                            <p className="max-w-[700px] mx-auto text-muted-foreground md:text-lg">
                                See what our users have to say about how CallOrganizer transformed their workflow.
                            </p>
                        </div>
                        <Carousel
                            opts={{
                                align: "start",
                                loop: true,
                            }}
                            className="w-full max-w-4xl mx-auto"
                        >
                            <CarouselContent>
                                {testimonials.map((testimonial, index) => {
                                    const avatar = PlaceHolderImages.find(img => img.id === testimonial.avatarId);
                                    return (
                                        <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/3">
                                            <div className="p-1 h-full">
                                                <Card className="flex flex-col justify-between h-full">
                                                    <CardHeader>
                                                        <div className="flex items-center gap-4">
                                                            <Avatar>
                                                                {avatar && <AvatarImage src={avatar.imageUrl} alt={testimonial.name} />}
                                                                <AvatarFallback>{testimonial.name.charAt(0)}</AvatarFallback>
                                                            </Avatar>
                                                            <div>
                                                                <p className="font-semibold">{testimonial.name}</p>
                                                                <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                                                            </div>
                                                        </div>
                                                    </CardHeader>
                                                    <CardContent>
                                                        <blockquote className="text-muted-foreground">
                                                          "{testimonial.quote}"
                                                        </blockquote>
                                                    </CardContent>
                                                </Card>
                                            </div>
                                        </CarouselItem>
                                    )
                                })}
                            </CarouselContent>
                            <CarouselPrevious />
                            <CarouselNext />
                        </Carousel>
                    </div>
                </section>

                {/* Creator's Message Section */}
                <section className="w-full py-12 md:py-24 lg:py-32">
                    <div className="container mx-auto px-4 md:px-6">
                        <Card className="p-8 md:p-12 lg:flex lg:items-center lg:gap-12 bg-card">
                             <div className="flex-shrink-0 flex justify-center lg:justify-start mb-6 lg:mb-0">
                                <MessageSquareQuote className="h-24 w-24 text-primary"/>
                            </div>
                            <div className="text-center lg:text-left">
                                <h3 className="text-2xl font-bold">A Message from the Creator</h3>
                                <blockquote className="mt-4 text-lg text-muted-foreground italic">
                                    "I created CallOrganizer because I was drowning in a sea of unorganized audio files from important business calls. Finding a specific piece of information was impossible. I knew there had to be a better way. This tool is the result: a simple, powerful platform to bring order to the chaos of call recordings. I hope it helps you as much as it has helped me."
                                </blockquote>
                                <p className="mt-4 font-semibold">— The CallOrganizer Team</p>
                            </div>
                        </Card>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="bg-muted p-6 md:py-8 w-full border-t">
                <div className="container mx-auto px-4 md:px-6 flex flex-col md:flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Logo className="h-5 w-5 text-primary" />
                        <span className="font-semibold">CallOrganizer</span>
                    </div>
                    <nav className="flex gap-4 sm:gap-6 mt-4 md:mt-0 text-sm">
                        <Link href="/#features" className="text-muted-foreground hover:text-foreground">
                            Features
                        </Link>
                         <Link href="/#pricing" className="text-muted-foreground hover:text-foreground">
                            Pricing
                        </Link>
                         <Link href="/terms-of-service" className="text-muted-foreground hover:text-foreground">
                            Terms of Service
                        </Link>
                         <Link href="/privacy-policy" className="text-muted-foreground hover:text-foreground">
                            Privacy Policy
                        </Link>
                    </nav>
                </div>
            </footer>
        </div>
    );
}
