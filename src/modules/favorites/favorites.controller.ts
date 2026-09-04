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
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { UpdateFavoriteDto } from './dto/update-favorite.dto';
import { FavoritesService } from './favorites.service';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@ApiTags('favorites')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('favorites')
export class FavoritesController {
  constructor(private favoritesService: FavoritesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a favorite for the authenticated user' })
  create(
    @Req() request: AuthenticatedRequest,
    @Body() createFavoriteDto: CreateFavoriteDto,
  ) {
    return this.favoritesService.create(request.user._id, createFavoriteDto);
  }

  @Get()
  @ApiOperation({ summary: 'List favorites for the authenticated user' })
  findAll(@Req() request: AuthenticatedRequest) {
    return this.favoritesService.findAll(request.user._id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a favorite by id' })
  async findById(
    @Req() request: AuthenticatedRequest,
    @Param('id') favoriteId: string,
  ) {
    const favorite = await this.favoritesService.findById(
      request.user._id,
      favoriteId,
    );
    if (!favorite) {
      throw new NotFoundException('Favorite not found');
    }

    return favorite;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a favorite' })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') favoriteId: string,
    @Body() updateFavoriteDto: UpdateFavoriteDto,
  ) {
    const favorite = await this.favoritesService.update(
      request.user._id,
      favoriteId,
      updateFavoriteDto,
    );
    if (!favorite) {
      throw new NotFoundException('Favorite not found');
    }

    return favorite;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a favorite' })
  async delete(
    @Req() request: AuthenticatedRequest,
    @Param('id') favoriteId: string,
  ) {
    const favorite = await this.favoritesService.delete(
      request.user._id,
      favoriteId,
    );
    if (!favorite) {
      throw new NotFoundException('Favorite not found');
    }
  }
}
