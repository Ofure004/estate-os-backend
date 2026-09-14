import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class CreateVisitorInvitationDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  visitorFirstName!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  visitorLastName!: string;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  visitorPhone?: string;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  purpose?: string;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  hostResidencyId?: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/, {
    message: 'validFrom must be an ISO timestamp with a timezone',
  })
  validFrom!: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/, {
    message: 'validUntil must be an ISO timestamp with a timezone',
  })
  validUntil!: string;
}
