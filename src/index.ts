import * as dotenv from 'dotenv';
import { GraphqlGithubClient } from './infrastructure/GraphqlGithubClient';
import { PgRepositoryStore } from './infrastructure/PgRepositoryStore';
import { CrawlStars } from './usecases/CrawlStars';

dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING || 'postgres://postgres:postgres@localhost:5432/github';

async function main() {
    if (!GITHUB_TOKEN) {
        console.error('Missing GITHUB_TOKEN environment variable. We need this to query the GraphQL API.');
        process.exit(1);
    }

    console.log('Starting GitHub Crawler Application...');

    const githubClient = new GraphqlGithubClient(GITHUB_TOKEN);
    const repositoryStore = new PgRepositoryStore(PG_CONNECTION_STRING);

    await repositoryStore.connect();

    const crawlStarsUseCase = new CrawlStars(githubClient, repositoryStore);

    // As per requirement, crawl 100,000 repositories
    const targetCount = 100000;

    console.time('CrawlStars duration');
    try {
        await crawlStarsUseCase.execute(targetCount);
    } catch (err) {
        console.error('Crawl failed:', err);
    } finally {
        console.timeEnd('CrawlStars duration');
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
