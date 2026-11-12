export type DocumentationGroup = 'Using Callery' | 'Developers' | 'Self-hosting';

export const documentationPages = [
  {
    slug: 'user-guide',
    title: 'User guide',
    description: 'Upload recordings, find conversations, manage transcripts, and look after your Callery account.',
    group: 'Using Callery',
  },
  {
    slug: 'transcription-batches',
    title: 'Transcription batches',
    description: 'Prepare a bulk import, choose when processing starts, and understand usage and failures.',
    group: 'Using Callery',
  },
  {
    slug: 'recording-filenames',
    title: 'Recording filename metadata',
    description: 'See how Callery recognizes contact details and recording dates from audio filenames.',
    group: 'Using Callery',
  },
  {
    slug: 'integration-api',
    title: 'Recording integration API',
    description: 'Connect sync clients and CRMs with scoped credentials, resumable uploads, and transcript search.',
    group: 'Developers',
  },
  {
    slug: 'mcp-platforms',
    title: 'Connect AI assistants',
    description: 'Connect compatible AI assistants to your Callery instance through MCP and user-approved access.',
    group: 'Developers',
  },
  {
    slug: 'api-reference',
    title: 'API reference',
    description: 'Understand the public integration endpoints and their boundaries with internal application interfaces.',
    group: 'Developers',
  },
  {
    slug: 'setup-guide',
    title: 'Self-hosting setup guide',
    description: 'Deploy Callery with Node.js or Docker Compose, configure storage, and choose processing services.',
    group: 'Self-hosting',
  },
  {
    slug: 'small-team-setup',
    title: 'Small team setup and recovery',
    description: 'Configure a self-hosted company archive, invite employees, and plan backups and recovery.',
    group: 'Self-hosting',
  },
  {
    slug: 'releases',
    title: 'Release and deployment boundaries',
    description: 'Understand source releases, build configuration, deployment boundaries, and release verification.',
    group: 'Self-hosting',
  },
] as const satisfies readonly {
  slug: string;
  title: string;
  description: string;
  group: DocumentationGroup;
}[];

export type DocumentationPage = (typeof documentationPages)[number];

export const documentationGroups: readonly DocumentationGroup[] = [
  'Using Callery',
  'Developers',
  'Self-hosting',
];
