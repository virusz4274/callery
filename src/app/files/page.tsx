
import { FileBrowserPage } from '@/components/file-browser-page';
import { fileSystemData } from '@/lib/data/file-data';

export default function FilesPage() {
  // In a real application, you would fetch this data from an API
  // or generate it on the server based on the actual file system.
  return <FileBrowserPage rootNode={fileSystemData} />;
}
