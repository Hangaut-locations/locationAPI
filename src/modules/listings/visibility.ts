export enum Visibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

/** Private listings stay off the home page and search, only people with the link can open them.
 * Older listings have no visibility saved, so anything not private counts as public. */
export const NOT_PRIVATE = { visibility: { $ne: Visibility.PRIVATE } };
