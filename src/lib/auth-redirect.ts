const DEFAULT_AUTH_REDIRECT = '/recordings';

type AuthRedirectCopy = {
  loginDescription: string;
  signupDescription: string;
};

const GENERIC_AUTH_COPY: AuthRedirectCopy = {
  loginDescription: 'Sign in to continue.',
  signupDescription: 'Create an account to save and transcribe recordings.',
};

const REDIRECT_COPY: Record<string, AuthRedirectCopy> = {
  '/recordings': { loginDescription: 'Sign in to view your recordings.', signupDescription: 'Create an account to save and transcribe recordings.' },
  '/contacts': { loginDescription: 'Sign in to view your contacts.', signupDescription: 'Create an account to link contacts and recordings.' },
  '/files': { loginDescription: 'Sign in to browse your files.', signupDescription: 'Create an account to organize your recordings.' },
  '/upload': { loginDescription: 'Sign in to upload recordings.', signupDescription: 'Create an account to upload recordings.' },
  '/settings': { loginDescription: 'Sign in to manage your settings.', signupDescription: 'Create an account to manage your recordings and preferences.' },
};

function toSafeRelativeUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw, 'http://localhost');

    if (parsed.origin !== 'http://localhost') {
      return null;
    }

    if (!parsed.pathname.startsWith('/')) {
      return null;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function sanitizeRedirectTarget(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed || !trimmed.startsWith('/')) {
    return null;
  }

  if (trimmed.startsWith('//')) {
    return null;
  }

  return toSafeRelativeUrl(trimmed);
}

export function resolvePostAuthRedirect(raw: string | null | undefined): string {
  return sanitizeRedirectTarget(raw) ?? DEFAULT_AUTH_REDIRECT;
}

export function resolveAuthLinkRedirect(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return null;
  }

  return sanitizeRedirectTarget(raw) ?? DEFAULT_AUTH_REDIRECT;
}

export function buildAuthPageHref(pathname: string, rawRedirect: string | null | undefined): string {
  const redirect = resolveAuthLinkRedirect(rawRedirect);
  if (!redirect) {
    return pathname;
  }

  return `${pathname}?${new URLSearchParams({ redirect }).toString()}`;
}

export function buildLoginRedirectHref(redirectTarget: string): string {
  return `/login?${new URLSearchParams({
    redirect: sanitizeRedirectTarget(redirectTarget) ?? DEFAULT_AUTH_REDIRECT,
  }).toString()}`;
}

export function buildCurrentPath(pathname: string, search: string): string {
  return search ? `${pathname}?${search}` : pathname;
}

export function getAuthRedirectCopy(raw: string | null | undefined): AuthRedirectCopy {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return GENERIC_AUTH_COPY;
  }

  const target = sanitizeRedirectTarget(raw) ?? DEFAULT_AUTH_REDIRECT;

  for (const [prefix, copy] of Object.entries(REDIRECT_COPY)) {
    if (target === prefix || target.startsWith(`${prefix}?`) || target.startsWith(`${prefix}#`)) {
      return copy;
    }
  }

  return REDIRECT_COPY['/recordings'];
}

export { DEFAULT_AUTH_REDIRECT };
