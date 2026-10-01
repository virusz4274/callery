"use client";

import React from "react";
import Link from "next/link";
import { Logo } from "../icons";

export function FooterSection() {
    return (
        <footer className="bg-default-50 border-t border-default-200 py-12">
            <div className="container mx-auto px-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
                    <div className="col-span-1 md:col-span-2 space-y-4">
                        <div className="flex items-center gap-2">
                            <Logo className="h-8 w-8 text-primary" />
                            <span className="font-bold text-xl tracking-tight">VoSift</span>
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
                    <p className="text-xs text-default-400">© {new Date().getFullYear()} VoSift. All rights reserved.</p>
                </div>
            </div>
        </footer>
    );
}
