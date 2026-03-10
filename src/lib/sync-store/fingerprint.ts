export function generateFingerprint(
    folderUri: string,
    filePath: string,
    fileSize: number,
    mtime: number
): string {
    return `${folderUri}:${filePath}:${fileSize}:${mtime}`;
}
