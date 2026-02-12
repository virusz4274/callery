import { Card, Button, Spinner } from '@heroui/react';
import { GoogleIcon } from '@/components/icons/google-icon';

interface GoogleConnectProps {
    isSyncing: boolean;
    onConnect: () => void;
}

export function GoogleConnectCard({ isSyncing, onConnect }: GoogleConnectProps) {
    return (
        <Card className="bg-card/70 border-default-200">
            <Card.Content className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border p-4">
                    <div className="space-y-0.5">
                        <h4 className="text-base font-medium">Sync Google Contacts</h4>
                        <p className="text-sm text-default-500">
                            Automatically match names to phone numbers from your Google Contacts.
                        </p>
                    </div>
                    <Button
                        variant="secondary"
                        onPress={onConnect}
                        isDisabled={isSyncing}
                        className="w-full sm:w-auto"
                    >
                        {isSyncing ? (
                            <Spinner size="sm" />
                        ) : (
                            <GoogleIcon className="mr-2 h-4 w-4" />
                        )}
                        Connect
                    </Button>
                </div>
            </Card.Content>
        </Card>
    );
}
