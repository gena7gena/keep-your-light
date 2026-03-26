import { gsap } from 'gsap'
import type { TextShaderOverlay } from './mantraShader'

export type MantraAnimationContext = {
  text: HTMLElement
  nextText: string
  shader?: TextShaderOverlay | null
}

export type MantraAnimation = (
  context: MantraAnimationContext,
) => gsap.core.Timeline

export type MantraAnimationSet = {
  fadeOut: MantraAnimation
  fadeIn: MantraAnimation
  pauseMs?: number
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })

const play = (timeline: gsap.core.Timeline) =>
  new Promise<void>((resolve) => {
    timeline.eventCallback('onComplete', () => resolve())
  })

export const fadeUpOut: MantraAnimation = ({ text }) =>
  gsap.timeline().to(text, {
    autoAlpha: 0,
    duration: 0.18,
    ease: 'power2.in',
  })

export const fadeInSoft: MantraAnimation = ({ text }) =>
  gsap.timeline().fromTo(
    text,
    {
      autoAlpha: 0,
    },
    {
      autoAlpha: 1,
      duration: 0.24,
      ease: 'power2.out',
    },
  )

export const defaultMantraAnimation: MantraAnimationSet = {
  fadeOut: fadeUpOut,
  fadeIn: fadeInSoft,
  pauseMs: 180,
}

export const animateMantraChange = async (
  context: MantraAnimationContext,
  animationSet: MantraAnimationSet,
) => {
  const shader = context.shader

  if (shader) {
    shader.syncText()
    await shader.animateOut()

    if (animationSet.pauseMs) {
      await wait(animationSet.pauseMs)
    }

    context.text.textContent = context.nextText
    shader.syncText()
    await shader.animateIn()

    return
  }

  await play(animationSet.fadeOut(context))

  if (animationSet.pauseMs) {
    await wait(animationSet.pauseMs)
  }

  context.text.textContent = context.nextText
  gsap.set(context.text, { clearProps: 'all' })

  await play(animationSet.fadeIn(context))

  gsap.set(context.text, { clearProps: 'all' })
}
