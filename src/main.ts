import './style.css'
import mantrasByCategory from './mantras.json'
import {
  animateMantraChange,
  defaultMantraAnimation,
} from './mantraAnimations'

const mantraElement = document.querySelector<HTMLElement>('#mantra')
const mantraTextElement =
  mantraElement?.querySelector<HTMLElement>('.mantra__text') ?? null
const actionButtons = document.querySelectorAll<HTMLButtonElement>('[data-category]')

type MantraCategory = 'help' | 'perspective' | 'momentum' | 'done'

type MantrasByCategory = Record<MantraCategory, string[]>

const pickRandomMantra = (mantras: string[], currentText: string) => {
  const candidates = mantras.filter((mantra) => mantra !== currentText)

  if (candidates.length === 0) {
    return mantras[0] ?? currentText
  }

  return candidates[Math.floor(Math.random() * candidates.length)]
}

let isAnimating = false
let queuedText: string | null = null

const swapMantra = async (nextText: string) => {
  if (!mantraTextElement) {
    return
  }

  const currentText = mantraTextElement.textContent?.trim() ?? ''

  if (!nextText || nextText === currentText) {
    return
  }

  if (isAnimating) {
    queuedText = nextText
    return
  }

  isAnimating = true

  try {
    await animateMantraChange(
      {
        text: mantraTextElement,
        nextText,
      },
      defaultMantraAnimation,
    )
  } finally {
    isAnimating = false

    if (queuedText) {
      const pendingText = queuedText
      queuedText = null
      await swapMantra(pendingText)
    }
  }
}

if (mantraTextElement && actionButtons.length > 0) {
  actionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const category = button.dataset.category as MantraCategory | undefined

      if (!category) {
        return
      }

      const nextMantras = (mantrasByCategory as MantrasByCategory)[category]

      if (!nextMantras || nextMantras.length === 0) {
        return
      }

      const currentText = mantraTextElement.textContent?.trim() ?? ''
      const nextText = pickRandomMantra(nextMantras, currentText)

      void swapMantra(nextText)
    })
  })
}
