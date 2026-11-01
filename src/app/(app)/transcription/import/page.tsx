import { TranscriptionImportPage } from '@/components/pages/transcription-import-page';

export default async function TranscriptionImport({ searchParams }: { searchParams: Promise<{ importId?: string | string[] }> }) {
    const params = await searchParams;
    return <TranscriptionImportPage initialImportId={typeof params.importId === 'string' ? params.importId : undefined} />;
}
