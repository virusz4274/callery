'use client';
import type { UserResponse } from '@/lib/db/types';
import { AdminQuotaDialog } from './admin-quota-dialog';
export function EditUsageDialog(props: { user: UserResponse; isOpen: boolean; onClose: () => void }) {
    return <AdminQuotaDialog key={props.user.id} {...props} mode="usage" />;
}
