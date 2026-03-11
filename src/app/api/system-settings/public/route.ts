import { NextResponse } from 'next/server';
import { getSystemSettings } from '@/lib/db/users/lookup';

export async function GET() {
    try {
        const settings = await getSystemSettings();

        return NextResponse.json(
            {
                maintenanceMode: settings?.maintenanceMode ?? false,
            },
            {
                headers: {
                    'Cache-Control': 'no-store',
                },
            }
        );
    } catch (error) {
        console.error('Failed to load public system settings:', error);

        return NextResponse.json(
            { maintenanceMode: false },
            {
                status: 500,
                headers: {
                    'Cache-Control': 'no-store',
                },
            }
        );
    }
}
