import { S3Client } from '@aws-sdk/client-s3';
import { getStorageClient } from '@/lib/r2';

let exportClient: S3Client | undefined;
/** Archive retries are counted by the worker, not multiplied inside the SDK. */
export function getExportStorageClient(): S3Client {
    if (!exportClient) {
        const config = getStorageClient().config;
        exportClient = new S3Client({ region: config.region, endpoint: config.endpoint, forcePathStyle: config.forcePathStyle,
            credentials: config.credentials, requestHandler: config.requestHandler, maxAttempts: 1 });
    }
    return exportClient;
}
