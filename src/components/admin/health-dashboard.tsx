"use client";

import { useEffect, useState } from 'react';
import { Card, Chip, Button, Spinner } from '@heroui/react';
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
                <h2 className="text-xl font-bold">System Health</h2>
                <Button 
                    size="sm" 
                    variant="ghost" 
                    onPress={fetchHealth} 
                    isPending={loading}
                >
                    <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {statuses.map((service) => (
                    <Card key={service.name} className="p-4 border border-default-200">
                        <div className="flex items-start justify-between mb-2">
                            <div className="p-2 bg-default-100 rounded-lg text-default-600">
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
                            <h3 className="font-semibold text-sm">{service.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground">Latency:</span>
                                <span className={`text-xs font-mono ${service.latency > 500 ? 'text-warning' : 'text-success'}`}>
                                    {service.latency}ms
                                </span>
                            </div>
                            {service.message && (
                                <p className="text-xs text-danger mt-2 bg-danger/10 p-1.5 rounded">
                                    {service.message}
                                </p>
                            )}
                        </div>
                    </Card>
                ))}
                
                {loading && statuses.length === 0 && (
                    <>
                        <Card className="p-4 h-32 flex items-center justify-center"><Spinner /></Card>
                        <Card className="p-4 h-32 flex items-center justify-center"><Spinner /></Card>
                        <Card className="p-4 h-32 flex items-center justify-center"><Spinner /></Card>
                        <Card className="p-4 h-32 flex items-center justify-center"><Spinner /></Card>
                    </>
                )}
            </div>
        </div>
    );
}
