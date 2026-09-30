import { ref, onUnmounted } from 'vue'

export interface TypewriterOptions {
  baseSpeed?: number
  commaDelay?: number
  periodDelay?: number
  paragraphDelay?: number
}

export function useTypewriter(options: TypewriterOptions = {}) {
  const {
    baseSpeed = 35,
    commaDelay = 80,
    periodDelay = 160,
    paragraphDelay = 300
  } = options

  const displayedText = ref('')
  const isTyping = ref(false)
  const isCompleted = ref(false)
  let timer: number | null = null

  function start(fullText: string, onComplete?: () => void) {
    stop()
    displayedText.value = ''
    isTyping.value = true
    isCompleted.value = false

    if (!fullText) {
      isTyping.value = false
      isCompleted.value = true
      return
    }

    let index = 0

    function typeChar() {
      if (index < fullText.length) {
        displayedText.value = fullText.slice(0, index + 1)
        const char = fullText[index]
        index++

        let delay = baseSpeed
        if (char === '，' || char === '、') {
          delay = commaDelay
        } else if (char === '。' || char === '；' || char === '！' || char === '？') {
          delay = periodDelay
        } else if (char === '\n') {
          delay = paragraphDelay
        }

        timer = window.setTimeout(typeChar, delay)
      } else {
        isTyping.value = false
        isCompleted.value = true
        if (onComplete) onComplete()
      }
    }

    typeChar()
  }

  function skip(fullText: string) {
    stop()
    displayedText.value = fullText
    isTyping.value = false
    isCompleted.value = true
  }

  function stop() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  onUnmounted(() => {
    stop()
  })

  return {
    displayedText,
    isTyping,
    isCompleted,
    start,
    skip,
    stop
  }
}
