import { Controller, Get, Header, Inject, Param, Req } from '@nestjs/common';
import { Authorize } from '../authorization/authorize.decorator.js';
import type { AuthorizedRequest } from '../authorization/authorization.types.js';
import { AccessVisibilityService } from './access-visibility.service.js';

@Controller('estates/:estateId/gates')
@Authorize({ scope: 'estate', roles: ['ESTATE_MANAGER', 'SECURITY_SUPERVISOR', 'GUARD'] })
export class GatesController {
  constructor(@Inject(AccessVisibilityService) private readonly visibility: AccessVisibilityService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthorizedRequest, @Param('estateId') estateId: string) {
    return this.visibility.findGates(request.user.id, estateId);
  }
}
