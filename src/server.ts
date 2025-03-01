import { InteractionResponseType, InteractionType } from 'discord-interactions';
import commands from './commands.json' with { type: "json" };
import {
  createMessage,
  verifyDiscordRequest
} from './discord_helpers.js';
import { DeferredChannelMessageResponse, Env } from './types.js';

export default {
  async fetch(request: Request, env: Env, ctx: unknown) {
    if (request.method === 'GET') {
      return new Response(`👋 ${env.DISCORD_APPLICATION_ID}`)
    }

    const { isValid, interaction } = await verifyDiscordRequest(request, env)

    if (!isValid || !interaction) {
      return new Response('Bad request signature.', { status: 401 })
    }

    if (interaction.type === InteractionType.PING) {
      return Response.json({ type: InteractionResponseType.PONG })
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const command = interaction.data.name.toLowerCase()

      switch (command) {
        case commands.CHAT_COMMAND.name: {
          // extract message from interaction
          const message = interaction.data.options.find(
            (opt) => opt.name === 'input'
          )?.value as string
          
          // create a new message
          await createMessage(`${message}...なのだ！`, {
            token: env.DISCORD_TOKEN,
            appId: env.DISCORD_APPLICATION_ID
          })

          const res: DeferredChannelMessageResponse = {
            type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
          }

          return Response.json(res)
        }
          
        default:
          return Response.json({ error: 'Unknown Type' }, { status: 400 })
      }
    }

    return Response.json({ error: 'Unknown Type' }, { status: 400 })
  }
}

