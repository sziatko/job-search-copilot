import { TagService } from '@job-search-copilot/core';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ApiKeyGuard, CurrentUserId } from '../auth/api-key.guard';
import { ParseIdPipe } from '../common/row-id';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

/** A user's tags (ADR-0042). A session or an API key (ADR-0039). Putting them on vacancies
 * is `POST /vacancies/tags`. */
@Controller('tags')
@AllowAnonymous()
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class TagsController {
  constructor(private readonly tags: TagService) {}

  /** Every tag, by name, with its `vacancyCount`. */
  @Get()
  list(@CurrentUserId() userId: string) {
    return this.tags.list(userId);
  }

  /** A name taken in any spelling → 409; a blank or too long one → 422. */
  @Post()
  create(@CurrentUserId() userId: string, @Body() dto: CreateTagDto) {
    return this.tags.create(userId, dto);
  }

  /** As `POST`, and an unknown id → 404. */
  @Patch(':id')
  update(
    @CurrentUserId() userId: string,
    @Param('id', new ParseIdPipe()) id: number,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tags.update(userId, id, dto);
  }

  /** Takes the tag off its vacancies too. An unknown id → 404. */
  @Delete(':id')
  @HttpCode(204)
  delete(@CurrentUserId() userId: string, @Param('id', new ParseIdPipe()) id: number) {
    return this.tags.delete(userId, id);
  }
}
