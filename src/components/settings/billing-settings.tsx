
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { invoices } from '@/lib/data/invoice-data';
import { ClientFormattedDate } from '../client-formatted-date';
import Link from 'next/link';

export function BillingSettings() {
  return (
    <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Your Subscription</CardTitle>
                <CardDescription>Manage your current plan and billing details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border p-4">
                    <div className='space-y-1'>
                        <h3 className="text-lg font-semibold">Pro Plan <Badge className="ml-2">Active</Badge></h3>
                        <p className="text-muted-foreground">Your plan renews on <ClientFormattedDate date={new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString()} formatString="MMMM dd, yyyy" />.</p>
                    </div>
                    <div className="mt-4 sm:mt-0">
                        <p className="text-2xl font-bold">$15.00 <span className="text-sm font-normal text-muted-foreground">/ month</span></p>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border p-4">
                    <div className="space-y-1">
                        <h3 className="font-semibold">Payment Method</h3>
                        <p className="text-muted-foreground">Visa ending in 1234</p>
                    </div>
                    <Button variant="outline" className="mt-4 sm:mt-0">Update Payment Method</Button>
                </div>
            </CardContent>
            <CardFooter className="flex-col sm:flex-row sm:justify-end gap-2">
                <Button variant="outline" asChild>
                    <Link href="/pricing">Change Plan</Link>
                </Button>
                <Button variant="destructive">Cancel Subscription</Button>
            </CardFooter>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Billing History</CardTitle>
                <CardDescription>View your past invoices.</CardDescription>
            </CardHeader>
            <CardContent>
                 <div className="rounded-lg border">
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Invoice ID</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead className="text-right">Status</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {invoices.map((invoice) => (
                            <TableRow key={invoice.id}>
                                <TableCell className="font-medium">{invoice.id}</TableCell>
                                <TableCell>
                                    <ClientFormattedDate date={invoice.date} formatString="MMMM dd, yyyy" />
                                </TableCell>
                                <TableCell>${invoice.amount.toFixed(2)}</TableCell>
                                <TableCell className="text-right">
                                    <Badge variant={invoice.status === 'Paid' ? 'secondary' : 'destructive'}>{invoice.status}</Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
