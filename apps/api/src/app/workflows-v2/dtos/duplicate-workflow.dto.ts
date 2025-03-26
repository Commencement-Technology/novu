import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class DuplicateWorkflowDto {
  @ApiProperty({
    description: 'Name of the workflow',
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Tags associated with the workflow',
    type: [String],
  })
  @IsArray()
  @IsOptional()
  tags?: string[];

  @ApiProperty({
    description: 'Description of the workflow',
  })
  @IsString()
  description: string;
}
