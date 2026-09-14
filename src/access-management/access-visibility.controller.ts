import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Query,
  Req,
  ValidationPipe,
} from '@nestjs/common';
import { Authorize } from '../authorization/authorize.decorator.js';
import type { AuthorizedRequest } from '../authorization/authorization.types.js';
import { AccessVisibilityService } from './access-visibility.service.js';
import { AccessActivityQueryDto } from './dto/access-activity-query.dto.js';
@Controller('estates/:estateId/access')
@Authorize({
  scope: 'estate',
  roles: ['ESTATE_MANAGER', 'SECURITY_SUPERVISOR', 'GUARD'],
})
export class AccessVisibilityController {
  constructor(
    @Inject(AccessVisibilityService)
    private readonly visibility: AccessVisibilityService,
  ) {}
  @Get('onsite')
  @Header('Cache-Control', 'no-store')
  onsite(
    @Req() request: AuthorizedRequest,
    @Param('estateId') estateId: string,
  ) {
    return this.visibility.findOnsite({
      currentUserId: request.user.id,
      estateId,
    });
  }
  @Get('activity')
  @Header('Cache-Control', 'no-store')
  activity(
    @Req() request: AuthorizedRequest,
    @Param('estateId') estateId: string,
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: AccessActivityQueryDto,
      }),
    )
    query: AccessActivityQueryDto,
  ) {
    return this.visibility.findRecentActivity({
      currentUserId: request.user.id,
      estateId,
      query,
    });
  }
}
