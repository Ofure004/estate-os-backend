import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ResidencyType, StaffRole } from '../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const email = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class ResidentInvitationDto {
  @Transform(email) @IsEmail() @MaxLength(320) email!: string;
  @Transform(trim) @IsString() @IsNotEmpty() unitId!: string;
  @IsEnum(ResidencyType) residencyType!: ResidencyType;
}

export class StaffInvitationDto {
  @Transform(email) @IsEmail() @MaxLength(320) email!: string;
  @IsEnum(StaffRole) role!: StaffRole;
}

export class AcceptInvitationDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) firstName!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) lastName!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}
