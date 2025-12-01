
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";

export default function PricingPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Pricing</h1>
                <p className="text-muted-foreground">Choose the plan that's right for you.</p>
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
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> 25 Recordings</li>
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
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Unlimited Recordings</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Advanced AI Transcription</li>
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
        </div>
    );
}
