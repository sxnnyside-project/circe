import { createPaginator } from '@sxnnyside/circe';
import { EmbedBuilder } from 'discord.js';

export const leaderboardPaginator = createPaginator({
  id: 'leaderboard-pager',
  invokerOnly: true,
  pageSelect: true,
});

export function generateSamplePages() {
  return [
    {
      embeds: [
        new EmbedBuilder()
          .setTitle('Leaderboard - Page 1')
          .setDescription('1. Alice - 1,200 XP\n2. Bob - 1,150 XP\n3. Charlie - 980 XP')
          .setColor(0x5865f2),
      ],
    },
    {
      embeds: [
        new EmbedBuilder()
          .setTitle('Leaderboard - Page 2')
          .setDescription('4. David - 850 XP\n5. Eve - 720 XP\n6. Frank - 610 XP')
          .setColor(0x5865f2),
      ],
    },
  ];
}

export default leaderboardPaginator.component;
