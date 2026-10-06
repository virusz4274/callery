function getConfiguredBootstrapEmails(env: NodeJS.ProcessEnv = process.env): string[] {
    return (env.ADMIN_EMAILS || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
}

export function isBootstrapAdminEmail(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
        return false;
    }

    return getConfiguredBootstrapEmails(env).includes(normalizedEmail);
}
