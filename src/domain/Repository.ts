import { RepositoryId, RepositoryMetadata } from './types';

/**
 * Clean Architecture Immutable Entity for a GitHub Repository.
 */
export class Repository {
    public readonly id: RepositoryId;
    public readonly nameWithOwner: string;
    public readonly stars: number;
    public readonly metadata: RepositoryMetadata;

    constructor(
        id: RepositoryId,
        nameWithOwner: string,
        stars: number,
        metadata: RepositoryMetadata = {}
    ) {
        this.id = id;
        this.nameWithOwner = nameWithOwner;
        this.stars = stars;
        this.metadata = metadata;
    }

    /**
     * Creates a new instance with updated properties (Immutability).
     */
    public copyWith(overrides: Partial<{ id: RepositoryId, nameWithOwner: string, stars: number, metadata: RepositoryMetadata }>): Repository {
        return new Repository(
            overrides.id ?? this.id,
            overrides.nameWithOwner ?? this.nameWithOwner,
            overrides.stars ?? this.stars,
            overrides.metadata ?? this.metadata
        );
    }
}
