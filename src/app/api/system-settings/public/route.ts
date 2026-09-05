import { NextResponse } from 'next/server';
import { getSystemSettings } from '@/lib/db/users/lookup';
import { logger } from '@/lib/logger';

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
        // Keep public routes resilient even when infra dependencies are unavailable.
        logger.warn('Failed to load public system settings, using fallback:', error);

        return NextResponse.json(
            { maintenanceMode: false },
            {
                headers: {
                    'Cache-Control': 'no-store',
                },
            }
        );
    }
}
