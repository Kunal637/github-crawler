import { Client } from 'pg';
import format from 'pg-format';
import { Repository } from '../domain/Repository';
import { RepositoryStore } from '../domain/RepositoryStore';

export class PgRepositoryStore implements RepositoryStore {
    private client: Client;

    constructor(connectionString: string) {
        this.client = new Client({ connectionString });
    }

    async connect(): Promise<void> {
        await this.client.connect();
    }

    async initializeSchema(): Promise<void> {
        console.log('Initializing DB Schema...');
        // Flexible schema: core attributes explicitly mapped, everything else in metadata JSONB
        // Using upsert (ON CONFLICT DO UPDATE) for idempotency and speed.
        await this.client.query(`
            CREATE TABLE IF NOT EXISTS repositories (
                id VARCHAR(255) PRIMARY KEY,
                name_with_owner VARCHAR(255) NOT NULL,
                stars INTEGER NOT NULL,
                metadata JSONB DEFAULT '{}'::jsonb,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Index on stars for fast sorting / analytics
            CREATE INDEX IF NOT EXISTS idx_repo_stars ON repositories (stars DESC);
        `);
    }

    async saveBatch(repositories: Repository[]): Promise<void> {
        if (repositories.length === 0) return;

        // Prepare data for pg-format
        const values = repositories.map(repo => [
            repo.id,
            repo.nameWithOwner,
            repo.stars,
            JSON.stringify(repo.metadata)
        ]);

        const query = format(`
            INSERT INTO repositories (id, name_with_owner, stars, metadata)
            VALUES %L
            ON CONFLICT (id) DO UPDATE SET
                name_with_owner = EXCLUDED.name_with_owner,
                stars = EXCLUDED.stars,
                metadata = repositories.metadata || EXCLUDED.metadata,
                updated_at = CURRENT_TIMESTAMP
        `, values);

        await this.client.query(query);
    }

    async close(): Promise<void> {
        await this.client.end();
    }
}
