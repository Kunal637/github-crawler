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

        let chunkDays = 6; // Start with 6 days window to minimize 1000-node search limit bumps

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

            while (hasNextPage && totalCrawled < targetCount) {
                try {
                    const limit = Math.min(100, targetCount - totalCrawled);
                    const result = await this.client.fetchRepositoriesByDateRange(fromStr, toStr, cursor || undefined, limit);

                    if (result.repositories.length > 0) {
                        // Don't await the save here to not block the network loop immediately
                        this.store.saveBatch(result.repositories).catch(err => console.error(err));
                        totalCrawled += result.repositories.length;
                        chunkCrawled += result.repositories.length;

                        // Only log every 10k to prevent spam
                        if (totalCrawled % 10000 === 0 || totalCrawled >= targetCount) {
                            console.log(`Saved ${result.repositories.length} repos. Total so far: ${totalCrawled}/${targetCount}`);
                        }
                    }

                    cursor = result.nextCursor;
                    hasNextPage = cursor !== null;

                    // The max nodes we can get is 1000 per search query. Break out if we exhaust the page.
                    if (chunkCrawled >= 1000) {
                        console.log(`Hit 1,000 nodes limit for date partition ${fromStr} to ${toStr}. Shrinking window...`);

                        // Rollback what we counted for this chunk, since we're going to shrink the window and re-crawl this start date
                        totalCrawled -= chunkCrawled;

                        // We will slice the date window next.
                        break;
                    }

                } catch (error) {
                    console.error(`Error during crawl iteration: ${error}`);
                    // Simply retry logic or break loop depending on error severity handled in client
                    break;
                }
            }

            // Adjust window size for next iteration based on density
            if (chunkCrawled >= 1000) {
                chunkDays = Math.max(1, Math.floor(chunkDays / 2)); // Shrink window
            } else if (chunkCrawled < 500) {
                chunkDays = Math.min(60, chunkDays + 2); // Grow window slowly
                currentDate = nextDate; // Move forward fully
                currentDate.setDate(currentDate.getDate() + 1); // Avoid overlap boundary
            } else {
                currentDate = nextDate;
                currentDate.setDate(currentDate.getDate() + 1); // Avoid overlap boundary
            }
        }

        console.log(`Crawl completed. Collected ${totalCrawled} repositories.`);
        await this.store.close();
    }
}
