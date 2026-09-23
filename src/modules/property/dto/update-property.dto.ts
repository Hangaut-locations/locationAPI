import { PartialType } from '@nestjs/swagger';
import { CreatePropertyDto } from './create-property.dto';

export class updatePropertyDto extends PartialType(CreatePropertyDto) {}
