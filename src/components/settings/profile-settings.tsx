'use client';

import React from 'react';
import { Button, Card, Chip, FieldError, Input, Label, Spinner, Surface, TextField } from '@heroui/react';
import { KeyRound, Mail, UserRound } from 'lucide-react';
import { SettingsSection } from './settings-section';
import type { UseFormReturn } from 'react-hook-form';
import type { User } from 'firebase/auth';

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
            <SettingsSection title="Profile" description="Update your personal information.">
                <Card className="rounded-[1.6rem] border border-default-200/80 bg-background/90 shadow-[0_20px_54px_-42px_rgba(15,23,42,0.4)]">
                    <form onSubmit={handleProfileSubmit}>
                        <Card.Content className="space-y-5 p-5 md:p-6">
                            <div className="flex flex-wrap items-center gap-2">
                                <Chip variant="soft" color="accent">
                                    Identity details
                                </Chip>
                                <Chip variant="soft" color="default">
                                    Email stays read-only
                                </Chip>
                            </div>

                            <div className="grid gap-3 md:grid-cols-3">
                                <Surface variant="secondary" className="rounded-[1.2rem] border border-default-200/80 p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="rounded-2xl bg-accent/10 p-2.5 text-accent">
                                            <UserRound className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <div className="font-semibold text-foreground">Profile basics</div>
                                            <p className="mt-1 text-sm leading-6 text-default-500">
                                                Keep names current so shared workspace records stay clean.
                                            </p>
                                        </div>
                                    </div>
                                </Surface>
                                <Surface variant="secondary" className="rounded-[1.2rem] border border-default-200/80 p-4 md:col-span-2">
                                    <div className="flex items-start gap-3">
                                        <div className="rounded-2xl bg-default-100 p-2.5 text-default-500">
                                            <Mail className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <div className="font-semibold text-foreground">Account email</div>
                                            <p className="mt-1 text-sm leading-6 text-default-500">
                                                {user.email || 'No email on file'}
                                            </p>
                                        </div>
                                    </div>
                                </Surface>
                            </div>

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
                            <Button type="submit" variant="primary" className="rounded-full px-5 font-semibold" isPending={isProfileSaving}>
                                {isProfileSaving ? <Spinner color="current" size="sm" /> : "Save Profile"}
                            </Button>
                        </Card.Footer>
                    </form>
                </Card>
            </SettingsSection>

            {user.providerData.some(p => p.providerId === 'password') && (
                <SettingsSection title="Password" description="Change your account password. You will be logged out after a successful change.">
                    <Card className="rounded-[1.6rem] border border-default-200/80 bg-background/90 shadow-[0_20px_54px_-42px_rgba(15,23,42,0.4)]">
                        <form onSubmit={handlePasswordSubmit}>
                            <Card.Content className="space-y-5 p-5 md:p-6">
                                <Surface variant="secondary" className="rounded-[1.2rem] border border-default-200/80 p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="rounded-2xl bg-warning/10 p-2.5 text-warning">
                                            <KeyRound className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <div className="font-semibold text-foreground">Security note</div>
                                            <p className="mt-1 text-sm leading-6 text-default-500">
                                                Password changes log you out after success, so make sure the new password is stored somewhere safe.
                                            </p>
                                        </div>
                                    </div>
                                </Surface>

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
                                <Button type="submit" variant="primary" className="rounded-full px-5 font-semibold" isPending={isPasswordSaving}>
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
