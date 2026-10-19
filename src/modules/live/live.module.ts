import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PartiesModule } from '../parties/parties.module';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';
import {
  LiveComment,
  LiveCommentSchema,
  LiveLove,
  LiveLoveSchema,
  LiveSession,
  LiveSessionSchema,
  LiveSignal,
  LiveSignalSchema,
  LiveViewer,
  LiveViewerSchema,
} from './schemas/live.schema';

@Module({
  imports: [
    PartiesModule,
    MongooseModule.forFeature([
      { name: LiveSession.name, schema: LiveSessionSchema },
      { name: LiveViewer.name, schema: LiveViewerSchema },
      { name: LiveSignal.name, schema: LiveSignalSchema },
      { name: LiveComment.name, schema: LiveCommentSchema },
      { name: LiveLove.name, schema: LiveLoveSchema },
    ]),
  ],
  controllers: [LiveController],
  providers: [LiveService],
})
export class LiveModule {}
