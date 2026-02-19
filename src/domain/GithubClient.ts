import { Repository } from './Repository';

export interface GithubClient {
    /**
     * Fetches a batch of repositories up to the given count limit.
     * Respects rate limits internally.
     * @param limit - Max number of repositories to fetch in this call
     * @param cursor - Pagination cursor or search criteria state
     * @param minStars - For partitioning the search by star count / date
     */
    fetchRepositories(limit: number, cursor?: string): Promise<{
        repositories: Repository[];
        nextCursor: string | null;
        totalCount: number;
    }>;

    /**
     * Fetch repos across a specific date range to workaround 1000 node limit of GraphQL Search
     */
    fetchRepositoriesByDateRange(fromDate: string, toDate: string, cursor?: string, overrideLimit?: number): Promise<{
        repositories: Repository[];
        nextCursor: string | null;
        totalCount: number;
    }>;
}
