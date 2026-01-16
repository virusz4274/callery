# CallOrganizer

A modern web application for managing, transcribing, and organizing phone call recordings.

## Documentation

*   [**Setup Guide**](docs/setup-guide.md): Installation, environment variables, and running locally.
*   [**Architecture**](docs/architecture.md): System overview, tech stack, and diagrams.
*   [**Data Model**](docs/data-model.md): MongoDB schema and types.
*   [**Project Structure**](docs/project-structure.md): Codebase organization and key files.
*   [**API Reference**](docs/api-reference.md): API endpoints documentation.
*   [**Billing & Subscriptions**](docs/billing.md): Plans, limits, and Stripe integration.

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

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
