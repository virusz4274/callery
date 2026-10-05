export interface RecordingExportCursor {
    recordedAt: Date;
    id: string;
}

export interface RecordingQueryOptions {
    limit?: number;
    skip?: number;
    includeArchived?: boolean;
    search?: string;
    contactName?: string;
    contactId?: string;
    sortBy?: 'date' | 'duration';
    sortOrder?: 'asc' | 'desc';
    startDate?: string;
    endDate?: string;
}

export interface RecordingCountOptions {
    includeArchived?: boolean;
    search?: string;
    contactName?: string;
    contactId?: string;
    startDate?: string;
    endDate?: string;
}

export type DashboardStats = {
    totalRecordings: number;
    newThisMonth: number;
    unknownCallers: number;
    avgDuration: number;
};
