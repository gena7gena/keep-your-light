import './style.css'

const mantraElement = document.querySelector<HTMLElement>('#mantra')
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

const loadMantras = async () => {
  const response = await fetch('/mantras.json')

  if (!response.ok) {
    throw new Error('Failed to load mantras')
  }

  return (await response.json()) as MantrasByCategory
}

if (mantraElement && actionButtons.length > 0) {
  loadMantras()
    .then((mantrasByCategory) => {
      actionButtons.forEach((button) => {
        button.addEventListener('click', () => {
          const category = button.dataset.category as MantraCategory | undefined

          if (!category) {
            return
          }

          const nextMantras = mantrasByCategory[category]

          if (!nextMantras || nextMantras.length === 0) {
            return
          }

          const currentText = mantraElement.textContent?.trim() ?? ''
          mantraElement.textContent = pickRandomMantra(nextMantras, currentText)
        })
      })
    })
    .catch(() => {})
}
