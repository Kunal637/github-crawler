import { GithubClient } from '../domain/GithubClient';
import { RepositoryStore } from '../domain/RepositoryStore';

export class CrawlStars {
    private client: GithubClient;
    private store: RepositoryStore;

    constructor(client: GithubClient, store: RepositoryStore) {
        this.client = client;
        this.store = store;
    }

    /**
     * Crawls exactly `targetCount` repositories.
     * Uses created date slicing to bypass the 1,000 node search limit.
     */
    async execute(targetCount: number = 100000): Promise<void> {
        await this.store.initializeSchema();

        let totalCrawled = 0;

        // Start from 2008-01-01 when GitHub basically started.
        let currentDate = new Date('2008-01-01');
        const endDate = new Date();

        // Increment by days depending on density. For early years, we could do large chunks (months).
        // For recent years, smaller chunks. We'll stick to a simple 30-day sliding window for simplicity,
        // reducing window size if a chunk hits > 1000 results.

        let chunkDays = 30; // Start with a safe 30 days window
        let maxConcurrency = 5;

        console.log(`Starting crawl to collect ${targetCount} repositories...`);

        while (totalCrawled < targetCount && currentDate < endDate) {
            let nextDate = new Date(currentDate);
            nextDate.setDate(nextDate.getDate() + chunkDays);

            if (nextDate > endDate) {
                nextDate = endDate;
            }

            const fromStr = currentDate.toISOString().split('T')[0];
            const toStr = nextDate.toISOString().split('T')[0];

            let cursor: string | null = null;
            let hasNextPage = true;
            let chunkCrawled = 0;

            console.log(`Crawling date range: ${fromStr} to ${toStr}... (Target: ${targetCount - totalCrawled} more)`);

            // Fetch concurrently up to 10 pages in the 1000 node limit (10 pages * 100 nodes)
            while (hasNextPage && totalCrawled < targetCount) {
                try {
                    // Try to fetch several pages in parallel by predicting cursors if possible, 
                    // but GraphQL cursor pagination doesn't allow offset parallelization easily.
                    // Instead we will just aggressively fetch sequentially but offload DB savings completely.
                    const limit = Math.min(100, targetCount - totalCrawled);
                    const result = await this.client.fetchRepositoriesByDateRange(fromStr, toStr, cursor || undefined, limit);

                    if (result.repositories.length > 0) {
                        this.store.saveBatch(result.repositories).catch(err => console.error(err));
                        totalCrawled += result.repositories.length;
                        chunkCrawled += result.repositories.length;

                        if (totalCrawled % 5000 === 0 || totalCrawled >= targetCount) {
                            console.log(`Saved ${result.repositories.length} repos. Total so far: ${totalCrawled}/${targetCount}`);
                        }
                    }

                    cursor = result.nextCursor;
                    hasNextPage = cursor !== null;

                    if (chunkCrawled >= 1000) {
                        console.log(`Hit 1,000 nodes limit for date partition ${fromStr} to ${toStr}. Shrinking window...`);
                        totalCrawled -= chunkCrawled;
                        break;
                    }

                } catch (error) {
                    console.error(`Error during crawl iteration: ${error}`);
                    break;
                }
            }

            // aggressive sizing based on density
            if (chunkCrawled >= 1000) {
                chunkDays = Math.max(1, Math.floor(chunkDays / 2));
            } else {
                // If we got under 1000, we successfully cleared the entire window!
                // We should scale the window up aggressively to minimize HTTP round trips 
                // returning < 100 items.
                if (chunkCrawled < 100) chunkDays = Math.min(365, chunkDays * 4);
                else if (chunkCrawled < 500) chunkDays = Math.min(100, chunkDays * 2);

                currentDate = nextDate;
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }

        console.log(`Crawl completed. Collected ${totalCrawled} repositories.`);
        await this.store.close();
    }
}
