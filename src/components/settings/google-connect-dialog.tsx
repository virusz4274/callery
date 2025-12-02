
'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GoogleIcon } from "../icons/google-icon";

type GoogleConnectDialogProps = {
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
}

export function GoogleConnectDialog({ onOpenChange, onConfirm }: GoogleConnectDialogProps) {
    return (
        <AlertDialog open={true} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <div className="flex justify-center mb-4">
                        <GoogleIcon className="h-12 w-12" />
                    </div>
                    <AlertDialogTitle className="text-center">Connect to Google Contacts</AlertDialogTitle>
                    <AlertDialogDescription className="text-center">
                        To automatically match names to your call recordings, Call Memo needs permission to view your Google Contacts.
                        <br/><br/>
                        This app will request <span className="font-semibold text-foreground">read-only access</span>. We will never edit or delete your contacts.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="sm:justify-center">
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>
                        Continue to Google
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
