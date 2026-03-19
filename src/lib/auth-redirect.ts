const DEFAULT_AUTH_REDIRECT = '/recordings';

type AuthRedirectCopy = {
  loginDescription: string;
  signupDescription: string;
};

const GENERIC_AUTH_COPY: AuthRedirectCopy = {
  loginDescription:
    'Sign in to open your recordings workspace, search transcripts, and continue review without losing context.',
  signupDescription:
    'Set up your workspace to upload recordings, organize contacts, and start searching conversations with structure.',
};

const REDIRECT_COPY: Record<string, AuthRedirectCopy> = {
  '/recordings': {
    loginDescription:
      'Sign in to open your recordings workspace and get back to search, filters, and call review.',
    signupDescription:
      'Create your workspace to upload recordings, organize call history, and start reviewing conversations in one place.',
  },
  '/contacts': {
    loginDescription:
      'Sign in to open your contacts workspace and jump back into linked call history.',
    signupDescription:
      'Create your workspace to connect contacts with conversations and keep your call history easier to revisit.',
  },
  '/files': {
    loginDescription:
      'Sign in to inspect your file library, browse stored recordings, and open details with confidence.',
    signupDescription:
      'Create your workspace to keep stored recordings organized, searchable, and easier to inspect later.',
  },
  '/upload': {
    loginDescription:
      'Sign in to upload recordings and continue building your workspace in one organized flow.',
    signupDescription:
      'Create your workspace to upload recordings, keep the original audio safe, and start processing calls in one place.',
  },
  '/settings': {
    loginDescription:
      'Sign in to manage your workspace settings, exports, notifications, and plan details.',
    signupDescription:
      'Create your workspace to manage storage, exports, notifications, and account preferences in one place.',
  },
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
