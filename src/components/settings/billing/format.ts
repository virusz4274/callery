export function formatBytes(bytes: number, decimals = 1) {
    if (!bytes) {
        return '0 B';
    }

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, index)).toFixed(dm))} ${sizes[index]}`;
}

export function formatSeconds(seconds: number) {
    return `${Math.floor(seconds / 60)} mins`;
}
