import { defineMiddleware } from '@sxnnyside/circe';

export default defineMiddleware({
  async before(ctx) {
    ctx.logger.debug(`[Routing] Executing ${ctx.kind} interaction`);
  },
  async after(ctx) {
    ctx.logger.debug(`[Routing] Completed ${ctx.kind} interaction successfully`);
  },
});
