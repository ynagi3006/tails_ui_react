/** Open the floating assistant with a prefilled message (used from report/metric pages). */
export function openChatWithPrompt(prompt: string) {
  window.dispatchEvent(new CustomEvent('tails:chat-prompt', { detail: { prompt } }))
}
