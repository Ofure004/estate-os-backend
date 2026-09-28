import {
  Body,
  Controller,
  Get,
  Header,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}
  @Post('login')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  login(
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: LoginDto,
      }),
    )
    dto: LoginDto,
  ) {
    return this.auth.login(dto.email, dto.password);
  }
  @Post('refresh')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: RefreshTokenDto,
      }),
    )
    dto: RefreshTokenDto,
  ) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: RefreshTokenDto,
      }),
    )
    dto: RefreshTokenDto,
  ) {
    await this.auth.logout(dto.refreshToken);
  }
  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard)
  async me(@Req() request: AuthenticatedRequest) {
    const context = await this.users.findContextById(request.user.id);
    if (!context) throw new UnauthorizedException();
    return context;
  }
}
