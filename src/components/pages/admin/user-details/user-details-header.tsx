import { Avatar, Button, Card, Chip } from '@heroui/react';
import { RotateCcw, Trash2 } from 'lucide-react';
import type { User } from '@/lib/types';

type UserDetailsHeaderProps = {
    user: User;
    isDeleting: boolean;
    isRestoring: boolean;
    onDeleteUser: () => void;
    onRestoreUser: () => void;
};

export function UserDetailsHeader({ user, isDeleting, isRestoring, onDeleteUser, onRestoreUser }: UserDetailsHeaderProps) {
    const isSoftDeleted = user.softDelete?.isDeleted;

    return (
        <Card>
            <Card.Header className="flex flex-col justify-between gap-5 p-6 md:flex-row md:items-start">
                <div className="flex min-w-0 items-center gap-3">
                <Avatar className="size-12 shrink-0">
                    <Avatar.Image src={user.photoURL} alt={user.name} />
                    <Avatar.Fallback>{user.name.charAt(0)}</Avatar.Fallback>
                </Avatar>
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <Chip variant="soft" color="accent">
                            Account details
                        </Chip>
                        {isSoftDeleted && (
                            <Chip variant="soft" color="warning">
                                Pending deletion
                            </Chip>
                        )}
                    </div>
                    <div>
                        <p className="break-all text-sm text-muted">{user.phoneNumber || 'No phone number on file'}</p>
                    </div>
                </div>
                </div>
                <div className="flex gap-2 md:ml-auto">
                    {isSoftDeleted ? (
                        <Button variant="secondary" className="min-h-11 px-4" isDisabled={isRestoring} onPress={onRestoreUser}>
                            {isRestoring ? (
                                'Restoring...'
                            ) : (
                                <div className="flex items-center gap-2">
                                    <RotateCcw className="h-4 w-4" />
                                    <span>Restore User</span>
                                </div>
                            )}
                        </Button>
                    ) : (
                        <Button variant="danger-soft" className="min-h-11 px-4" isDisabled={isDeleting} onPress={onDeleteUser}>
                            {isDeleting ? (
                                'Deleting...'
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Trash2 className="h-4 w-4" />
                                    <span>Delete User</span>
                                </div>
                            )}
                        </Button>
                    )}
                </div>
            </Card.Header>
        </Card>
    );
}
