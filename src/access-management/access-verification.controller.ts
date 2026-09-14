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
import { AccessVerificationService } from './access-verification.service.js';
import { VerifyAccessDto } from './dto/verify-access.dto.js';
@Controller('estates/:estateId/gates/:gateId/access')
@Authorize({ scope: 'estate', roles: ['GUARD', 'SECURITY_SUPERVISOR'] })
export class AccessVerificationController {
  constructor(
    @Inject(AccessVerificationService)
    private readonly verification: AccessVerificationService,
  ) {}
  @Post('verify')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  verify(
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
    return this.verification.verify({
      currentUserId: request.user.id,
      estateId,
      gateId,
      credential: dto.credential,
    });
  }
}
