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
        <Card className="rounded-[2rem] border border-default-200/80 bg-background/95 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.45)]">
            <Card.Header className="flex flex-col justify-between gap-5 p-6 md:flex-row md:items-start">
                <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16">
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
                        <h2 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">{user.name}</h2>
                        <p className="text-default-500">{user.phoneNumber || 'No phone number on file'}</p>
                    </div>
                </div>
                </div>
                <div className="flex gap-2 md:ml-auto">
                    {isSoftDeleted ? (
                        <Button variant="secondary" className="rounded-full px-6 font-semibold" isDisabled={isRestoring} onPress={onRestoreUser}>
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
                        <Button variant="danger-soft" className="rounded-full px-6 font-semibold" isDisabled={isDeleting} onPress={onDeleteUser}>
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
