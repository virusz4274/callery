
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useUser, useUserProfile, useFirestore, useAuth } from '@/firebase';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { doc, updateDoc } from 'firebase/firestore';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const profileFormSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
});

const passwordFormSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required for security.'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters long.'),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "New passwords don't match",
  path: ['confirmPassword'],
});

export function ProfileSettings() {
    const { user } = useUser();
    const { userProfile } = useUserProfile(user);
    const firestore = useFirestore();
    const auth = useAuth();
    const { toast } = useToast();

    const [isProfileSaving, setProfileSaving] = useState(false);
    const [isPasswordSaving, setPasswordSaving] = useState(false);

    const profileForm = useForm<z.infer<typeof profileFormSchema>>({
        resolver: zodResolver(profileFormSchema),
        defaultValues: {
            firstName: '',
            lastName: '',
        },
    });

    const passwordForm = useForm<z.infer<typeof passwordFormSchema>>({
        resolver: zodResolver(passwordFormSchema),
        defaultValues: {
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
        }
    });

    useEffect(() => {
        if (userProfile) {
            profileForm.reset({
                firstName: userProfile.firstName || '',
                lastName: userProfile.lastName || '',
            });
        }
    }, [userProfile, profileForm]);

    const handleUpdateProfile = async (values: z.infer<typeof profileFormSchema>) => {
        if (!user) return;
        setProfileSaving(true);
        try {
            const userRef = doc(firestore, 'users', user.uid);
            await updateDoc(userRef, {
                firstName: values.firstName,
                lastName: values.lastName,
            });
            toast({
                title: 'Profile Updated',
                description: 'Your personal information has been saved.',
            });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Update Failed',
                description: error.message,
            });
        } finally {
            setProfileSaving(false);
        }
    };

    const handleChangePassword = async (values: z.infer<typeof passwordFormSchema>) => {
        if (!user || !user.email) return;
        setPasswordSaving(true);

        try {
            // Re-authenticate the user for this sensitive operation
            const credential = EmailAuthProvider.credential(user.email, values.currentPassword);
            await reauthenticateWithCredential(user, credential);
            
            // If re-authentication is successful, update the password
            await updatePassword(user, values.newPassword);
            
            toast({
                title: 'Password Changed Successfully',
                description: 'You will be logged out for security. Please log in with your new password.',
            });

            // Log the user out for security
            setTimeout(() => auth.signOut(), 3000);

        } catch (error: any) {
             toast({
                variant: 'destructive',
                title: 'Password Change Failed',
                description: error.code === 'auth/wrong-password' 
                    ? 'The current password you entered is incorrect.' 
                    : error.message,
            });
        } finally {
            setPasswordSaving(false);
            passwordForm.reset();
        }
    };
    
    if (!user || !userProfile) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Card>
                 <Form {...profileForm}>
                    <form onSubmit={profileForm.handleSubmit(handleUpdateProfile)}>
                        <CardHeader>
                            <CardTitle>Profile</CardTitle>
                            <CardDescription>Update your personal information.</CardDescription>
                        </CardHeader>
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
            
            {user.providerData.some(p => p.providerId === 'password') && (
                 <Card>
                    <Form {...passwordForm}>
                        <form onSubmit={passwordForm.handleSubmit(handleChangePassword)}>
                            <CardHeader>
                                <CardTitle>Password</CardTitle>
                                <CardDescription>Change your account password. You will be logged out after a successful change.</CardDescription>
                            </CardHeader>
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
            )}
        </div>
    );
}
