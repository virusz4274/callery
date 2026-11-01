'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { Alert, Button, Input, Label, TextArea, TextField } from '@heroui/react';
import { authFetch } from '@/lib/api-client';
import styles from '@/components/marketing/information-pages.module.css';

export function SupportFormCard() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      const response = await authFetch('/api/support', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          subject,
          message,
          companyWebsite,
        }),
      });

      if (!response.ok) {
        const message = response.status === 429
          ? 'You’ve sent several messages. Please wait a few minutes before trying again.'
          : response.status === 403
            ? 'Your message could not be sent. Refresh this page and try again.'
            : response.status === 400
              ? 'Check your email address and add a little more detail to your subject and message.'
              : 'We couldn’t send your message right now. Please try again later or email us.';
        setSubmitStatus({ type: 'error', message });
        return;
      }

      setSubmitStatus({
        type: 'success',
        message: 'Message sent. We’ll reply by email.',
      });
      setSubject('');
      setMessage('');
      setCompanyWebsite('');
    } catch {
      setSubmitStatus({
        type: 'error',
        message: 'Your message could not be sent. Check your connection and try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className={styles.formPanel} aria-labelledby="support-form-title">
        <div className={styles.formHeading}>
          <h2 id="support-form-title">
            Send a message
          </h2>
          <p>
            Tell us what you need help with. For an issue, include the page you were on and what you expected to happen.
          </p>
        </div>

        <form className={styles.supportForm} onSubmit={handleSubmit} id="support-form">
          <div
            className={styles.honeypot}
            aria-hidden="true"
          >
            <label htmlFor="support-company-website">Company website</label>
            <input
              id="support-company-website"
              type="text"
              value={companyWebsite}
              onChange={(event) => setCompanyWebsite(event.target.value)}
              autoComplete="off"
              tabIndex={-1}
            />
          </div>

          <div className={styles.formRow}>
            <TextField value={name} onChange={setName} isRequired>
              <Label className={styles.fieldLabel}>Name</Label>
              <Input className={styles.fieldInput} placeholder="Your name" autoComplete="name" />
            </TextField>
            <TextField value={email} onChange={setEmail} isRequired>
              <Label className={styles.fieldLabel}>Email</Label>
              <Input className={styles.fieldInput} placeholder="you@example.com" type="email" autoComplete="email" />
            </TextField>
          </div>

          <TextField value={subject} onChange={setSubject} isRequired>
            <Label className={styles.fieldLabel}>Subject</Label>
            <Input className={styles.fieldInput} placeholder="What do you need help with?" />
          </TextField>

          <TextField>
            <Label className={styles.fieldLabel}>Message</Label>
            <TextArea
              className={`${styles.fieldInput} ${styles.messageInput}`}
              placeholder="Describe the problem, the page you were on, and anything you already tried."
              rows={5}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
            />
          </TextField>

          {submitStatus && (
            <Alert role={submitStatus.type === 'success' ? 'status' : 'alert'} aria-atomic="true" status={submitStatus.type === 'success' ? 'success' : 'danger'}>
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{submitStatus.message}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          <div className={styles.formActions}>
            <Button className={styles.sendButton} type="submit" isPending={isSubmitting} isDisabled={isSubmitting}>
              {isSubmitting ? 'Sending...' : 'Send message'}
            </Button>
          </div>
        </form>
    </section>
  );
}
