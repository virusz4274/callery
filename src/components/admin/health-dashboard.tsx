"use client";

import { useEffect, useState } from 'react';
import { Card, Chip, Button, Spinner, Surface } from '@heroui/react';
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Server, Database, Cloud, Cpu } from 'lucide-react';
import { checkSystemHealth } from '@/app/actions/admin-health';

type ServiceStatus = {
    name: string;
    status: 'operational' | 'degraded' | 'down';
    latency: number;
    message?: string;
};

export function HealthDashboard() {
    const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchHealth = async () => {
        setLoading(true);
        try {
            const data = await checkSystemHealth();
            setStatuses(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHealth();
    }, []);

    const getIcon = (name: string) => {
        if (name.includes('Mongo')) return <Database className="size-5" />;
        if (name.includes('R2')) return <Cloud className="size-5" />;
        if (name.includes('Gemini')) return <Cpu className="size-5" />;
        return <Server className="size-5" />;
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'operational': return 'success';
            case 'degraded': return 'warning';
            case 'down': return 'danger';
            default: return 'default';
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold tracking-[-0.03em] text-foreground">System health</h2>
                    <p className="text-sm text-default-500">Check the core services that keep storage, billing, and transcription running.</p>
                </div>
                <Button 
                    size="sm" 
                    variant="ghost" 
                    onPress={fetchHealth} 
                    isPending={loading}
                    className="rounded-full"
                >
                    <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {statuses.map((service) => (
                    <Card key={service.name} className="rounded-[1.5rem] border border-default-200/80 bg-background/95 p-4 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.45)]">
                        <div className="flex items-start justify-between mb-2">
                            <div className="rounded-2xl bg-default-100 p-2 text-default-600">
                                {getIcon(service.name)}
                            </div>
                            <Chip 
                                size="sm" 
                                color={getStatusColor(service.status)}
                                variant="soft"
                            >
                                <span className="flex items-center gap-1">
                                    {service.status === 'operational' ? <CheckCircle className="size-3" /> :
                                     service.status === 'degraded' ? <AlertTriangle className="size-3" /> :
                                     <XCircle className="size-3" />}
                                    {service.status.toUpperCase()}
                                </span>
                            </Chip>
                        </div>
                        <div>
                            <h3 className="font-semibold text-sm text-foreground">{service.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-default-500">Latency:</span>
                                <span className={`text-xs font-mono ${service.latency > 500 ? 'text-warning' : 'text-success'}`}>
                                    {service.latency}ms
                                </span>
                            </div>
                            {service.message && (
                                <p className="mt-2 rounded-xl bg-danger/10 p-2 text-xs text-danger">
                                    {service.message}
                                </p>
                            )}
                        </div>
                    </Card>
                ))}
                
                {loading && statuses.length === 0 && (
                    <>
                        <Surface variant="secondary" className="flex h-32 items-center justify-center rounded-[1.5rem] border border-default-200/80"><Spinner /></Surface>
                        <Surface variant="secondary" className="flex h-32 items-center justify-center rounded-[1.5rem] border border-default-200/80"><Spinner /></Surface>
                        <Surface variant="secondary" className="flex h-32 items-center justify-center rounded-[1.5rem] border border-default-200/80"><Spinner /></Surface>
                        <Surface variant="secondary" className="flex h-32 items-center justify-center rounded-[1.5rem] border border-default-200/80"><Spinner /></Surface>
                    </>
                )}
            </div>
        </div>
    );
}
