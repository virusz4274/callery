import Link from 'next/link';
import { Logo } from '@/components/icons';
import { ThemeSwitcher } from '@/components/theme-switcher';
import styles from './marketing-shell.module.css';

export function MarketingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerTop}>
          <div className={styles.footerAbout}>
            <Link href="/" className={styles.brand} aria-label="Callery home"><Logo className="size-7" />Callery</Link>
            <p>A place for your recorded calls, and the details you want to find again.</p>
          </div>
          <nav className={styles.footerGroup} aria-label="Product links">
            <h2>Callery</h2>
            <Link href="/#how-it-works">How it works</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/changelog">Updates</Link>
            <Link href="/developers">Developers</Link>
          </nav>
          <nav className={styles.footerGroup} aria-label="Help and legal links">
            <h2>Help and information</h2>
            <Link href="/support">Support</Link>
            <Link href="/privacy-policy">Privacy</Link>
            <Link href="/terms-of-service">Terms</Link>
          </nav>
          <nav className={styles.footerGroup} aria-label="Open source links">
            <h2>Open source</h2>
            <a href="https://github.com/virusz4274/callery">Source code</a>
            <a href="https://github.com/virusz4274/callery/blob/main/LICENSE">AGPL-3.0 license</a>
            <a href="https://github.com/virusz4274/callery/blob/main/docs/setup-guide.md">Self-hosting guide</a>
          </nav>
        </div>
        <div className={styles.footerBottom}>
          <span>Callery. Keep your conversations within reach.</span>
          <div className={styles.appearance}><span>Appearance</span><ThemeSwitcher /></div>
        </div>
      </div>
    </footer>
  );
}
