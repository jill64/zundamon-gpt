/**
 * The core server that runs on a Cloudflare worker.
 */

import {
  InteractionResponseType,
  InteractionType,
  verifyKey
} from 'discord-interactions'
import { AutoRouter } from 'itty-router'
import { env } from 'node:process'
import OpenAI from 'openai'
import { CHAT_COMMAND } from './commands.js'

const ZUNDAMON_SYSTEM_PROMPT = `
- あなたはVOICEROIDのずんだもんです。かわいい少女のずんだもんになりきって答えてください
- ただし、質問の意図を重視して、必要以上にずんだもんである設定に拘らないでください
- 詳細な情報を求められない限り、質問には簡潔に答えてください。
`

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY
})

class JsonResponse extends Response {
  constructor(body: object, init?: ResponseInit) {
    const jsonBody = JSON.stringify(body)
    init = init || {
      headers: {
        'content-type': 'application/json;charset=UTF-8'
      }
    }
    super(jsonBody, init)
  }
}

const router = AutoRouter()

/**
 * A simple :wave: hello page to verify the worker is working.
 */
router.get('/', (_, env) => {
  return new Response(`👋 ${env.DISCORD_APPLICATION_ID}`)
})

/**
 * Main route for all requests sent from Discord.  All incoming messages will
 * include a JSON payload described here:
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 */
router.post('/', async (request, env, ctx) => {
  const { isValid, interaction } = await server.verifyDiscordRequest(
    request,
    env
  )
  if (!isValid || !interaction) {
    return new Response('Bad request signature.', { status: 401 })
  }

  if (interaction.type === InteractionType.PING) {
    // The `PING` message is used during the initial webhook handshake, and is
    // required to configure the webhook in the developer portal.
    return new JsonResponse({
      type: InteractionResponseType.PONG
    })
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    // Most user commands will come as `APPLICATION_COMMAND`.
    switch (interaction.data.name.toLowerCase()) {
      case CHAT_COMMAND.name.toLowerCase(): {
        const message = interaction.data.options[0].value as string

        ctx.waitUntil(
          handleDeferredInteractionStreamly(
            ZUNDAMON_SYSTEM_PROMPT,
            message,
            interaction.token,
            env
          )
        )

        return new JsonResponse({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        })
      }
      default:
        return new JsonResponse({ error: 'Unknown Type' }, { status: 400 })
    }
  }

  return new JsonResponse({ error: 'Unknown Type' }, { status: 400 })
})

router.all('*', () => new Response('Not Found.', { status: 404 }))

interface Env {
  DISCORD_PUBLIC_KEY: string
  DISCORD_APPLICATION_ID: string
}

async function handleDeferredInteractionStreamly(
  system: string,
  message: string,
  token: string,
  env: Env
) {
  const endpoint = `https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${token}`

  const {
    choices: [{ message: res }]
  } = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: system
      },
      {
        role: 'user',
        content: message
      }
    ],
    model: 'gpt-4.5-preview'
  })

  await fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({
      content: res.content
    }),
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

async function verifyDiscordRequest(request: Request, env: Env) {
  const signature = request.headers.get('x-signature-ed25519')
  const timestamp = request.headers.get('x-signature-timestamp')
  const body = await request.text()
  const isValidRequest =
    signature &&
    timestamp &&
    (await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY))
  if (!isValidRequest) {
    return { isValid: false }
  }

  return { interaction: JSON.parse(body), isValid: true }
}

const server = {
  verifyDiscordRequest,
  fetch: router.fetch
}

export default server
