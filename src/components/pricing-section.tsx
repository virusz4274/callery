
import { Button, Card, Separator } from "@heroui/react";
import { Check } from "lucide-react";

export function PricingSection() {
    return (
        <div className="space-y-12">
            <div className="text-center">
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Find the plan that's right for you</h2>
                <p className="text-muted-foreground mt-2">Simple, usage-based pricing that scales with your needs.</p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <Card className="bg-card/70 backdrop-blur-xl border border-default-200">
                    <Card.Header className="flex flex-col items-start gap-1 pb-2">
                        <h3 className="text-xl font-bold">Free</h3>
                        <p className="text-small text-default-500">For individuals just getting started.</p>
                    </Card.Header>
                    <Separator />
                    <Card.Content className="gap-4">
                        <div className="text-4xl font-bold">$0<span className="text-xl font-normal text-muted-foreground">/mo</span></div>
                        <ul className="space-y-2">
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> 100 MB Storage</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Basic Transcription</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Community Support</li>
                        </ul>
                    </Card.Content>
                    <Card.Footer>
                        <Button variant="secondary" className="w-full">Get Started</Button>
                    </Card.Footer>
                </Card>
                <Card className="bg-card/70 backdrop-blur-xl border-primary border-2 shadow-lg scale-105 z-10">
                    <Card.Header className="flex flex-col items-start gap-1 pb-2">
                        <h3 className="text-xl font-bold text-primary">Pro</h3>
                        <p className="text-small text-default-500">For professionals who need more power.</p>
                    </Card.Header>
                    <Separator />
                    <Card.Content className="gap-4">
                        <div className="text-4xl font-bold">$15<span className="text-xl font-normal text-muted-foreground">/mo</span></div>
                        <ul className="space-y-2">
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> 5 GB Storage</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Access to Advanced AI Transcription</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Priority Email Support</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Data Export</li>
                        </ul>
                    </Card.Content>
                    <Card.Footer>
                        <Button variant="primary" className="w-full shadow-lg">Upgrade to Pro</Button>
                    </Card.Footer>
                </Card>
                <Card className="bg-card/70 backdrop-blur-xl border border-default-200">
                    <Card.Header className="flex flex-col items-start gap-1 pb-2">
                        <h3 className="text-xl font-bold">Enterprise</h3>
                        <p className="text-small text-default-500">For teams and businesses with custom needs.</p>
                    </Card.Header>
                    <Separator />
                    <Card.Content className="gap-4">
                        <div className="text-4xl font-bold">Custom</div>
                        <ul className="space-y-2">
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Everything in Pro</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Unlimited Storage</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Team Collaboration</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Dedicated Account Manager</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Custom Integrations</li>
                        </ul>
                    </Card.Content>
                    <Card.Footer>
                        <Button variant="secondary" className="w-full">Contact Sales</Button>
                    </Card.Footer>
                </Card>
            </div>

            <div className="space-y-6">
                <div className="text-center">
                    <h3 className="text-2xl font-bold tracking-tight">Pay-as-you-go Add-ons</h3>
                    <p className="text-muted-foreground mt-1">Scale your features as you need them. Billed based on usage.</p>
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <Card className="bg-card/70 backdrop-blur-xl border border-default-200">
                        <Card.Header className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <div>
                                <h4 className="text-lg font-bold">Advanced AI Transcription</h4>
                                <p className="text-small text-default-500">High-accuracy transcription powered by leading AI models.</p>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-bold">$0.05</p>
                                <p className="text-small text-muted-foreground">/ minute</p>
                            </div>
                        </Card.Header>
                    </Card>
                    <Card className="bg-card/70 backdrop-blur-xl border border-default-200">
                        <Card.Header className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <div>
                                <h4 className="text-lg font-bold">Additional Storage</h4>
                                <p className="text-small text-default-500">Add more storage space to your plan as your library grows.</p>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-bold">$2</p>
                                <p className="text-small text-muted-foreground">/ GB / month</p>
                            </div>
                        </Card.Header>
                    </Card>
                </div>
            </div>
        </div>
    );
}
