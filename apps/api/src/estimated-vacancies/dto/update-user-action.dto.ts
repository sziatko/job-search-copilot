import { UserAction } from '@job-search-copilot/core';
import { IsEnum } from 'class-validator';

export class UpdateUserActionDto {
  @IsEnum(UserAction)
  userAction!: UserAction;
}
