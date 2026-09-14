import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  ValidationPipe,
} from '@nestjs/common';
import { Authorize } from '../authorization/authorize.decorator.js';
import type { AuthorizedRequest } from '../authorization/authorization.types.js';
import { AccessVisitService } from './access-visit.service.js';
import { VerifyAccessDto } from './dto/verify-access.dto.js';
@Controller('estates/:estateId/gates/:gateId/access')
@Authorize({ scope: 'estate', roles: ['GUARD', 'SECURITY_SUPERVISOR'] })
export class AccessVisitController {
  constructor(
    @Inject(AccessVisitService)
    private readonly visits: AccessVisitService,
  ) {}
  @Post('check-in')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  checkIn(
    @Req() request: AuthorizedRequest,
    @Param('estateId') estateId: string,
    @Param('gateId') gateId: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: VerifyAccessDto,
      }),
    )
    dto: VerifyAccessDto,
  ) {
    return this.visits.checkIn({
      currentUserId: request.user.id,
      estateId,
      gateId,
      credential: dto.credential,
    });
  }
  @Post('check-out')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  checkOut(
    @Req() request: AuthorizedRequest,
    @Param('estateId') estateId: string,
    @Param('gateId') gateId: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: VerifyAccessDto,
      }),
    )
    dto: VerifyAccessDto,
  ) {
    return this.visits.checkOut({
      currentUserId: request.user.id,
      estateId,
      gateId,
      credential: dto.credential,
    });
  }
}
