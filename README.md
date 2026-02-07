# CallOrganizer

A modern web application for managing, transcribing, and organizing phone call recordings.

## Documentation

**[📚 View Full Documentation](docs/README.md)**

*   **[User Guide](docs/user-guide.md)**: Features and usage instructions.
*   **[Setup Guide](docs/setup-guide.md)**: Local development setup.
*   **[Android App](docs/android-app.md)**: Capacitor setup for mobile.
*   **[API Reference](docs/api-reference.md)**: API endpoints.
*   **[Billing System](docs/billing.md)**: Plans and Stripe integration.
*   **[Changelog](CHANGELOG.md)**: Version history.

## Quick Start

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Set up environment variables**:
    Copy `.env.example` (or see [Setup Guide](docs/setup-guide.md)) to `.env`.

3.  **Initialize the Database**:
    ```bash
    npx tsx src/lib/db/init.ts
    ```

4.  **Run the development server**:
    ```bash
    npm run dev
    ```

Open [http://localhost:9000](http://localhost:9000) with your browser to see the result.
