# GitHub Crawler

A clean-architecture TypeScript application that uses the GitHub GraphQL API to crawl repository star counts.

## Architecture

This project strictly adheres to **Clean Architecture**:
- **Domain:** Immutable `Repository` entities, and interfaces for `GithubClient` and `RepositoryStore`.
- **Use Cases:** The `CrawlStars` orchestrator encapsulates the business rules of partitioning GraphQL queries to bypass the 1,000 node search limit.
- **Infrastructure:** Implements the aforementioned interfaces using `node-fetch` and `pg`. It properly manages API rate limits, backoffs, and connects to a PostgreSQL database via `UPSERT` queries for idempotency.
- **Performance:** Incorporates dynamic date window algorithm scaling up to 4x chunks to blaze through sparse pagination bounds without hitting GraphQL limits.

## Prerequisites
- Node.js 18+
- PostgreSQL server (or use Docker / GitHub Actions)
- GitHub Personal Access Token (PAT)

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables. You could create `.env`:
   ```env
   GITHUB_TOKEN=your_personal_access_token
   PG_CONNECTION_STRING=postgres://postgres:postgres@localhost:5432/github
   ```

3. Run the application:
   ```bash
   npm start
   ```

## Theoretical Explanations
See `ANSWERS.md` for explanations regarding scaling to 500M repositories and optimizing the database schema for future highly dynamic metadata (PRs, Issues, CI Checks).
