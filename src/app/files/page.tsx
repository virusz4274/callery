

import { FileBrowserPage } from '@/components/pages/file-browser-page';
import { fileSystemData } from '@/lib/data/file-data';

export default function FilesPage() {
  return <FileBrowserPage rootNode={fileSystemData} />;
}
