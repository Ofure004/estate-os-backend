import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Authorize } from '../authorization/authorize.decorator.js';
import type { AuthorizedRequest } from '../authorization/authorization.types.js';
import {
  AcceptInvitationDto,
  ResidentInvitationDto,
  StaffInvitationDto,
} from './onboarding.dto.js';
import { OnboardingService } from './onboarding.service.js';
import {
  OptionalJwtGuard,
  type OptionalAuthenticatedRequest,
} from './optional-jwt.guard.js';

const invitePolicy = {
  scope: 'estate' as const,
  roles: ['ESTATE_MANAGER', 'ORG_ADMIN', 'ORG_OWNER'] as const,
};
const staffPolicy = {
  scope: 'estate' as const,
  roles: [
    'ESTATE_MANAGER',
    'SECURITY_SUPERVISOR',
    'ORG_ADMIN',
    'ORG_OWNER',
  ] as const,
};
const pipe = (expectedType: new () => object) =>
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    expectedType,
  });

@Controller('estates/:estateId/onboarding')
export class EstateOnboardingController {
  constructor(
    @Inject(OnboardingService) private readonly onboarding: OnboardingService,
  ) {}

  @Post('resident-invitations')
  @Header('Cache-Control', 'no-store')
  @Authorize(invitePolicy)
  createResident(
    @Req() request: AuthorizedRequest,
    @Body(pipe(ResidentInvitationDto)) dto: ResidentInvitationDto,
  ) {
    return this.onboarding.createResident(request.authorization, dto);
  }

  @Post('staff-invitations')
  @Header('Cache-Control', 'no-store')
  @Authorize(staffPolicy)
  createStaff(
    @Req() request: AuthorizedRequest,
    @Body(pipe(StaffInvitationDto)) dto: StaffInvitationDto,
  ) {
    return this.onboarding.createStaff(request.authorization, dto);
  }

  @Get('invitations')
  @Header('Cache-Control', 'no-store')
  @Authorize(invitePolicy)
  list(@Req() request: AuthorizedRequest) {
    return this.onboarding.list(request.authorization);
  }

  @Post('invitations/:invitationId/revoke')
  @Header('Cache-Control', 'no-store')
  @Authorize(staffPolicy)
  revoke(
    @Req() request: AuthorizedRequest,
    @Param('invitationId') invitationId: string,
  ) {
    return this.onboarding.revoke(request.authorization, invitationId);
  }
}

@Controller('onboarding/invitations')
export class InvitationAcceptanceController {
  constructor(
    @Inject(OnboardingService) private readonly onboarding: OnboardingService,
  ) {}

  @Get(':token')
  @Header('Cache-Control', 'no-store')
  lookup(@Param('token') token: string) {
    return this.onboarding.lookup(token);
  }

  @Post(':token/accept')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalJwtGuard)
  accept(
    @Param('token') token: string,
    @Req() request: OptionalAuthenticatedRequest,
    @Body() body: unknown,
  ) {
    if (
      body !== undefined &&
      (!body || typeof body !== 'object' || Array.isArray(body))
    )
      throw new BadRequestException();
    const fields = Object.keys(body ?? {});
    let details: AcceptInvitationDto | undefined;
    if (fields.length) {
      details = plainToInstance(AcceptInvitationDto, body);
      const errors = validateSync(details, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      if (errors.length) throw new BadRequestException(errors);
    }
    return this.onboarding.accept(token, request.user?.id, details);
  }
}
