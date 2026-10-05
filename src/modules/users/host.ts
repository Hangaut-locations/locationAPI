import { Model, Types } from 'mongoose';
import { User } from './schemas/user.schema';

// Only what guests may see about a host; never the password.
export const PUBLIC_HOST_FIELDS =
  'firstName lastName email phone city state country bio createdAt';

export interface PublicHost {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  city?: string;
  state?: string;
  country?: string;
  bio?: string;
  createdAt?: Date;
}

export const findPublicHost = (
  userModel: Model<User>,
  ownerId: Types.ObjectId,
): Promise<PublicHost | null> =>
  userModel
    .findById(ownerId)
    .select(PUBLIC_HOST_FIELDS)
    .lean<PublicHost>()
    .exec();
