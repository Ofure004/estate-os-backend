import { Controller, Get, Header, Inject, Param, Req } from '@nestjs/common';
import { Authorize } from '../authorization/authorize.decorator.js';
import type { AuthorizedRequest } from '../authorization/authorization.types.js';
import { AccessPassService } from './access-passes.service.js';
@Controller('estates/:estateId/visitor-invitations/:invitationId/pass')
@Authorize({ scope: 'estate', roles: ['RESIDENT'] })
export class AccessPassController {
  constructor(
    @Inject(AccessPassService) private readonly passes: AccessPassService,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  findForResident(
    @Req() request: AuthorizedRequest,
    @Param('estateId') estateId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.passes.findForResident(request.user.id, estateId, invitationId);
  }
}
