import { S3Client } from '@aws-sdk/client-s3';
import { SUPPORTED_UPLOAD_AUDIO_MIME_TYPES } from './upload-audio-support';
import { env } from './env';

export const r2Client = new S3Client({
    region: env.R2_REGION,
    endpoint: env.R2_ENDPOINT,
    forcePathStyle: env.R2_FORCE_PATH_STYLE,
    credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
});

export const R2_BUCKET = env.R2_BUCKET_NAME;

export const ALLOWED_AUDIO_MIME_TYPES = SUPPORTED_UPLOAD_AUDIO_MIME_TYPES;
