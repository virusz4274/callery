import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../src/components/theme-provider';
import { ToastProvider } from '../../src/components/toast-provider';
import AdminLayout from '../../src/app/(app)/admin/layout';
import { AdminPageShell } from '../../src/components/admin/admin-page-shell';
import { AdminDashboard } from '../../src/components/pages/admin/admin-dashboard';
import { UserManagementTable } from '../../src/components/admin/user-management-table';
import { UserDetailsPage } from '../../src/components/pages/admin/user-details-page';
import { PlansList } from '../../src/components/admin/plans-list';
import { AnnouncementsList } from '../../src/components/admin/announcements-list';
import { SettingsForm } from '../../src/components/admin/settings-form';
import { AuditLogsTable } from '../../src/components/admin/audit-logs-table';
import { AdminPageRetry } from '../../src/components/admin/admin-feedback';
import { usePathname, useSearchParams } from './admin-router';
import { adminAnnouncements, adminPlans, adminProfile, adminUsers } from './admin-data';
import '../../src/app/globals.css';
import { TeamSettingsForm } from '../../src/components/admin/team-settings-form';
import { TeamInvitationsPanel } from '../../src/components/admin/team-invitations-panel';
import { CompanyRecordings } from '../../src/components/admin/company-recordings';
import { companyRecording, teamAdministration, teamSettings } from './team-data';
import { BillingSettings } from '../../src/components/settings/billing-settings';

function AdminFixture() {
    const pathname = usePathname();
    const params = useSearchParams();
    const empty = params.has('empty');
    const team = params.has('team');
    const search = params.get('search') || '';
    const users = adminUsers.filter(user => `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase()));
    const page = Number(params.get('page') || 1);
    let content: React.ReactNode;
    if (pathname === '/admin') content = <AdminDashboard stats={{ totalUsers: 25, totalRecordings: 42, totalStorageUsed: 1024 ** 3, totalTranscriptionUsed: 3600 }} orphanedCount={2} />;
    else if (pathname.startsWith('/admin/users/')) content = <UserDetailsPage user={adminUsers.find(user => pathname.endsWith(user.id)) || adminProfile} recordings={[]} invoices={[]} />;
    else if (pathname === '/admin/users') content = <AdminPageShell eyebrow="" title={team ? 'Employees' : 'User management'}>{team && <TeamInvitationsPanel data={teamAdministration} />}<UserManagementTable teamMode={team} initialUsers={empty ? [] : users.slice((page - 1) * 10, page * 10)} totalUsers={empty ? 0 : users.length} currentPage={page} totalPages={Math.ceil(users.length / 10)} initialSearch={search} plans={adminPlans} /></AdminPageShell>;
    else if (pathname === '/admin/recordings') content = <AdminPageShell eyebrow="" title="Company recordings"><CompanyRecordings key={JSON.stringify([params.get('employeeId'), search, params.get('startDate'), params.get('endDate'), page])} administration={teamAdministration} data={{ recordings: [companyRecording], total: 26, page, totalPages: 2 }} /></AdminPageShell>;
    else if (pathname === '/admin/team-settings') content = <AdminPageShell eyebrow="" title="Company setup"><TeamSettingsForm initial={params.has('setup') ? undefined : teamSettings} providers={[]} /></AdminPageShell>;
    else if (pathname === '/admin/billing-fixture') {
        const lifetime = params.has('lifetime');
        const usageSetup = params.get('usage') === 'ready' ? 'ready' : 'needs_action';
        content = <AdminPageShell eyebrow="" title="Billing recovery"><BillingSettings userProfile={{
            ...adminProfile, planKey: lifetime ? 'lifetime' : 'standard', planName: lifetime ? 'Lifetime' : 'Standard',
            storageAllocation: lifetime ? 0 : adminProfile.storageAllocation,
            transcriptionAllocation: lifetime ? 0 : adminProfile.transcriptionAllocation,
            stripeSubscriptionStatus: usageSetup === 'ready' ? 'active' : 'past_due',
            billingStatus: { entitlement: lifetime ? 'lifetime' : 'subscription', lifetimePurchased: lifetime,
                usageSetup: lifetime ? usageSetup : undefined, needsAttention: usageSetup !== 'ready', canManageBilling: true },
        }} /></AdminPageShell>;
    }
    else if (pathname === '/admin/plans') content = <AdminPageShell eyebrow="" title="Pricing plans"><PlansList initialPlans={empty ? [] : adminPlans} /></AdminPageShell>;
    else if (pathname === '/admin/announcements') content = <AdminPageShell eyebrow="" title="Announcements"><AnnouncementsList announcements={empty ? [] : adminAnnouncements} /></AdminPageShell>;
    else if (pathname === '/admin/settings') {
        const managed = params.has('managed');
        const plans = managed ? adminPlans.map((plan, index) => index === 0 ? { ...plan, key: 'free-trial', name: 'Free Trial', isActive: true } : plan) : adminPlans;
        content = <AdminPageShell eyebrow="" title="System settings">{params.has('fail') ? <AdminPageRetry title="Could not load system settings" /> : <SettingsForm settings={{
            id: 'settings', transcriptionPolicyMode: managed ? 'managed' : 'self-hosted', allowSignups: true,
            maintenanceMode: false, defaultPlanId: plans[0].id,
            transcriptionMultipliers: managed ? { soniox: 1, gemini: 3, elevenlabs: 5 } : { soniox: 1, elevenlabs: 2, gemini: 3, openai_compat: 1 },
            updatedAt: adminProfile.createdAt,
        }} plans={plans} />}</AdminPageShell>;
    }
    else content = <AdminPageShell eyebrow="" title="Audit logs"><AuditLogsTable initialLogs={empty ? [] : [{ id: 'audit-1', adminEmail: adminProfile.email, adminId: adminProfile.id, action: 'USER_ROLE_UPDATE', targetType: 'USER', targetId: adminUsers[0].id, details: { role: 'admin', note: 'A long detail '.repeat(40) }, createdAt: adminProfile.createdAt }]} totalLogs={params.has('fail') ? null : empty ? 0 : 1} loadError={params.has('fail') ? 'Fixture audit outage' : null} currentPage={1} totalPages={1} initialActionFilter={params.get('action') || undefined} initialStartDate={params.get('startDate') || undefined} initialEndDate={params.get('endDate') || undefined} /></AdminPageShell>;
    return <ThemeProvider attribute="class" defaultTheme="light"><ToastProvider><div className="mx-auto max-w-[1600px] px-3 py-4 font-sans md:px-8 md:py-8"><AdminLayout>{content}</AdminLayout></div></ToastProvider></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<AdminFixture />);
