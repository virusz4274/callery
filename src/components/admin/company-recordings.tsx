'use client';
import { useState, useTransition, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Input, Label } from '@heroui/react';
import { RecordingsTable } from '@/components/recordings-table';
import { TeamChoice } from './team-settings-form';
import { startExport, getExportStatus } from '@/app/actions/export';
import { ExportDataCard } from '@/components/settings/data-settings/ExportDataCard';
import type { ExportJobResponse } from '@/lib/db/types';
import type { getCompanyRecordings, getTeamAdministration } from '@/app/actions/team';

export function CompanyRecordings({ data, administration }: {
    data: Awaited<ReturnType<typeof getCompanyRecordings>>;
    administration: NonNullable<Awaited<ReturnType<typeof getTeamAdministration>>>;
}) {
    const router = useRouter(); const pathname = usePathname(); const params = useSearchParams();
    const [employee, setEmployee] = useState(params.get('employeeId') || 'all');
    const [exportJob, setExportJob] = useState<ExportJobResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const [exporting, startExportTransition] = useTransition();
    const selectedEmployee = params.get('employeeId');
    useEffect(() => {
        if (!selectedEmployee) return;
        let active = true;
        const refresh = () => getExportStatus(selectedEmployee).then(job => { if (active) setExportJob(job); }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Export status unavailable.'); });
        void refresh(); const timer = setInterval(refresh, 5000);
        return () => { active = false; clearInterval(timer); };
    }, [selectedEmployee]);
    const navigate = (updates: Record<string, string>) => {
        const next = new URLSearchParams(params); for (const [key, value] of Object.entries(updates)) { if (value) next.set(key, value); else next.delete(key); }
        startTransition(() => router.push(`${pathname}?${next}`));
    };
    const runExport = async () => { if (!selectedEmployee) return; startExportTransition(async () => {
        setError(null);
        try { const result = await startExport(selectedEmployee); if (!result.success) throw new Error(result.message); setExportJob(await getExportStatus(selectedEmployee)); }
        catch (e) { setError(e instanceof Error ? e.message : 'Could not start export.'); }
    }); };
    return <div className="space-y-5">
        <Card className="space-y-4 p-5">
            <p className="text-sm text-muted">{administration.team.companyName} · {(administration.storageUsed / 1024 ** 3).toFixed(2)} GB audio stored. Includes former employees.</p>
            <form className="grid items-end gap-4 sm:grid-cols-2" key={params.toString()} onSubmit={e => {
                e.preventDefault(); const form = new FormData(e.currentTarget); navigate({ employeeId: employee === 'all' ? '' : employee, search: String(form.get('search') || ''), startDate: String(form.get('startDate') || ''), endDate: String(form.get('endDate') || ''), page: '1' });
            }}>
                <TeamChoice label="Employee" value={employee} onChange={setEmployee} choices={[{ value: 'all', label: 'All employees' }, ...administration.employees.map(u => ({ value: u.id, label: `${u.name}${u.disabled ? ' (access removed)' : ''}` }))]} />
                <div className="space-y-2"><Label htmlFor="company-search">Search recordings</Label><Input id="company-search" name="search" type="search" defaultValue={params.get('search') || ''} className="min-h-11" /></div>
                <div className="space-y-2"><Label htmlFor="company-start">From date</Label><Input id="company-start" name="startDate" type="date" defaultValue={params.get('startDate') || ''} className="min-h-11" /></div>
                <div className="space-y-2"><Label htmlFor="company-end">To date</Label><Input id="company-end" name="endDate" type="date" defaultValue={params.get('endDate') || ''} className="min-h-11" /></div>
                <div className="flex gap-3"><Button variant="primary" type="submit" isPending={pending} className="min-h-11">Apply filters</Button><Button variant="secondary" onPress={() => { setEmployee('all'); startTransition(() => router.push(pathname)); }} className="min-h-11">Clear</Button></div>
            </form>
        </Card>
        <RecordingsTable recordings={data.recordings} contacts={[]} page={data.page} setPage={page => navigate({ page: String(page) })} totalCount={data.total} itemsPerPage={25} onRecordingsChange={() => router.refresh()} />
        <Card className="space-y-3 p-5"><h2 className="text-lg font-semibold">Employee storage usage</h2><ul className="divide-y divide-border">{administration.employees.map(u => <li key={u.id} className="flex flex-wrap justify-between gap-2 py-2"><span className="break-words">{u.name}{u.disabled ? ' (access removed)' : ''}</span><span className="text-sm text-muted">{u.totalRecordings} recordings · {(u.storageUsed / 1024 ** 3).toFixed(2)} GB</span></li>)}</ul></Card>
        {selectedEmployee ? <ExportDataCard archiveOwnerName={administration.employees.find(u => u.id === selectedEmployee)?.name} exportJob={exportJob} isExportStarting={exporting} onStartExport={runExport} /> : <p className="text-sm text-muted">Filter by one employee to export their complete archive, including recordings outside the displayed date range.</p>}
        {error && <p role="alert" className="text-danger">{error}</p>}
    </div>;
}
