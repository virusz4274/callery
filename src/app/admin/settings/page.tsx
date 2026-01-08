import { getSystemSettings } from '@/app/actions/admin-settings';
import { getPlans } from '@/app/actions/admin-plans';
import { SettingsForm } from '@/components/admin/settings-form';

export default async function SettingsPage() {
    const settings = await getSystemSettings();
    const plans = await getPlans();

    return <SettingsForm settings={settings} plans={plans} />;
}
