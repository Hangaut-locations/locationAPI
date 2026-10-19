import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './database/database.module';
import validationSchema from './config/validation';
import { UsersModule } from './modules/users/users.module';
import { PartiesModule } from './modules/parties/parties.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { PropertyModule } from './modules/property/property.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { MailModule } from './modules/mail/mail.module';
import { MediaModule } from './modules/media/media.module';
import { ChatModule } from './modules/chat/chat.module';
import { LiveModule } from './modules/live/live.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema,
    }),
    DatabaseModule,
    MailModule,
    AuthModule,
    UsersModule,
    PartiesModule,
    PropertyModule,
    FavoritesModule,
    BookingsModule,
    ReviewsModule,
    MediaModule,
    ChatModule,
    LiveModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  // constructor() {
  //   console.log('DATABASE_URL:', process.env.CLOUDINARY_URL);
  // }
}
