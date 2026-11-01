import Link from 'next/link';
import { AudioLines, Check, FileAudio, FileText, FolderDown, Search, Upload, Users } from 'lucide-react';
import { landingPageFaqs } from './landing-page-content';
import styles from '@/components/marketing/landing.module.css';
import shell from '@/components/marketing/marketing-shell.module.css';

function CallPreview() {
  return (
    <figure className={styles.preview} aria-label="Example call">
      <figcaption className={styles.previewCaption}><span>Example call</span><span>From your recordings</span></figcaption>
      <div className={styles.previewWindow}>
        <div className={styles.searchReadout}><Search size={18} aria-hidden="true" /><span>Search your calls: <strong>delivery</strong></span></div>
        <div className={styles.callIdentity}>
          <div className={styles.avatar} aria-hidden="true">MR</div>
          <div><h2>Maya Rao</h2><p>Delivery confirmation</p></div>
          <FileAudio size={22} className={styles.fileIcon} aria-hidden="true" />
        </div>
        <div className={styles.callSummary}>
          <span className={styles.previewLabel}><FileText size={15} aria-hidden="true" />Summary</span>
          <p>Order 248 arrives <strong>Friday before noon.</strong> The driver will call 30 minutes before delivery.</p>
        </div>
        <div className={styles.transcript}>
          <span className={styles.previewLabel}>Transcript excerpt</span>
          <div><span className={styles.timestamp}>00:18</span><p>“The delivery is now confirmed for Friday, before noon.”</p></div>
        </div>
        <div className={styles.audioNote}><AudioLines size={20} aria-hidden="true" /><span>Original audio, transcript, and summary together</span></div>
      </div>
      <p className={styles.exampleNote}>A fictional conversation to show how Callery works.</p>
    </figure>
  );
}

export function LandingPage() {
  return (
    <div>
      <section className={styles.hero}>
        <div className={`${styles.container} ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <h1>Find the details in your recorded calls.</h1>
            <p>Bring your recordings together. Read transcripts and summaries, find what was said, and listen back to the original call.</p>
            <div className={styles.heroActions}>
              <Link href="/signup" className={shell.button}>Start free trial</Link>
              <a href="#how-it-works" className={shell.buttonSecondary}>See how it works</a>
            </div>
            <div className={styles.heroNote}><Check size={16} aria-hidden="true" />Upload the recordings you already have</div>
          </div>
          <CallPreview />
        </div>
      </section>

      <section id="how-it-works" className={`${styles.container} ${styles.section}`}>
        <div className={styles.sectionHeading}>
          <h2>From a folder of files to a useful call history.</h2>
          <p>Start with saved recordings from your phone or computer. Callery helps you make sense of them.</p>
        </div>
        <ol className={styles.steps}>
          {[
            { icon: Upload, title: 'Bring your recordings', description: 'Upload saved call audio, including recordings exported from Samsung phones and other recording apps.' },
            { icon: FileText, title: 'Get the conversation in writing', description: 'Create transcripts and summaries to review the key details without replaying the whole call.' },
            { icon: Search, title: 'Find it when you need it', description: 'Search what was said, narrow by contact or date, and return to the original recording.' },
          ].map((step, index) => (
            <li key={step.title}>
              <div className={styles.stepTop}><span>{index + 1}</span><step.icon size={23} aria-hidden="true" /></div>
              <h3>{step.title}</h3><p>{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.benefits} aria-label="Your call archive">
        <div className={styles.container}>
          <div className={styles.benefitRow}>
            <div className={styles.contactPreview} aria-label="Example contact history">
              <div className={styles.detailTitle}><Users size={20} aria-hidden="true" /><span>A history with every contact</span></div>
              {[
                { initials: 'MR', name: 'Maya Rao', title: 'Delivery confirmation', time: 'Today' },
                { initials: 'LM', name: 'Leo Martin', title: 'Car service appointment', time: 'Yesterday' },
                { initials: 'MR', name: 'Maya Rao', title: 'Order details', time: 'Monday' },
              ].map((call, index) => <div key={`${call.name}-${index}`} className={styles.contactRow}>
                <span className={styles.smallAvatar} aria-hidden="true">{call.initials}</span>
                <div><strong>{call.name}</strong><span>{call.title}</span></div><span className={styles.callDate}>{call.time}</span>
              </div>)}
              <p className={styles.detailFootnote}>Illustrative call history</p>
            </div>
            <div className={styles.benefitCopy}>
              <h2>Remember the conversation, even when you forget the filename.</h2>
              <p>A delivery date. An appointment. Something you agreed to follow up on. Search the words you remember, or use AI search to find related conversations by meaning.</p>
              <p>Keep calls connected to contacts and dates, so each conversation has a place in the bigger picture.</p>
            </div>
          </div>
          <div className={`${styles.benefitRow} ${styles.exportRow}`}>
            <div className={styles.benefitCopy}>
              <h2>The original recording stays part of the story.</h2>
              <p>Transcripts and summaries help you review a call. The original audio stays alongside them when you want to check the details for yourself.</p>
              <p>Download an organized archive of your recordings, transcripts, and metadata, with a browser viewer to help you browse it.</p>
            </div>
            <div className={styles.exportPreview}>
              <FolderDown size={32} strokeWidth={1.5} aria-hidden="true" />
              <h3>Your archive goes with you</h3>
              <ul>
                <li><FileAudio size={18} aria-hidden="true" /><span>Original recordings</span><Check size={16} aria-hidden="true" /></li>
                <li><FileText size={18} aria-hidden="true" /><span>Transcripts and metadata</span><Check size={16} aria-hidden="true" /></li>
                <li><FolderDown size={18} aria-hidden="true" /><span>Organized by contact and date</span><Check size={16} aria-hidden="true" /></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="hosting" className={`${styles.container} ${styles.section} ${styles.hosting}`}>
        <div>
          <h2>Your recordings.<br />A place to keep them.</h2>
          <p>Use Callery with hosting and setup handled for you. Start with a free trial, then choose the storage and transcription allowance that fits your archive.</p>
          <Link href="/pricing" className={shell.buttonSecondary}>See plans and pricing</Link>
        </div>
        <div className={styles.selfHost}>
          <h3>Prefer your own server?</h3>
          <p>Callery is open source and free to self-host under AGPL-3.0. You provide the infrastructure and processing services. Company archives are available in the self-hosted version.</p>
          <a href="https://github.com/virusz4274/callery/blob/main/docs/setup-guide.md">Read the self-hosting guide</a>
        </div>
      </section>

      <section className={styles.faqSection}>
        <div className={`${styles.container} ${styles.faqGrid}`}>
          <div><h2>A few things<br />you might be wondering.</h2><p>More questions? <Link href="/support">Get in touch.</Link></p></div>
          <div className={styles.faqList}>
            {landingPageFaqs.map(item => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}
          </div>
        </div>
      </section>

      <section className={`${styles.container} ${styles.closing}`}>
        <h2>Make your next search easier.</h2>
        <p>Give the calls you’ve saved a place you can come back to.</p>
        <Link href="/signup" className={shell.button}>Start free trial</Link>
      </section>
    </div>
  );
}
