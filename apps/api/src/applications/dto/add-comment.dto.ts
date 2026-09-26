import { IsString, Matches } from 'class-validator';

export class AddCommentDto {
  // Not @IsNotEmpty: "   " passes that, and a blank note is a 400, not a 422.
  @IsString()
  @Matches(/\S/, { message: 'body must not be blank' })
  body!: string;
}
