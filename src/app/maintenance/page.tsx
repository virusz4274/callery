import { Card } from '@heroui/react';
import { OctagonAlert } from 'lucide-react';

export default function MaintenancePage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <Card className="max-w-md w-full p-6">
                <div className="flex gap-3 mb-4">
                    <OctagonAlert className="w-8 h-8 text-warning" />
                    <div className="flex flex-col">
                        <p className="text-md font-bold">System Maintenance</p>
                        <p className="text-small text-default-500">We&apos;ll be back shortly</p>
                    </div>
                </div>
                <div>
                    <p>
                        The application is currently undergoing scheduled maintenance.
                        Please check back later. We apologize for the inconvenience.
                    </p>
                </div>
            </Card>
        </div>
    );
}
