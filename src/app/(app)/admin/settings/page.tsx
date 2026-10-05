import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/app/actions/admin';
import { getSystemSettings } from '@/app/actions/admin-settings';
import { getPlans } from '@/app/actions/admin-plans';
import { SettingsForm } from '@/components/admin/settings-form';
import { AdminPageShell } from '@/components/admin/admin-page-shell';

export default async function SettingsPage() {
    const admin = await getCurrentAdmin();
    if (!admin) {
        redirect('/');
    }

    let settings = null;
    let plans = null;
    let initializationError: string | null = null;

    try {
        [settings, plans] = await Promise.all([getSystemSettings(), getPlans()]);
    } catch (error) {
        initializationError = error instanceof Error ? error.message : 'Run `npm run db:init` before using admin settings.';
    }

    if (initializationError || !settings || !plans) {
        return (
            <AdminPageShell
                eyebrow="Initialization required"
                title="System settings unavailable"
                description={initializationError || 'Run `npm run db:init` before using admin settings.'}
            >
                <div />
            </AdminPageShell>
        );
    }

    return (
        <AdminPageShell
            eyebrow="Global defaults"
            title="System settings"
            description="Control signup availability, maintenance mode, default onboarding plans, and transcription billing behavior."
            stats={[
                {
                    label: 'Signups',
                    value: settings.allowSignups ? 'Open' : 'Closed',
                    helper: 'Whether new users can currently register',
                    iconName: 'UserPlus',
                },
                {
                    label: 'Maintenance',
                    value: settings.maintenanceMode ? 'Enabled' : 'Off',
                    helper: 'Admin-only mode for the main application',
                    iconName: 'ShieldCheck',
                },
                {
                    label: 'Config',
                    value: plans.length,
                    helper: 'Plans available for onboarding defaults',
                    iconName: 'Cog',
                },
            ]}
        >
            <SettingsForm settings={settings} plans={plans} />
        </AdminPageShell>
    );
}
