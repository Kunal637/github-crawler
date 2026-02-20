import { GithubClient } from '../domain/GithubClient';
import { Repository } from '../domain/Repository';

export class GraphqlGithubClient implements GithubClient {
    private token: string;
    private endpoint = 'https://api.github.com/graphql';

    constructor(token: string) {
        this.token = token;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async executeQuery(query: string, variables: any, retries = 3): Promise<any> {
        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'node-fetch-crawler'
                },
                body: JSON.stringify({ query, variables })
            });

            if (response.status === 403 || response.status === 429) {
                // Rate limit
                const resetTime = response.headers.get('x-ratelimit-reset');
                if (resetTime) {
                    const waitTime = (parseInt(resetTime) * 1000) - Date.now() + 1000;
                    console.warn(`[GitHub] Rate limit hit. Waiting ${waitTime}ms...`);
                    await this.sleep(waitTime > 0 ? waitTime : 5000);
                    return this.executeQuery(query, variables, retries);
                }
            }

            if (!response.ok) {
                if (retries > 0) {
                    console.warn(`[GitHub] Error ${response.status}. Retrying in 1s...`);
                    await this.sleep(1000);
                    return this.executeQuery(query, variables, retries - 1);
                }
                throw new Error(`GitHub API Error: ${response.statusText} - ${await response.text()}`);
            }

            const json = await response.json() as any;
            if (json.errors) {
                if (retries > 0 && json.errors.some((e: any) => e.type === 'RATE_LIMITED' || e.message.includes('timeout'))) {
                    console.warn(`[GitHub] GraphQL Error (Rate Limited/Timeout). Retrying in 1s...`);
                    await this.sleep(1000);
                    return this.executeQuery(query, variables, retries - 1);
                }
                throw new Error(`GraphQL Error: ${JSON.stringify(json.errors)}`);
            }

            return json.data;
        } catch (error) {
            if (retries > 0) {
                console.warn(`[GitHub] Network Error: ${error}. Retrying in 1s...`);
                await this.sleep(1000);
                return this.executeQuery(query, variables, retries - 1);
            }
            throw error;
        }
    }

    async fetchRepositories(limit: number, cursor?: string): Promise<{ repositories: Repository[]; nextCursor: string | null; totalCount: number; }> {
        // Fallback method, not primarily used as search limits to 1000 nodes total.
        return this.fetchRepositoriesByDateRange('2008-01-01', new Date().toISOString().split('T')[0], cursor, limit);
    }

    async fetchRepositoriesByDateRange(fromDate: string, toDate: string, cursor?: string, overrideLimit = 100): Promise<{ repositories: Repository[]; nextCursor: string | null; totalCount: number; }> {
        const query = `
            query SearchRepos($queryStr: String!, $first: Int!, $after: String) {
                search(query: $queryStr, type: REPOSITORY, first: $first, after: $after) {
                    repositoryCount
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                    nodes {
                        ... on Repository {
                            id
                            nameWithOwner
                            stargazerCount
                            createdAt
                            updatedAt
                        }
                    }
                }
            }
        `;

        // We use created date span to walk the entire GitHub set in partitions.
        const queryStr = `stars:>0 created:${fromDate}..${toDate} sort:stars-desc`;

        const data = await this.executeQuery(query, {
            queryStr,
            first: overrideLimit,
            after: cursor || null
        });

        const searchData = data.search;
        const repos = searchData.nodes.map((node: any) => new Repository(
            node.id,
            node.nameWithOwner,
            node.stargazerCount,
            { createdAt: node.createdAt, updatedAt: node.updatedAt }
        ));

        return {
            repositories: repos,
            nextCursor: searchData.pageInfo.hasNextPage ? searchData.pageInfo.endCursor : null,
            totalCount: searchData.repositoryCount
        };
    }
}
