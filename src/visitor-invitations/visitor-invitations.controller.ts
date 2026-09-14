import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  ValidationPipe,
} from '@nestjs/common';
import { Authorize } from '../authorization/authorize.decorator.js';
import type { AuthorizedRequest } from '../authorization/authorization.types.js';
import { CreateVisitorInvitationDto } from './dto/create-visitor-invitation.dto.js';
import { VisitorInvitationsService } from './visitor-invitations.service.js';

@Controller('estates/:estateId/visitor-invitations')
@Authorize({ scope: 'estate', roles: ['RESIDENT'] })
export class VisitorInvitationsController {
  constructor(
    @Inject(VisitorInvitationsService)
    private readonly invitations: VisitorInvitationsService,
  ) {}
  @Post()
  create(
    @Req() request: AuthorizedRequest,
    @Param('estateId') estateId: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: CreateVisitorInvitationDto,
      }),
    )
    dto: CreateVisitorInvitationDto,
  ) {
    return this.invitations.create(request.user.id, estateId, dto);
  }
  @Get()
  findMine(
    @Req() request: AuthorizedRequest,
    @Param('estateId') estateId: string,
  ) {
    return this.invitations.findMine(request.user.id, estateId);
  }
  @Get(':invitationId')
  findOneMine(
    @Req() request: AuthorizedRequest,
    @Param('estateId') estateId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitations.findOneMine(
      request.user.id,
      estateId,
      invitationId,
    );
  }
  @Patch(':invitationId/cancel')
  cancel(
    @Req() request: AuthorizedRequest,
    @Param('estateId') estateId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitations.cancel(request.user.id, estateId, invitationId);
  }
}
