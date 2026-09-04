import {
  Body,
  BadRequestException,
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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { memoryStorage } from 'multer';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';
import { PartiesService } from './parties.service';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@ApiTags('parties')
@ApiBearerAuth()
@Controller('parties')
export class PartiesController {
  constructor(private partiesService: PartiesService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseGuards(AuthGuard('jwt'))
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        start_date: { type: 'date' },
        end_date: { type: 'date' },
        title: { type: 'string' },
        description: { type: 'string' },
        location: { type: 'string' },
        images: { type: 'array', items: { type: 'string', format: 'binary' } },
        guest_capacity: { type: 'integer' },
        charge_type: { type: 'string', enum: ['person', 'hour'] },
        party_rules: { type: 'string' },
        is_ticket_sales: { type: 'boolean' },
        price: { type: 'number' },
        beds: { type: 'number', example: 0 },
        bathrooms: { type: 'number', example: 0 },
        category: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      storage: memoryStorage(),
      fileFilter: (_request, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          callback(
            new BadRequestException('Only image files are allowed'),
            false,
          );

          return;
        }
        callback(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Create a party for the authenticated user' })
  create(
    @Req() request: AuthenticatedRequest,
    @Body() createPartyDto: CreatePartyDto,
    @UploadedFiles() images: Express.Multer.File[],
  ) {
    return this.partiesService.create(request.user._id, createPartyDto, images);
  }

  @Get('all')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'List all parties' })
  findAll() {
    return this.partiesService.findAll();
  }

  @Get('grouped-by-location')
  @ApiOperation({ summary: 'List all parties grouped by location' })
  async findAllGroupedByLocation() {
    const data = await this.partiesService.findAllGroupedByLocation();

    return {
      success: true,
      statusCode: 200,
      data,
      message: data.length
        ? 'Parties grouped by location retrieved successfully'
        : 'No parties found',
    };
  }

  @Get('mine')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'List parties created by the authenticated user' })
  findMine(@Req() request: AuthenticatedRequest) {
    return this.partiesService.findByOwner(request.user._id);
  }

  @Get('categories')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'List all party categories' })
  findAllCategories() {
    return this.partiesService.findAllCategories();
  }

  @Get(':id')
  // @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get party by id' })
  async findById(@Param('id') partyId: string) {
    const data = await this.partiesService.findById(partyId);
    return {
      success: true,
      statusCode: data ? 200 : 404,
      data,
      message: data ? 'Party retrieved successfully' : 'No party found',
    };
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      storage: memoryStorage(),
      fileFilter: (_request, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          callback(
            new BadRequestException('Only image files are allowed'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Update a party created by the authenticated user' })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') partyId: string,
    @Body() updatePartyDto: UpdatePartyDto,
    @UploadedFiles() images: Express.Multer.File[],
  ) {
    const party = await this.partiesService.update(
      partyId,
      request.user._id,
      updatePartyDto,
      images,
    );
    if (!party) {
      throw new NotFoundException('Party not found');
    }

    return party;
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
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
