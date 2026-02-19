import { Repository } from './Repository';

export interface RepositoryStore {
    /**
     * Saves or updates a batch of repositories in the data store.
     * @param repositories List of repositories to save
     */
    saveBatch(repositories: Repository[]): Promise<void>;

    /**
     * Initial schema setup
     */
    initializeSchema(): Promise<void>;

    /**
     * Close connection
     */
    close(): Promise<void>;
}
