import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';
import { PartiesService } from './parties.service';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@ApiTags('parties')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('parties')
export class PartiesController {
  constructor(private partiesService: PartiesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a party for the authenticated user' })
  create(
    @Req() request: AuthenticatedRequest,
    @Body() createPartyDto: CreatePartyDto,
  ) {
    return this.partiesService.create(request.user._id, createPartyDto);
  }

  @Get('all')
  @ApiOperation({ summary: 'List all parties' })
  findAll() {
    return this.partiesService.findAll();
  }

  @Get('mine')
  @ApiOperation({ summary: 'List parties created by the authenticated user' })
  findMine(@Req() request: AuthenticatedRequest) {
    return this.partiesService.findByOwner(request.user._id);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List all party categories' })
  findAllCategories() {
    return this.partiesService.findAllCategories();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a party created by the authenticated user' })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') partyId: string,
    @Body() updatePartyDto: UpdatePartyDto,
  ) {
    const party = await this.partiesService.update(
      partyId,
      request.user._id,
      updatePartyDto,
    );
    if (!party) {
      throw new NotFoundException('Party not found');
    }

    return party;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a party created by the authenticated user' })
  async delete(
    @Req() request: AuthenticatedRequest,
    @Param('id') partyId: string,
  ) {
    const party = await this.partiesService.delete(partyId, request.user._id);
    if (!party) {
      throw new NotFoundException('Party not found');
    }
  }
}
