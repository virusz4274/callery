import type { Metadata } from 'next';
import './globals.css';
import NotFound from './not-found';

export const metadata: Metadata = { title: '404 - Page Not Found' };

export default function GlobalNotFound() {
    return (
        <html lang="en">
            <body>
                <NotFound />
            </body>
        </html>
    );
}
