// Telegram API base URL
const TELEGRAM_API = "https://api.telegram.org/bot"

export default {
  async fetch(request, env) {
    // Handle GET requests for health checks
    if (request.method === "GET") {
      return new Response("Telegram Bot is running!", {
        headers: { "Content-Type": "text/plain" },
      })
    }

    // Only process POST requests for Telegram updates
    if (request.method !== "POST") {
      return new Response("Please send a POST request", { status: 405 })
    }

    try {
      // Parse the incoming webhook from Telegram
      const update = await request.json()

      // Handle different types of updates
      if (update.message) {
        return await handleMessage(update.message, env)
      } else if (update.callback_query) {
        return await handleCallbackQuery(update.callback_query, env)
      }

      return new Response("Unsupported update type", { status: 200 })
    } catch (error) {
      console.error("Error processing request:", error)
      return new Response("Error processing request", { status: 500 })
    }
  },
}

/**
 * Handle incoming messages from Telegram
 */
async function handleMessage(message, env) {
  const chatId = message.chat.id
  const text = message.text || ""
  const firstName = message.from.first_name || "there"

  // Handle commands
  if (text.startsWith("/")) {
    return await handleCommand(text, chatId, firstName, env)
  }

  // Handle regular messages
  if (text) {
    // Show typing indicator
    await sendChatAction(chatId, "typing", env)

    // Prepare messages for the AI model
    const messages = [
      {
        role: "system",
        content:
          "You are a helpful and friendly assistant. Provide concise, accurate, and engaging responses. Format your responses using Markdown for better readability. Use bullet points, bold, and italic text where appropriate.",
      },
      { role: "user", content: text },
    ]

    try {
      // Get response from AI model
      const aiResponse = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages })

      // Send the AI response back to the user
      await sendMessage(chatId, aiResponse.response, env, {
        parse_mode: "Markdown",
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [
              { text: "❓ Ask another question", callback_data: "ask_again" },
              { text: "ℹ️ Help", callback_data: "help" },
            ],
          ],
        }),
      })
    } catch (error) {
      console.error("AI Error:", error)
      await sendMessage(chatId, "I'm having trouble thinking right now. Please try again in a moment.", env)
    }
  }

  return new Response("OK", { status: 200 })
}

/**
 * Handle commands like /start, /help
 */
async function handleCommand(text, chatId, firstName, env) {
  const command = text.split(" ")[0].toLowerCase()

  switch (command) {
    case "/start":
      const welcomeMessage = `
*Welcome, ${firstName}!* 👋

I'm your AI assistant powered by Llama 3.3, ready to help with information, answer questions, or just chat.

*How to use me:*
• Simply type your question or message
• I'll respond with the best answer I can provide
• Use /help to see available commands

What would you like to talk about today?
      `

      await sendMessage(chatId, welcomeMessage, env, {
        parse_mode: "Markdown",
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [
              { text: "🔍 Examples", callback_data: "examples" },
              { text: "ℹ️ About", callback_data: "about" },
            ],
          ],
        }),
      })
      break

    case "/help":
      const helpMessage = `
*Available Commands:*

• /start - Start or restart our conversation
• /help - Show this help message
• /about - Learn about how I work

You can also just type any question or message, and I'll respond!
      `

      await sendMessage(chatId, helpMessage, env, {
        parse_mode: "Markdown",
      })
      break

    case "/about":
      const aboutMessage = `
*About This Bot*

I'm powered by Cloudflare Workers and the Llama 3.3 70B AI model. I run completely in the cloud and can help answer questions on a wide range of topics.

*Technical Details:*
• Built with Cloudflare Workers
• Using Llama 3.3 70B model
• Responses formatted in Markdown
      `

      await sendMessage(chatId, aboutMessage, env, {
        parse_mode: "Markdown",
      })
      break

    default:
      await sendMessage(chatId, "I don't recognize that command. Type /help to see available commands.", env)
  }

  return new Response("OK", { status: 200 })
}

/**
 * Handle callback queries from inline keyboards
 */
async function handleCallbackQuery(callbackQuery, env) {
  const chatId = callbackQuery.message.chat.id
  const messageId = callbackQuery.message.message_id
  const data = callbackQuery.data

  // Answer the callback query to remove the loading state
  await fetch(`${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      callback_query_id: callbackQuery.id,
    }),
  })

  switch (data) {
    case "examples":
      const examplesMessage = `
*Here are some things you can ask me:*

• "Explain quantum computing in simple terms"
• "What are some healthy breakfast ideas?"
• "Help me draft an email to request time off"
• "What are the key features of JavaScript?"
• "Tell me a fun fact about space"

Just type your question and I'll do my best to help!
      `

      await sendMessage(chatId, examplesMessage, env, {
        parse_mode: "Markdown",
      })
      break

    case "about":
      const aboutMessage = `
*About This Bot*

I'm powered by Cloudflare Workers and the Llama 3.3 70B AI model. I run completely in the cloud and can help answer questions on a wide range of topics.

*Technical Details:*
• Built with Cloudflare Workers
• Using Llama 3.3 70B model
• Responses formatted in Markdown
      `

      await sendMessage(chatId, aboutMessage, env, {
        parse_mode: "Markdown",
      })
      break

    case "help":
      const helpMessage = `
*Available Commands:*

• /start - Start or restart our conversation
• /help - Show this help message
• /about - Learn about how I work

You can also just type any question or message, and I'll respond!
      `

      await sendMessage(chatId, helpMessage, env, {
        parse_mode: "Markdown",
      })
      break

    case "ask_again":
      await sendMessage(chatId, "What would you like to know? I'm ready for your next question!", env)
      break
  }

  return new Response("OK", { status: 200 })
}

/**
 * Send a message to a Telegram chat
 */
async function sendMessage(chatId, text, env, options = {}) {
  const url = `${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/sendMessage`

  // Split long messages if needed (Telegram has a 4096 character limit)
  const MAX_MESSAGE_LENGTH = 4000

  if (text.length <= MAX_MESSAGE_LENGTH) {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        ...options,
      }),
    })
  } else {
    // Split long messages
    let remainingText = text
    while (remainingText.length > 0) {
      const chunk = remainingText.substring(0, MAX_MESSAGE_LENGTH)
      remainingText = remainingText.substring(MAX_MESSAGE_LENGTH)

      // Only add reply markup to the last chunk
      const chunkOptions = remainingText.length === 0 ? options : { parse_mode: options.parse_mode }

      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          ...chunkOptions,
        }),
      })
    }
  }
}

/**
 * Send a chat action to indicate the bot is typing
 */
async function sendChatAction(chatId, action, env) {
  const url = `${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/sendChatAction`

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      action: action,
    }),
  })
}

