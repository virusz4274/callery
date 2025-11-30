
import { FileBrowserPage } from '@/components/file-browser-page';
import { fileSystemData } from '@/lib/file-data';

export default function FilesPage() {
  return <FileBrowserPage rootNode={fileSystemData} />;
}
