'use client';

import React from 'react';
import { Button, Card, FieldError, Input, Label, Spinner, TextField } from '@heroui/react';
import { SettingsSection } from './settings-section';
import type { UseFormReturn } from 'react-hook-form';
import type { AppUser as User } from '@/lib/auth/types';

type ProfileFormValues = {
    firstName: string;
    lastName: string;
};

type PasswordFormValues = {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
};

interface ProfileSettingsProps {
    user: User | null;
    profileForm: UseFormReturn<ProfileFormValues>;
    passwordForm: UseFormReturn<PasswordFormValues>;
    onUpdateProfile: (values: ProfileFormValues) => Promise<void>;
    onChangePassword: (values: PasswordFormValues) => Promise<void>;
    isProfileSaving: boolean;
    isPasswordSaving: boolean;
}

export function ProfileSettings({
    user,
    profileForm,
    passwordForm,
    onUpdateProfile,
    onChangePassword,
    isProfileSaving,
    isPasswordSaving,
}: ProfileSettingsProps) {

    if (!user) {
        return (
            <div className="flex items-center justify-center p-8">
                <Spinner size="lg" />
            </div>
        );
    }

    // Handlers for form submission
    const handleProfileSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        profileForm.handleSubmit(onUpdateProfile)(e);
    };

    const handlePasswordSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        passwordForm.handleSubmit(onChangePassword)(e);
    };

    return (
        <div className="space-y-6">
            <SettingsSection title="Personal information">
                <Card className="gap-0 rounded-xl border border-border bg-surface p-0 shadow-none">
                    <form onSubmit={handleProfileSubmit}>
                        <Card.Content className="space-y-5 p-5 sm:p-6">

                            <div className="grid gap-4 sm:grid-cols-2">
                                <TextField
                                    isInvalid={!!profileForm.formState.errors.firstName}
                                >
                                    <Label>First Name</Label>
                                    <Input placeholder="Your first name" autoComplete="given-name" {...profileForm.register('firstName')} />
                                    <FieldError>{profileForm.formState.errors.firstName?.message as string}</FieldError>
                                </TextField>
                                <TextField
                                    isInvalid={!!profileForm.formState.errors.lastName}
                                >
                                    <Label>Last Name</Label>
                                    <Input placeholder="Your last name" autoComplete="family-name" {...profileForm.register('lastName')} />
                                    <FieldError>{profileForm.formState.errors.lastName?.message as string}</FieldError>
                                </TextField>
                            </div>
                            <TextField>
                                <Label>Email</Label>
                                <Input
                                    type="email"
                                    value={user.email || ''}
                                    readOnly
                                    disabled
                                // variant="flat" // Input might not support variant, or TextField does? TextField handles disabled styling.
                                />
                            </TextField>
                        </Card.Content>
                        <Card.Footer className="justify-end border-t border-default-100/80 px-5 py-4 md:px-6">
                            <Button type="submit" variant="primary" className="rounded-lg px-5 font-medium" isPending={isProfileSaving}>
                                {isProfileSaving ? <Spinner color="current" size="sm" /> : "Save Profile"}
                            </Button>
                        </Card.Footer>
                    </form>
                </Card>
            </SettingsSection>

            {user.canChangePassword && (
                <SettingsSection title="Password" description="Change your account password. You will be logged out after a successful change.">
                    <Card className="gap-0 rounded-xl border border-border bg-surface p-0 shadow-none">
                        <form onSubmit={handlePasswordSubmit}>
                            <Card.Content className="space-y-5 p-5 sm:p-6">

                                <TextField
                                    isInvalid={!!passwordForm.formState.errors.currentPassword}
                                >
                                    <Label>Current Password</Label>
                                    <Input type="password" placeholder="Your current password" autoComplete="current-password" {...passwordForm.register('currentPassword')} />
                                    <FieldError>{passwordForm.formState.errors.currentPassword?.message as string}</FieldError>
                                </TextField>
                                <TextField
                                    isInvalid={!!passwordForm.formState.errors.newPassword}
                                >
                                    <Label>New Password</Label>
                                    <Input type="password" placeholder="Enter a new password" autoComplete="new-password" {...passwordForm.register('newPassword')} />
                                    <FieldError>{passwordForm.formState.errors.newPassword?.message as string}</FieldError>
                                </TextField>
                                <TextField
                                    isInvalid={!!passwordForm.formState.errors.confirmPassword}
                                >
                                    <Label>Confirm New Password</Label>
                                    <Input type="password" placeholder="Confirm your new password" autoComplete="new-password" {...passwordForm.register('confirmPassword')} />
                                    <FieldError>{passwordForm.formState.errors.confirmPassword?.message as string}</FieldError>
                                </TextField>
                            </Card.Content>
                            <Card.Footer className="justify-end border-t border-default-100/80 px-5 py-4 md:px-6">
                                <Button type="submit" variant="primary" className="rounded-lg px-5 font-medium" isPending={isPasswordSaving}>
                                    {isPasswordSaving ? <Spinner color="current" size="sm" /> : "Change Password"}
                                </Button>
                            </Card.Footer>
                        </form>
                    </Card>
                </SettingsSection>
            )}
        </div>
    );
}
