import { randomBytes } from 'crypto';

export enum Visibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

/** Private listings stay off the home page and search, only people with the link can open them.
 * Older listings have no visibility saved, so anything not private counts as public. */
export const NOT_PRIVATE = { visibility: { $ne: Visibility.PRIVATE } };

/** The secret part of a private link, e.g. /parties/<id>?key=<this>. */
export const newPrivateKey = (): string =>
  randomBytes(12).toString('base64url');

/** Listings made private before keys existed have none, so their host would have no link to share. */
export const MISSING_PRIVATE_KEY = {
  visibility: Visibility.PRIVATE,
  private_key: null,
};

/** Owners always get in, everyone else needs the key from the private link. */
export const canOpenListing = (
  listing: { visibility?: string; private_key?: string },
  isOwner: boolean,
  key?: string,
): boolean =>
  isOwner ||
  listing.visibility !== Visibility.PRIVATE ||
  (!!key && key === listing.private_key);
