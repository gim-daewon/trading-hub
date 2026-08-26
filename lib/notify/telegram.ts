export async function sendMessage(
  text: string,
  opts?: { parse_mode?: 'HTML' | 'Markdown'; disable_web_page_preview?: boolean }
): Promise<boolean> {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return false

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode:                opts?.parse_mode              ?? 'HTML',
        disable_web_page_preview:  opts?.disable_web_page_preview ?? true,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
