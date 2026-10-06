import { BadRequestException } from '@nestjs/common';
import { ValidateIf } from 'class-validator';

const DRAFT = 'draft';

const isFilled = (value: unknown) =>
  value !== undefined && value !== null && value !== '';

/**
 * Hosts can "Save & exit" half-way through the listing form, so a draft may
 * leave this field out. Anything a draft does send is still validated.
 */
export const RequiredUnlessDraft = () =>
  ValidateIf(
    (dto: { status?: string }, value: unknown) =>
      dto.status !== DRAFT || isFilled(value),
  );

/** Mongoose `required` that only applies once the listing is published. */
export function requiredUnlessDraft(this: { status?: string }) {
  return this.status !== DRAFT;
}

/** Stops a draft going live while fields guests rely on are still empty. */
export const assertPublishable = (
  listing: Record<string, unknown>,
  requiredFields: readonly string[],
) => {
  if (listing.status === DRAFT) return;
  const missing = requiredFields.filter((field) => !isFilled(listing[field]));
  if (missing.length === 0) return;
  throw new BadRequestException({
    message: 'Finish the listing before publishing',
    data: missing.map((field) => ({
      field,
      messages: [`${field} is required to publish`],
    })),
  });
};
