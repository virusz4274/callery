'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { Button, Card, Input, Label, TextArea, TextField } from '@heroui/react';
import { authFetch } from '@/lib/api-client';

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

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(
            data.error || 'Too many messages from this network. Please wait a bit and try again.'
          );
        }

        if (response.status === 403) {
          throw new Error(
            data.error || 'This request did not come from the current app origin. Please reload and try again.'
          );
        }

        throw new Error(data.error || 'Failed to send message');
      }

      setSubmitStatus({
        type: 'success',
        message: 'Your message has been sent. We will get back to you soon.',
      });
      setSubject('');
      setMessage('');
      setCompanyWebsite('');
    } catch (error) {
      setSubmitStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to send message',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="rounded-[1.9rem] border border-default-200/80 bg-background/95 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
      <Card.Content className="p-6 sm:p-7">
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
            Contact the team
          </div>
          <h2 className="text-2xl font-bold tracking-[-0.03em] text-foreground">
            Send a support message
          </h2>
          <p className="text-sm leading-6 text-default-500">
            We read better bug reports when the context is specific, so include the affected page,
            rough time, and expected result.
          </p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit} id="support-form">
          <div
            className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
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

          <div className="grid gap-4 md:grid-cols-2">
            <TextField value={name} onChange={setName} isRequired>
              <Label>Name</Label>
              <Input placeholder="Your name" autoComplete="name" />
            </TextField>
            <TextField value={email} onChange={setEmail} isRequired>
              <Label>Email</Label>
              <Input placeholder="you@company.com" type="email" autoComplete="email" />
            </TextField>
          </div>

          <TextField value={subject} onChange={setSubject} isRequired>
            <Label>Subject</Label>
            <Input placeholder="What do you need help with?" />
          </TextField>

          <TextField>
            <Label>Message</Label>
            <TextArea
              placeholder="Describe the problem, the page you were on, and anything you already tried."
              rows={5}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
            />
          </TextField>

          {submitStatus && (
            <div
              className={
                submitStatus.type === 'success'
                  ? 'rounded-2xl border border-success/20 bg-success/5 px-4 py-3 text-sm text-success'
                  : 'rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger'
              }
            >
              {submitStatus.message}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button className="rounded-full px-5 font-semibold" type="submit" isPending={isSubmitting}>
              {isSubmitting ? 'Sending...' : 'Send message'}
            </Button>
          </div>
        </form>
      </Card.Content>
    </Card>
  );
}
