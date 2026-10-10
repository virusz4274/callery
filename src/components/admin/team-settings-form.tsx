'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Label, ListBox, Select } from '@heroui/react';
import { DEFAULT_TEAM_SETTINGS, type TeamSettings } from '@/lib/team-config';
import { saveTeamSettings } from '@/app/actions/team';
import { ConfirmActionDialog } from './confirm-action-dialog';
import { ActionLink } from '@/components/action-link';

export function TeamChoice({ label, value, onChange, choices }: { label: string; value: string; onChange: (value: string) => void; choices: { value: string; label: string }[] }) {
    return <Select selectedKey={value} onSelectionChange={key => { if (key !== null) onChange(String(key)); }}>
        <Label>{label}</Label><Select.Trigger className="min-h-11"><Select.Value /><Select.Indicator /></Select.Trigger>
        <Select.Popover><ListBox>{choices.map(c => <ListBox.Item id={c.value} key={c.value} textValue={c.label}>{c.label}</ListBox.Item>)}</ListBox></Select.Popover>
    </Select>;
}

export function TeamSettingsForm({ initial, providers }: { initial?: TeamSettings; providers: { id: string; name: string }[] }) {
    const [settings, setSettings] = useState<TeamSettings>({ ...DEFAULT_TEAM_SETTINGS, ...initial });
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [pending, startTransition] = useTransition();
    const router = useRouter();
    const set = <K extends keyof TeamSettings>(key: K, value: TeamSettings[K]) => { setSuccess(false); setSettings(previous => ({ ...previous, [key]: value })); };
    const save = () => startTransition(async () => {
        setError(null);
        try { await saveTeamSettings({ ...settings, enabled: true }); setConfirming(false); set('enabled', true); setSuccess(true); router.refresh(); }
        catch (error) { setError(error instanceof Error ? error.message : 'Could not save company settings.'); }
    });
    const configured = providers.some(p => p.id === settings.transcriptionProvider);
    return <Card className="max-w-3xl p-5 sm:p-6">
        <h2 className="text-xl font-semibold">{settings.enabled ? 'Company archive settings' : 'Set up a small team'}</h2>
        <p className="text-sm text-muted">One deployment serves one company. Employees upload manually and see their own recordings; administrators can access the company archive.</p>
        <form className="space-y-5" onSubmit={event => { event.preventDefault(); if (settings.enabled) save(); else setConfirming(true); }}>
            <div className="space-y-2"><Label htmlFor="company-name">Company name</Label><Input id="company-name" required maxLength={100} value={settings.companyName} onChange={e => set('companyName', e.target.value)} className="min-h-11" /></div>
            <TeamChoice label="Keep recordings" value={settings.retentionPolicy} onChange={v => set('retentionPolicy', v as TeamSettings['retentionPolicy'])} choices={[
                { value: 'never', label: 'Until the administrator deletes them' }, { value: '3m', label: 'Three months' }, { value: '6m', label: 'Six months' }, { value: '1y', label: 'One year' },
            ]} />
            <p className="text-sm text-muted">A timed retention policy also deletes existing recordings older than that period, including former employees’ recordings.</p>
            <TeamChoice label="Transcription" value={settings.transcriptionMode} onChange={v => set('transcriptionMode', v as TeamSettings['transcriptionMode'])} choices={[
                { value: 'off', label: 'Off — back up audio only' }, { value: 'manual', label: 'When an employee requests it' }, { value: 'automatic', label: 'Automatically after upload' },
            ]} />
            {settings.transcriptionMode !== 'off' && <>
                <TeamChoice label="Company transcription provider" value={settings.transcriptionProvider} onChange={v => set('transcriptionProvider', v as TeamSettings['transcriptionProvider'])} choices={[
                    ...providers.map(p => ({ value: p.id, label: p.name })), ...(!configured ? [{ value: settings.transcriptionProvider, label: `${settings.transcriptionProvider} (not configured)` }] : []),
                ]} />
                <div className="space-y-2"><Label htmlFor="company-model">Model override (optional)</Label><Input id="company-model" value={settings.transcriptionModel || ''} maxLength={120} onChange={e => set('transcriptionModel', e.target.value)} className="min-h-11" /><p className="text-sm text-muted">Leave empty to use the provider’s configured model. Hosted providers may charge for processing.</p></div>
            </>}
            {!settings.enabled && <p className="text-sm text-muted">Requires billing off, a verified administrator, and working SMTP or Resend. Enabling adopts existing recordings as company records and cannot be undone here.</p>}
            {error && !confirming && <p role="alert" className="text-danger">{error}</p>}
            {success && <p role="status">Company settings saved.</p>}
            <div className="flex flex-wrap gap-3"><Button type="submit" variant="primary" isPending={pending} className="min-h-11">{settings.enabled ? 'Save company settings' : 'Enable company archive'}</Button>
                {settings.enabled && <ActionLink href="/admin/recordings" variant="secondary">Company recordings</ActionLink>}
            </div>
        </form>
        {confirming && <ConfirmActionDialog title="Enable the company archive?" description="All existing recordings become company records. Employees need invitations, public sharing is disabled, and removing access keeps their recordings. This setup cannot switch back to personal mode." label="Enable company archive" pending={pending} error={error} onConfirm={save} onClose={() => setConfirming(false)} danger={false} />}
    </Card>;
}
