import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MailService } from './mail.service';

@ApiTags('mail')
@Controller('mail')
export class MailController {
  constructor(private mailService: MailService) {}

  @Get('status')
  @ApiOperation({
    summary:
      'Whether booking emails can go out: key set, Resend accepts it, sender domain verified. Never shows the key',
  })
  status() {
    return this.mailService.status();
  }
}
