# GitHub Crawler Answers

## 1. What would you do differently if this were run to collect data on 500 million repositories instead of 100,000?

If the scale increases from 100,000 to 500,000,000 repositories, a simple, single-threaded Node.js script saving to a standard PostgreSQL database will become a severe bottleneck due to memory limits, network I/O, database write contention, and API rate limits. 

Here is what I would do differently:

**A. Distributed Scraping & Pagination Strategy:**
- Given GitHub’s 1,000-node search query limit, walking 500 million repositories via the Search API sequentially is unfeasible. We would need to aggressively shard the search space using smaller time slices (e.g., down to seconds/minutes of `created` time) and distribute these "Shards" to a fleet of scraping workers (e.g., Kubernetes pods or AWS Lambdas).
- A centralized message broker (like **Kafka** or **RabbitMQ**) or a task queue (like **Celery/Redis**) would manage the pagination shards, ensuring workers don't duplicate work and can retry failed slices.

**B. Database Write Optimization (No more synchronous UPSERTs):**
- Standard row-by-row `UPSERT` on Postgres for 500M records would suffer from heavy index updating overhead.
- Instead, I would have the workers write their payload chunks (e.g., as JSON or CSV files) to an Object Store (like AWS S3) first. Then, use Postgres **COPY** commands or a specialized data warehouse (like **ClickHouse** or **Snowflake**) built for massive ingestion.

**C. Rate Limiting Across a Fleet:**
- With a fleet of workers hitting GitHub, we definitely need a centralized token bucket or rate limiter system using **Redis** to prevent exhausting GitHub organization API tokens. We would likely need multiple Personal Access Tokens (PATs) or a GitHub App installation to get higher rate limits (GitHub Apps offer 15,000 requests/hour compared to 5,000 for PATs).

---

## 2. Schema Evolution for Future Metadata (Issues, Pull Requests, Comments, Reviews, etc.)

Currently, we store `metadata` as a `JSONB` column on the core `repositories` table. While `JSONB` is flexible and great for small key-value pairs, embedding constantly changing lists (like comments on a PR that grow from 10 this morning to 20 tomorrow) directly into the `repositories` table is a bad idea. Updating a massive JSON blob dynamically forces PostgreSQL to rewrite the entire row, causing Write Amplification and heavy locking.

**Evolving the Schema (Dimensional Modeling/Star Schema Approach):**

To make updating DB information an efficient, append-mostly operation with minimal rows affected, we would normalize the rapidly changing entities into separate tables with Foreign Keys back to the repository.

### Proposed Target Schema:

1. **`repositories` (Core Table - Infrequent Updates):**
   - Stores `id` (PK), `name_with_owner`, `stars`, `created_at`.
   - Updated only if the repository gets renamed or the star count changes (which we could also externalize into a time-series table if we want star history, rather than just current stars).

2. **`pull_requests` (Medium Frequency):**
   - `id` (PK), `repository_id` (FK), `number`, `title`, `state`, `created_at`, `closed_at`.

3. **`pull_request_comments` (High Frequency Append-Only):**
   - `id` (PK), `pull_request_id` (FK), `author`, `body`, `created_at`.
   - **Efficiency:** Adding a new comment is an **INSERT** operation. We never UPDATE the `pull_requests` or `repositories` tables when a comment is added, eliminating row locks and update overhead on parent entities.

4. **`ci_checks` (Very High Frequency Append-Only / Time-Series):**
   - `id` (PK), `commit_sha`, `repository_id` (FK), `status`, `completed_at`.

By moving from a coarse JSON document approach to an append-oriented relational model, we ensure that as the repository grows in activity, the crawler simply multi-inserts the new activities without thrashing the database engine updating large, older blobs.
