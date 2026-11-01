import Link from 'next/link';
import styles from '@/components/marketing/information-pages.module.css';

type ChangelogEntry = {
  version: string;
  date: string;
  publishedAt: string;
  type: string;
  summary: string;
  items: string[];
};

export function ChangelogPage({ changes }: { changes: ChangelogEntry[] }) {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.title}>What’s new in Callery</h1>
        <p className={styles.intro}>New releases and improvements to your call archive.</p>
      </header>

      <ol className={styles.timeline} aria-label="Product releases">
        {changes.map((change, index) => (
          <li className={styles.release} key={change.version}>
            <time className={styles.releaseDate} dateTime={change.publishedAt}>{change.date}</time>
            <article className={styles.releaseContent} aria-labelledby={`release-${index + 1}`}>
              <div className={styles.releaseHeading}>
                <h2 id={`release-${index + 1}`}>{change.version}</h2>
                <span className={styles.releaseType}>{change.type}</span>
              </div>
              <p className={styles.releaseSummary}>{change.summary}</p>
              <ul className={styles.releaseItems}>
                {change.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          </li>
        ))}
      </ol>

      <p className={styles.contactNote}>
        Have a question about an update? <Link className={styles.textLink} href="/support">Contact support</Link>.
      </p>
    </div>
  );
}
