import React from 'react';
import { Avatar, Button, Card } from '@heroui/react';
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
            <Card.Header className="flex gap-4 justify-between">
                <Avatar className="h-16 w-16">
                    <Avatar.Image src={user.photoURL} alt={user.name} />
                    <Avatar.Fallback>{user.name.charAt(0)}</Avatar.Fallback>
                </Avatar>
                <div>
                    <h2 className="text-3xl font-bold">{user.name}</h2>
                    <p className="text-default-500">{user.phoneNumber || 'No phone number'}</p>
                </div>
                <div className="flex gap-2 ml-auto">
                    {isSoftDeleted ? (
                        <Button variant="secondary" isDisabled={isRestoring} onPress={onRestoreUser}>
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
                        <Button variant="danger-soft" isDisabled={isDeleting} onPress={onDeleteUser}>
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
