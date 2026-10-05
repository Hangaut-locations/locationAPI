import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Like AuthGuard('jwt'), but lets guests through with `request.user` unset. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(_error: unknown, user: TUser): TUser | undefined {
    return user || undefined;
  }
}
