import Link from 'next/link';
import { SupportFormCard } from '@/components/pages/support-form-card';
import styles from '@/components/marketing/information-pages.module.css';

type SupportPageProps = {
  supportEmail: string;
};

export function SupportPage({ supportEmail }: SupportPageProps) {
  return (
    <div className={`${styles.page} ${styles.supportLayout}`}>
      <div className={styles.supportIntro}>
        <h1 className={styles.title}>How can we help?</h1>
        <p className={styles.intro}>
          Get help with importing recordings, your account, or billing. Send a message and we’ll reply by email.
        </p>

        <div className={styles.emailContact}>
          <h2>Prefer email?</h2>
          <a className={styles.textLink} href={`mailto:${supportEmail}`}>{supportEmail}</a>
        </div>
      </div>

      <SupportFormCard />

      <nav className={styles.helpLinks} aria-label="Support resources">
        <Link href="/pricing" className={styles.helpLink}>
          <span>Plans and billing</span>
          <span>Compare plans, storage, and transcription allowances.</span>
        </Link>
        <Link href="/changelog" className={styles.helpLink}>
          <span>Product updates</span>
          <span>Read the latest Callery release notes.</span>
        </Link>
      </nav>
    </div>
  );
}
