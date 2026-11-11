import type { Metadata } from 'next';
import Link from 'next/link';
import { createMarketingMetadata, siteSeoConfig } from '@/lib/seo';
import shell from '@/components/marketing/marketing-shell.module.css';
import styles from '@/components/marketing/developers.module.css';

const guide = 'https://github.com/virusz4274/callery/blob/main/docs/integration-api.md';
const agents = 'https://github.com/virusz4274/callery/blob/main/docs/mcp-platforms.md';

export const metadata: Metadata = createMarketingMetadata({
  config: siteSeoConfig,
  title: 'Developer documentation',
  description: 'Connect mobile apps, CRMs, sync clients, and AI assistants to your Callery recordings through the API and MCP.',
  path: '/developers',
  keywords: ['recording API', 'CRM recording integration', 'MCP', 'developer documentation'],
});

export default function DevelopersPage() {
  return <div className={styles.page}>
    <header className={styles.intro}>
      <h1>Build around your conversations.</h1>
      <p>Send call recordings from a mobile app or CRM, read transcripts, and find the conversations you need. Connect to the Callery instance where your recordings live.</p>
      <div className={styles.actions}>
        <a href={guide} className={shell.button}>Read the integration guide</a>
        <a href="/api/v1/openapi.json" className={shell.buttonSecondary}>Open this server’s API reference</a>
      </div>
    </header>

    <section className={styles.connection} aria-labelledby="connect-heading">
      <div>
        <h2 id="connect-heading">Start with a connection.</h2>
        <p>Create a named API key for your client, choose its permissions, and keep it in the client’s secure storage. OAuth lets supported applications ask the user to sign in and approve access instead.</p>
        <Link href="/settings?tab=integrations" className={styles.textLink}>Manage API keys and connected apps</Link>
      </div>
      <div className={styles.example}>
        <p>Discover limits before uploading.</p>
        <pre><code>{'curl https://your-callery.example/api/v1/capabilities'}</code></pre>
        <p>Use your own server URL. The live OpenAPI reference describes this deployment; the GitHub guide follows the repository’s current version.</p>
      </div>
    </section>

    <section className={styles.workflows} aria-label="Integration guides">
      <article>
        <h2>Mobile apps and CRMs</h2>
        <p>Upload recording files with contact and call metadata. Resume supported uploads after a network interruption, prevent duplicates with your call IDs, and poll for transcription results.</p>
        <a href={`${guide}#resumable-direct-uploads`} className={styles.textLink}>Upload and recovery guide</a>
      </article>
      <article>
        <h2>Search and transcripts</h2>
        <p>Search descriptions of conversations with contact and date filters. Retrieve transcript pages and return links that open the recording at the relevant passage.</p>
        <a href={`${guide}#search-recordings-and-read-transcript-pages`} className={styles.textLink}>Search and retrieval guide</a>
      </article>
      <article>
        <h2>AI assistants</h2>
        <p>Connect an assistant to this instance’s remote MCP endpoint. Users approve access to their own recordings, and results link back to Callery for playback and uploads.</p>
        <a href={agents} className={styles.textLink}>ChatGPT, Claude, and Gemini setup</a>
      </article>
    </section>

    <aside className={styles.notes}>
      <h2>Choose access for each client.</h2>
      <p>Reading transcripts, uploading files, downloading audio, and requesting transcription have separate permissions. Uploading may start automatic transcription according to the account’s settings. Storage, processing, and retention policies still apply.</p>
      <p>The API guide includes authentication, limits, errors, retry behavior, and self-hosting details. <a href="https://github.com/virusz4274/callery/issues">Report a documentation issue on GitHub.</a></p>
    </aside>
  </div>;
}
