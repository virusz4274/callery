
'use client';

import React from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { SettingsPage } from './settings-page';
import type { UseFormReturn } from 'react-hook-form';
import type { User } from 'firebase/auth';

interface ProfileSettingsProps {
    user: User | null;
    profileForm: UseFormReturn<any>;
    passwordForm: UseFormReturn<any>;
    onUpdateProfile: (values: any) => Promise<void>;
    onChangePassword: (values: any) => Promise<void>;
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
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <SettingsPage title="Profile" description="Update your personal information.">
                <Card>
                     <Form {...profileForm}>
                        <form onSubmit={profileForm.handleSubmit(onUpdateProfile)}>
                            <CardContent className="space-y-4">
                                 <div className="grid sm:grid-cols-2 gap-4">
                                    <FormField
                                        control={profileForm.control}
                                        name="firstName"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>First Name</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Your first name" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={profileForm.control}
                                        name="lastName"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Last Name</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Your last name" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input id="email" type="email" readOnly value={user.email || ''} className="bg-muted/50 cursor-not-allowed"/>
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Button type="submit" disabled={isProfileSaving}>
                                    {isProfileSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Save Profile
                                </Button>
                            </CardFooter>
                        </form>
                    </Form>
                </Card>
            </SettingsPage>
            
            {user.providerData.some(p => p.providerId === 'password') && (
                <SettingsPage title="Password" description="Change your account password. You will be logged out after a successful change.">
                     <Card>
                        <Form {...passwordForm}>
                            <form onSubmit={passwordForm.handleSubmit(onChangePassword)}>
                                <CardContent className="space-y-4">
                                     <FormField
                                        control={passwordForm.control}
                                        name="currentPassword"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Current Password</FormLabel>
                                                <FormControl>
                                                    <Input type="password" placeholder="Your current password" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={passwordForm.control}
                                        name="newPassword"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>New Password</FormLabel>
                                                <FormControl>
                                                    <Input type="password" placeholder="Enter a new password" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={passwordForm.control}
                                        name="confirmPassword"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Confirm New Password</FormLabel>
                                                <FormControl>
                                                    <Input type="password" placeholder="Confirm your new password" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </CardContent>
                                <CardFooter>
                                    <Button type="submit" disabled={isPasswordSaving}>
                                        {isPasswordSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Change Password
                                    </Button>
                                </CardFooter>
                            </form>
                        </Form>
                    </Card>
                </SettingsPage>
            )}
        </div>
    );
}
