import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthSession, AuthSessionSchema } from './schemas/auth-session.schema';
import { EmailCode, EmailCodeSchema } from './schemas/email-code.schema';
import { EmailCodesService } from './email-codes.service';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: AuthSession.name, schema: AuthSessionSchema },
      { name: EmailCode.name, schema: EmailCodeSchema },
    ]),
    PassportModule,
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy, EmailCodesService],
  controllers: [AuthController],
})
export class AuthModule {}
