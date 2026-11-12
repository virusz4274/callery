import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    manufacturer: z.string().min(1),
    category: z.enum(['setup', 'import']).default('import'),
    task: z.string().min(1),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    draft: z.boolean().default(true),
    verification: z.enum(['verified', 'limited', 'unverified']),
    devices: z.string().min(1),
    region: z.string().min(1),
    dialer: z.string().min(1),
    osVersion: z.string().min(1),
    access: z.enum(['files', 'share', 'varies', 'unverified', 'unavailable']),
    archiveWorkflow: z.enum(['folder-copy', 'conditional', 'unsupported']),
    formats: z.array(z.enum(['MP3', 'WAV', 'M4A', 'MP4', 'WebM'])).min(1),
    metadataRecognition: z.string().min(1),
    sources: z.array(z.object({ title: z.string().min(1), url: z.url() })).min(1),
    verifiedAt: z.coerce.date().optional(),
  }).refine(entry => entry.verification === 'unverified' || Boolean(entry.verifiedAt), {
    message: 'Verified and limited guides must record when their sources were reviewed.',
    path: ['verifiedAt'],
  }).refine(entry => entry.draft || entry.verification !== 'unverified', {
    message: 'Unverified guides must remain drafts.',
    path: ['draft'],
  }).refine(entry => entry.archiveWorkflow !== 'folder-copy' || entry.access === 'files', {
    message: 'A folder-copy workflow requires direct access to the original files.',
    path: ['archiveWorkflow'],
  }).refine(entry => entry.access !== 'share' || entry.archiveWorkflow === 'unsupported', {
    message: 'Per-recording sharing is not a supported bulk archive workflow.',
    path: ['archiveWorkflow'],
  }),
});

export const collections = { guides };
