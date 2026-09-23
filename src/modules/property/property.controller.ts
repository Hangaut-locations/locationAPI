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
import { CreatePropertyDto } from './dto/create-property.dto';
import { updatePropertyDto } from './dto/update-property.dto';
import { PropertyService } from './property.service';
import { PropertyType, StatusType } from './schemas/property.schema';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@ApiTags('property')
@ApiBearerAuth()
@Controller('property')
export class PropertyController {
  constructor(private PropertyService: PropertyService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseGuards(AuthGuard('jwt'))
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        start_date: { type: 'date' },
        end_date: { type: 'date' },
        location: { type: 'string' },
        images: { type: 'array', items: { type: 'string', format: 'binary' } },
        charge_type: { type: 'string', enum: ['person', 'hour'] },
        property_rules: { type: 'string' },
        price: { type: 'number' },
        status: { enum: Object.values(StatusType), default: 'draft' },
        property_type: { enum: Object.values(PropertyType) },
        guest_capacity: { type: 'integer' },
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
  @ApiOperation({ summary: 'Create a property for the authenticated user' })
  create(
    @Req() request: AuthenticatedRequest,
    @Body() CreatePropertyDto: CreatePropertyDto,
    @UploadedFiles() images: Express.Multer.File[],
  ) {
    return this.PropertyService.create(
      request.user._id,
      CreatePropertyDto,
      images,
    );
  }

  @Get('all')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'List all property' })
  findAll(@Req() request: AuthenticatedRequest) {
    return this.PropertyService.findAll(request.user._id);
  }

  @Get('grouped-by-location')
  @ApiOperation({ summary: 'List all property grouped by location' })
  async findAllGroupedByLocation() {
    const data = await this.PropertyService.findAllGroupedByLocation();

    return {
      success: true,
      statusCode: 200,
      data,
      message: data.length
        ? 'Property grouped by location retrieved successfully'
        : 'No property found',
    };
  }

  @Get('grouped-by-location-user')
  @ApiOperation({ summary: 'List all property grouped by location' })
  async findAllGroupedByLocationUser(@Req() request: AuthenticatedRequest) {
    const data = await this.PropertyService.findAllGroupedByLocation(
      request?.user?._id,
    );

    return {
      success: true,
      statusCode: 200,
      data,
      message: data.length
        ? 'Property grouped by location retrieved successfully'
        : 'No property found',
    };
  }

  @Get('mine')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'List property created by the authenticated user' })
  findMine(@Req() request: AuthenticatedRequest) {
    return this.PropertyService.findByOwner(request.user._id);
  }

  @Get('categories')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'List all property categories' })
  findAllCategories() {
    return this.PropertyService.findAllCategories();
  }

  @Get(':id')
  // @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get property by id' })
  async findById(@Param('id') propertyId: string) {
    const data = await this.PropertyService.findById(propertyId);
    return {
      success: true,
      statusCode: data ? 200 : 404,
      data,
      message: data ? 'Property retrieved successfully' : 'No property found',
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
  @ApiOperation({
    summary: 'Update a property created by the authenticated user',
  })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') propertyId: string,
    @Body() updatePropertyDto: updatePropertyDto,
    @UploadedFiles() images: Express.Multer.File[],
  ) {
    const property = await this.PropertyService.update(
      propertyId,
      request.user._id,
      updatePropertyDto,
      images,
    );
    if (!property) {
      throw new NotFoundException('Property not found');
    }

    return property;
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a property created by the authenticated user',
  })
  async delete(
    @Req() request: AuthenticatedRequest,
    @Param('id') propertyId: string,
  ) {
    const property = await this.PropertyService.delete(
      propertyId,
      request.user._id,
    );
    if (!property) {
      throw new NotFoundException('Property not found');
    }
  }
}
