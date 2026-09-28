import { Transform } from 'class-transformer';
import { IsIn, IsInt, Max, Min, ValidateIf } from 'class-validator';

const integer = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

export class StaffVisitorsQueryDto {
  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  page = 1;

  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['expected', 'onsite', 'departed'])
  status?: 'expected' | 'onsite' | 'departed';
}
