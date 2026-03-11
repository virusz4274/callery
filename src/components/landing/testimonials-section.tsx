'use client';

import { Button, Card, Avatar } from "@heroui/react";
import { MessageSquareQuote } from "lucide-react";
import { PlaceHolderImages } from "@/lib/placeholder-images";

const testimonials = [
    {
        name: "Sarah L.",
        role: "Freelance Consultant",
        quote: "VoSift has been a game-changer. I can finally find important client conversations in seconds. The search is incredibly fast!",
        avatarId: "user5",
    },
    {
        name: "Michael B.",
        role: "Sales Manager",
        quote: "We use VoSift to onboard new sales reps. Listening to top performers' calls cut our ramp-up time in half.",
        avatarId: "user6",
    },
    {
        name: "Jessica P.",
        role: "Small Business Owner",
        quote: "File ingestion is so simple. I just upload my files and everything is organized automatically. It's saved me hours.",
        avatarId: "user7",
    }
];

export function TestimonialsSection() {
    return (
        <section id="testimonials" className="w-full py-24 md:py-32">
            <div className="container mx-auto px-4 md:px-6">
                <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
                    <div className="max-w-xl">
                        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">Loved by our users</h2>
                        <p className="text-default-500 text-lg">
                            Join thousands of professionals who trust VoSift to manage their conversations.
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
                                    &quot;{testimonial.quote}&quot;
                                </blockquote>
                            </Card>
                        )
                    })}
                </div>
            </div>

            {/* Creator's Message */}
            <section className="w-full py-24 bg-gradient-to-br from-primary/5 to-secondary/5 mt-24">
                <div className="container mx-auto px-4 md:px-6">
                    <Card className="max-w-4xl mx-auto overflow-visible !bg-transparent shadow-none border-none md:p-8">
                        <div className="relative bg-background rounded-2xl p-8 md:p-12 shadow-2xl border border-default-100">
                            <div className="absolute -top-10 -left-6 md:-left-10 bg-primary text-primary-foreground p-6 rounded-2xl shadow-xl transform -rotate-6">
                                <MessageSquareQuote className="h-10 w-10" />
                            </div>

                            <div className="space-y-6">
                                <h3 className="text-2xl font-bold">A Message from the Creator</h3>
                                <p className="text-lg text-default-500 italic leading-relaxed">
                                    &quot;I created VoSift because I was drowning in a sea of unorganized audio files. Finding a specific piece of information was impossible. I knew there had to be a better way. This tool is the result: a simple, powerful platform to bring order to the chaos of call recordings.&quot;
                                </p>
                                <div className="flex items-center gap-4 pt-4 border-t border-default-100">
                                    <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-white font-bold text-xl">
                                        C
                                    </div>
                                    <div>
                                        <p className="font-semibold text-foreground">VoSift Team</p>
                                        <p className="text-xs text-default-400">Founders</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </section>
        </section>
    );
}
