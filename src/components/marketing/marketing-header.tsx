'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Logo } from '@/components/icons';
import styles from './marketing-shell.module.css';

const links = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/developers', label: 'Developers' },
  { href: '/support', label: 'Support' },
];

export function MarketingHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);

  return (
    <header className={styles.header} onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        setOpen(false);
        toggle.current?.focus();
      }
    }}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label="Callery home" onClick={() => setOpen(false)}>
          <Logo className="size-8" />Callery
        </Link>
        <nav className={styles.desktopNav} aria-label="Main navigation">
          {links.map(link => <Link key={link.href} href={link.href} className={styles.navLink}
            aria-current={pathname === link.href ? 'page' : undefined}>{link.label}</Link>)}
        </nav>
        <div className={styles.actions}>
          <Link href="/login" className={`${styles.navLink} ${styles.login}`}>Log in</Link>
          <Link href="/signup" className={`${styles.button} ${styles.headerCta}`}>Start free trial</Link>
          <button ref={toggle} type="button" className={styles.menuButton} aria-label="Site menu"
            aria-expanded={open} aria-controls="marketing-navigation" onClick={() => setOpen(!open)}>
            {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <nav id="marketing-navigation" aria-label="Mobile site navigation" className={styles.mobileNav} hidden={!open}>
        {links.map(link => <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</Link>)}
        <Link href="/login" onClick={() => setOpen(false)}>Log in</Link>
      </nav>
    </header>
  );
}
