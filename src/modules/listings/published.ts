const PUBLISHED = 'published';

/** Newest published first. Listings published before published_at existed fall back to when they were created. */
export const NEWEST_FIRST = { published_at: -1, createdAt: -1 } as const;

/** Set only the first time a listing goes live, so editing it later doesn't move it back to the top. */
export const publishedAtFor = (
  nextStatus: string | undefined,
  currentStatus?: string,
): Date | undefined =>
  nextStatus === PUBLISHED && currentStatus !== PUBLISHED
    ? new Date()
    : undefined;

/** Older live listings get their created date as published_at. */
export const BACKFILL_PUBLISHED_AT = [{ $set: { published_at: '$createdAt' } }];
