
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function BillingSettings() {
  return (
    <Card>
        <CardHeader>
            <CardTitle>Billing & Subscription</CardTitle>
            <CardDescription>Manage your subscription, view payment history, and download invoices.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center text-center p-12 border-2 border-dashed rounded-lg">
            <p className="text-lg font-medium">Pro Plan</p>
            <p className="text-muted-foreground">You are currently on the Pro plan.</p>
            <Button variant="outline" className="mt-4" disabled>Manage Subscription</Button>
        </CardContent>
    </Card>
  );
}
