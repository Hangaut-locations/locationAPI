import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger'

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

   const config = new DocumentBuilder()
    .setTitle('Hangaut API')
    .setDescription(`Hangaut works like Airbnb but it's for finding and booking hang out spots only. Fully open source`)
    .setVersion('1.0')
    .addBearerAuth()
    .build();


   const documentFactory = () =>
    SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, documentFactory, {
    jsonDocumentUrl: 'api/docs/json',
    yamlDocumentUrl: 'api/docs/yaml',
  });

  await app.listen(process.env.PORT ?? 3400);
}
bootstrap();