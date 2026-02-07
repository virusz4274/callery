import { AndroidSyncPage } from '@/components/pages/android-sync-page';

export const metadata = {
    title: 'Folder Sync | VoSift',
    description: 'Sync call recordings from your Android device folders',
};

export default function AndroidSync() {
    return <AndroidSyncPage />;
}
