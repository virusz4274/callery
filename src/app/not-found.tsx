import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] px-4 text-center">
            <h2 className="text-4xl font-bold tracking-tight mb-4">Page Not Found</h2>
            <p className="text-default-500 max-w-[500px] mb-8">
                The page you are looking for does not exist or has been moved.
            </p>
            <Link
                href="/"
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
                Go Home
            </Link>
        </div>
    );
}
