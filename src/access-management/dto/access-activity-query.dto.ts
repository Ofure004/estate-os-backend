import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
const integer = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
export class AccessActivityQueryDto {
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
  @IsIn(['CHECK_IN', 'CHECK_OUT'])
  type?: 'CHECK_IN' | 'CHECK_OUT';

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  gateId?: string;
}
