"use client"

import { PricingSection } from "../pricing-section";
import React from "react";
import { HeroSection } from "../landing/hero-section";
import { FeaturesSection } from "../landing/features-section";
import { TestimonialsSection } from "../landing/testimonials-section";
import { FooterSection } from "../landing/footer-section";

export function LandingPage() {
    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-primary/20">
            <main className="flex-1">
                {/* Hero Section */}
                <HeroSection />

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
                <FeaturesSection />

                {/* Pricing Placeholder */}
                <section id="pricing" className="w-full py-24 bg-default-50">
                    <div className="container mx-auto px-4 md:px-6">
                        <PricingSection />
                    </div>
                </section>

                {/* Testimonials Section */}
                <TestimonialsSection />
            </main>
            {/* Footer */}
            <FooterSection />
        </div>
    );
}

