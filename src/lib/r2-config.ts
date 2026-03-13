import { S3Client } from '@aws-sdk/client-s3';
import { SUPPORTED_UPLOAD_AUDIO_MIME_TYPES } from './upload-audio-support';

if (!process.env.R2_ENDPOINT) {
    throw new Error('Please define the R2_ENDPOINT environment variable');
}
if (!process.env.R2_ACCESS_KEY_ID) {
    throw new Error('Please define the R2_ACCESS_KEY_ID environment variable');
}
if (!process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error('Please define the R2_SECRET_ACCESS_KEY environment variable');
}
if (!process.env.R2_BUCKET_NAME) {
    throw new Error('Please define the R2_BUCKET_NAME environment variable');
}

export const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME;

export const ALLOWED_AUDIO_MIME_TYPES = SUPPORTED_UPLOAD_AUDIO_MIME_TYPES;
