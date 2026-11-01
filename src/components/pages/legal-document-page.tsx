import Link from 'next/link';
import styles from '@/components/marketing/information-pages.module.css';

type LegalDocumentPageProps = {
  title: string;
  sections: {
    title: string;
    content: string[];
  }[];
  lastUpdated: string;
};

export function LegalDocumentPage({ title, sections, lastUpdated }: LegalDocumentPageProps) {
  return (
    <div className={styles.page}>
      <header className={styles.legalHeader}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.updatedDate}>Last updated {lastUpdated}</p>
      </header>

      <div className={styles.legalLayout}>
        <aside className={styles.legalSidebar}>
          <nav aria-label="On this page" className={styles.contents}>
            <h2>On this page</h2>
            <ol>
              {sections.map((section, index) => (
                <li key={section.title}>
                  <a href={`#legal-section-${index + 1}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>
          <p className={styles.policyContact}>
            Questions about this document? <Link className={styles.textLink} href="/support">Contact us</Link>.
          </p>
        </aside>

        <article className={styles.legalArticle} aria-label={title}>
          {sections.map((section, index) => (
            <section key={section.title} id={`legal-section-${index + 1}`} className={styles.legalSection}>
              <h2>{section.title}</h2>
              {section.content.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
