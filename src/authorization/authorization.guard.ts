import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from './authorization.service.js';
import type {
  AuthorizationPolicy,
  AuthorizedRequest,
} from './authorization.types.js';
export const AUTHORIZATION_POLICY = 'estate-os:authorization-policy';
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
  ) {}
  async canActivate(execution: ExecutionContext) {
    const request = execution.switchToHttp().getRequest<AuthorizedRequest>();
    if (!request.user?.id) throw new UnauthorizedException();
    const policy = this.reflector.getAllAndOverride<AuthorizationPolicy>(
      AUTHORIZATION_POLICY,
      [execution.getHandler(), execution.getClass()],
    );
    if (!policy) throw new ForbiddenException();
    const param = (name: string) => {
      const value = request.params[name];
      if (typeof value !== 'string' || !value.trim())
        throw new ForbiddenException();
      return value;
    };
    const scope =
      policy.scope === 'organization'
        ? {
            organizationId: param(policy.organizationParam ?? 'organizationId'),
          }
        : {
            estateId: param(policy.estateParam ?? 'estateId'),
            ...(policy.organizationParam ||
            request.params.organizationId !== undefined
              ? {
                  organizationId: param(
                    policy.organizationParam ?? 'organizationId',
                  ),
                }
              : {}),
          };
    const context = await this.authorization.authorize(
      request.user.id,
      scope,
      policy,
    );
    if (policy.resource)
      await this.authorization.assertResource(
        context,
        policy.resource.kind,
        param(policy.resource.param),
      );
    request.authorization = context;
    return true;
  }
}
