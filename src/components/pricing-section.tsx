
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";

export function PricingSection() {
    return (
        <div className="space-y-12">
            <div className="text-center">
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Find the plan that's right for you</h2>
                <p className="text-muted-foreground mt-2">Simple, usage-based pricing that scales with your needs.</p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle>Free</CardTitle>
                        <CardDescription>For individuals just getting started.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="text-4xl font-bold">$0<span className="text-xl font-normal text-muted-foreground">/mo</span></div>
                        <ul className="space-y-2">
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> 100 MB Storage</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Basic Transcription</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Community Support</li>
                        </ul>
                    </CardContent>
                    <CardFooter>
                        <Button variant="outline" className="w-full">Get Started</Button>
                    </CardFooter>
                </Card>
                <Card className="border-primary">
                    <CardHeader>
                        <CardTitle>Pro</CardTitle>
                        <CardDescription>For professionals who need more power.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div className="text-4xl font-bold">$15<span className="text-xl font-normal text-muted-foreground">/mo</span></div>
                         <ul className="space-y-2">
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> 5 GB Storage</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Access to Advanced AI Transcription</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Priority Email Support</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Data Export</li>
                        </ul>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full">Upgrade to Pro</Button>
                    </CardFooter>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Enterprise</CardTitle>
                        <CardDescription>For teams and businesses with custom needs.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div className="text-4xl font-bold">Custom</div>
                         <ul className="space-y-2">
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Everything in Pro</li>
                             <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Unlimited Storage</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Team Collaboration</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Dedicated Account Manager</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Custom Integrations</li>
                        </ul>
                    </CardContent>
                    <CardFooter>
                        <Button variant="outline" className="w-full">Contact Sales</Button>
                    </CardFooter>
                </Card>
            </div>

            <div className="space-y-6">
                <div className="text-center">
                    <h3 className="text-2xl font-bold tracking-tight">Pay-as-you-go Add-ons</h3>
                    <p className="text-muted-foreground mt-1">Scale your features as you need them. Billed based on usage.</p>
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <Card>
                        <CardHeader className="flex-row items-start justify-between">
                            <div>
                                <CardTitle>Advanced AI Transcription</CardTitle>
                                <CardDescription>High-accuracy transcription powered by leading AI models.</CardDescription>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-bold">$0.05</p>
                                <p className="text-sm text-muted-foreground">/ minute</p>
                            </div>
                        </CardHeader>
                    </Card>
                     <Card>
                        <CardHeader className="flex-row items-start justify-between">
                             <div>
                                <CardTitle>Additional Storage</CardTitle>
                                <CardDescription>Add more storage space to your plan as your library grows.</CardDescription>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-bold">$2</p>
                                <p className="text-sm text-muted-foreground">/ GB / month</p>
                            </div>
                        </CardHeader>
                    </Card>
                </div>
            </div>
        </div>
    );
}
