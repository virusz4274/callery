import React from 'react';
import { Card, Spinner } from '@heroui/react';

type BillingHistoryCardProps = {
    isLoading: boolean;
};

export function BillingHistoryCard({ isLoading }: BillingHistoryCardProps) {
    return (
        <Card className="bg-card/70 border-default-200">
            <Card.Header>
                <h4 className="text-base font-medium">Billing History</h4>
            </Card.Header>
            <Card.Content>
                {isLoading ? (
                    <div className="flex justify-center p-4">
                        <Spinner />
                    </div>
                ) : (
                    <div className="p-4 text-center text-default-500 text-sm">No invoices found.</div>
                )}
            </Card.Content>
        </Card>
    );
}
