import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/app/actions/admin';
import { getSystemSettings } from '@/app/actions/admin-settings';
import { getPlans } from '@/app/actions/admin-plans';
import { SettingsForm } from '@/components/admin/settings-form';

export default async function SettingsPage() {
    const admin = await getCurrentAdmin();
    if (!admin) {
        redirect('/');
    }

    const settings = await getSystemSettings();
    const plans = await getPlans();

    return <SettingsForm settings={settings} plans={plans} />;
}
