import { defineComponent } from '@sxnnyside/circe';

export default defineComponent({
  prefix: 'btn:ping:',
  async execute(ctx) {
    const latency = Date.now() - ctx.interaction.createdTimestamp;
    await ctx.interaction.update({
      content: ctx.t('ping.reply', { latency }),
      components: [],
    });
  },
});
