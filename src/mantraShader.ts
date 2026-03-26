import { gsap } from 'gsap'

export type TextShaderOverlay = {
  syncText: () => void
  animateOut: () => Promise<void>
  animateIn: () => Promise<void>
  destroy: () => void
}

type CreateTextShaderOverlayOptions = {
  host: HTMLElement
  text: HTMLElement
}

type ShaderState = {
  progress: number
  direction: number
  opacity: number
  time: number
}

const UNIFORM_FLOAT_COUNT = 8
const TEXT_FILL = '#ffffff'
const TEXT_VERTICAL_OFFSET = 2

const vertexShader = `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f(1.0, -1.0),
    vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0),
    vec2f(1.0, -1.0),
    vec2f(1.0, 1.0),
  );

  let position = positions[vertexIndex];
  var output: VertexOutput;
  output.position = vec4f(position, 0.0, 1.0);
  output.uv = position * 0.5 + vec2f(0.5, 0.5);
  return output;
}
`

const fragmentShader = `
struct Uniforms {
  resolution: vec2f,
  progress: f32,
  direction: f32,
  opacity: f32,
  time: f32,
  padding: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var textSampler: sampler;
@group(0) @binding(2) var textTexture: texture_2d<f32>;

fn hash21(point: vec2f) -> f32 {
  let seed = dot(point, vec2f(127.1, 311.7));
  return fract(sin(seed) * 43758.5453123);
}

fn noise2(point: vec2f) -> f32 {
  let cell = floor(point);
  let local = fract(point);
  let eased = local * local * (3.0 - 2.0 * local);

  let a = hash21(cell);
  let b = hash21(cell + vec2f(1.0, 0.0));
  let c = hash21(cell + vec2f(0.0, 1.0));
  let d = hash21(cell + vec2f(1.0, 1.0));

  return mix(mix(a, b, eased.x), mix(c, d, eased.x), eased.y);
}

@fragment
fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let flippedUv = vec2f(uv.x, 1.0 - uv.y);
  let progress = clamp(uniforms.progress, 0.0, 1.0);
  let direction = select(-1.0, 1.0, uniforms.direction >= 0.0);
  let time = uniforms.time * 0.001;

  let field = noise2(flippedUv * vec2f(12.0, 16.0) + vec2f(time * 0.75, -time * 0.35));
  let fieldFine = noise2(flippedUv * vec2f(28.0, 36.0) - vec2f(time * 1.6, time * 0.5));
  let dissolveNoise = mix(field, fieldFine, 0.35);

  let front = progress * 1.28 - flippedUv.x * 1.08 + (dissolveNoise - 0.5) * 0.32;
  let dissolveMask = smoothstep(0.0, 0.2, front);
  let edgeMask = (1.0 - smoothstep(0.0, 0.085, abs(front - 0.08))) * progress;

  let drift = vec2f(
    direction * progress * (0.018 + dissolveNoise * 0.05),
    (fieldFine - 0.5) * progress * 0.06
  );
  let ripple = vec2f(
    (noise2(flippedUv * vec2f(22.0, 18.0) + vec2f(time * 0.9, time * 0.4)) - 0.5) * 0.032,
    (noise2(flippedUv * vec2f(14.0, 26.0) - vec2f(time * 0.4, time * 0.9)) - 0.5) * 0.02
  ) * edgeMask;

  let sampleUv = clamp(flippedUv + drift + ripple, vec2f(0.0), vec2f(1.0));
  let trailUv = clamp(
    sampleUv - vec2f(direction * (0.012 + progress * 0.06), -0.014 * progress),
    vec2f(0.0),
    vec2f(1.0)
  );
  let fringeOffset = vec2f(0.01 + progress * 0.02, 0.0);

  let base = textureSample(textTexture, textSampler, sampleUv);
  let trail = textureSample(textTexture, textSampler, trailUv);
  let hot = textureSample(textTexture, textSampler, clamp(sampleUv + fringeOffset, vec2f(0.0), vec2f(1.0)));
  let cool = textureSample(textTexture, textSampler, clamp(sampleUv - fringeOffset, vec2f(0.0), vec2f(1.0)));

  let textPresence = base.a;
  let trailPresence = trail.a;
  let survivor = textPresence * (1.0 - dissolveMask);
  let halo = edgeMask * max(textPresence, trailPresence) * (0.5 + fieldFine * 0.95);

  let sparkGrid = floor(flippedUv * vec2f(84.0, 44.0));
  let sparkNoise = hash21(sparkGrid + vec2f(floor(time * 18.0), floor(time * 11.0)));
  let sparkMask = step(0.986, sparkNoise) * edgeMask * trailPresence;

  let sparkShape = smoothstep(0.75, 0.0, distance(fract(flippedUv * vec2f(84.0, 44.0)), vec2f(0.5)));
  let sparks = sparkMask * sparkShape * 1.35;

  let survivorTint = mix(vec3f(1.0, 0.98, 0.94), vec3f(1.0, 0.82, 0.58), progress * 0.3);
  let emberCore = vec3f(1.0, 0.94, 0.72) * halo * 0.8;
  let fireGlow = vec3f(1.0, 0.56, 0.16) * halo * 1.05;
  let coalGlow = vec3f(0.62, 0.1, 0.02) * halo * 0.6;
  let fireTrail =
    vec3f(hot.a * 1.1, base.a * 0.52, cool.a * 0.12) * edgeMask * vec3f(1.0, 0.72, 0.24);
  let sparkColor = vec3f(1.0, 0.86, 0.45) * sparks;

  let color = survivorTint * survivor + emberCore + fireGlow + coalGlow + fireTrail + sparkColor;
  let alpha = max(survivor, max(halo, sparks)) * uniforms.opacity;

  return vec4f(color, alpha);
}
`

const toNumber = (value: string, fallback: number) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const wrapText = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) => {
  const words = text.trim().split(/\s+/).filter(Boolean)

  if (words.length === 0) {
    return ['']
  }

  const lines: string[] = []
  let currentLine = words[0]

  for (let index = 1; index < words.length; index += 1) {
    const candidate = `${currentLine} ${words[index]}`

    if (context.measureText(candidate).width <= maxWidth) {
      currentLine = candidate
      continue
    }

    lines.push(currentLine)
    currentLine = words[index]
  }

  lines.push(currentLine)
  return lines
}

export const createTextShaderOverlay = async ({
  host,
  text,
}: CreateTextShaderOverlayOptions): Promise<TextShaderOverlay | null> => {
  if (!('gpu' in navigator)) {
    return null
  }

  const adapter = await navigator.gpu.requestAdapter()

  if (!adapter) {
    return null
  }

  const device = await adapter.requestDevice()
  const contextCanvas = document.createElement('canvas')
  const context = contextCanvas.getContext('webgpu')

  if (!context) {
    return null
  }

  contextCanvas.className = 'mantra__shader'
  contextCanvas.setAttribute('aria-hidden', 'true')
  host.classList.add('mantra--shader-active')
  host.append(contextCanvas)

  const sourceCanvas = document.createElement('canvas')
  const sourceContext = sourceCanvas.getContext('2d')

  if (!sourceContext) {
    contextCanvas.remove()
    return null
  }

  const format = navigator.gpu.getPreferredCanvasFormat()
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  })
  const uniformBuffer = device.createBuffer({
    size: UNIFORM_FLOAT_COUNT * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({ code: vertexShader }),
      entryPoint: 'main',
    },
    fragment: {
      module: device.createShaderModule({ code: fragmentShader }),
      entryPoint: 'main',
      targets: [{ format }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  })

  let sourceTexture: GPUTexture | null = null
  let bindGroup: GPUBindGroup | null = null
  let rafId = 0
  let isDestroyed = false
  let isContextConfigured = false
  let isAnimating = false
  const state: ShaderState = {
    progress: 0,
    direction: 1,
    opacity: 1,
    time: performance.now(),
  }

  const updateUniforms = () => {
    device.queue.writeBuffer(
      uniformBuffer,
      0,
      new Float32Array([
        contextCanvas.width || 1,
        contextCanvas.height || 1,
        state.progress,
        state.direction,
        state.opacity,
        state.time,
        0,
        0,
      ]),
    )
  }

  const drawFrame = () => {
    if (isDestroyed || !bindGroup || !isContextConfigured) {
      return
    }

    state.time = performance.now()
    updateUniforms()

    const encoder = device.createCommandEncoder()
    const view = context.getCurrentTexture().createView()
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    })

    renderPass.setPipeline(pipeline)
    renderPass.setBindGroup(0, bindGroup)
    renderPass.draw(6)
    renderPass.end()

    device.queue.submit([encoder.finish()])
  }

  const stopLoop = () => {
    if (rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }

  const startLoop = () => {
    if (rafId !== 0 || isDestroyed) {
      return
    }

    const tick = () => {
      drawFrame()

      if (isAnimating) {
        rafId = requestAnimationFrame(tick)
        return
      }

      rafId = 0
      drawFrame()
    }

    rafId = requestAnimationFrame(tick)
  }

  const configureCanvas = () => {
    const bounds = host.getBoundingClientRect()
    const width = Math.max(1, Math.round(bounds.width))
    const height = Math.max(1, Math.round(bounds.height))
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const pixelWidth = Math.max(1, Math.round(width * dpr))
    const pixelHeight = Math.max(1, Math.round(height * dpr))
    const sizeChanged =
      contextCanvas.width !== pixelWidth || contextCanvas.height !== pixelHeight

    if (sizeChanged) {
      contextCanvas.width = pixelWidth
      contextCanvas.height = pixelHeight
      sourceCanvas.width = pixelWidth
      sourceCanvas.height = pixelHeight
    }

    if (sizeChanged || !isContextConfigured) {
      context.configure({
        device,
        format,
        alphaMode: 'premultiplied',
      })
      isContextConfigured = true
    }
  }

  const syncText = () => {
    if (isDestroyed) {
      return
    }

    configureCanvas()

    const hostBounds = host.getBoundingClientRect()
    const textBounds = text.getBoundingClientRect()
    const styles = window.getComputedStyle(text)
    const dpr = contextCanvas.width / Math.max(hostBounds.width, 1)
    const fontSize = toNumber(styles.fontSize, 20)
    const lineHeight =
      styles.lineHeight === 'normal'
        ? fontSize * 1.45
        : toNumber(styles.lineHeight, fontSize * 1.45)
    const fontStyle = styles.fontStyle === 'normal' ? '' : `${styles.fontStyle} `
    const fontWeight = styles.fontWeight
    const fontFamily = styles.fontFamily
    const content = text.textContent?.trim() ?? ''
    const pixelWidth = sourceCanvas.width
    const pixelHeight = sourceCanvas.height
    const textWidth = Math.max(1, Math.min(textBounds.width, hostBounds.width))
    const centerX = (textBounds.left - hostBounds.left) + textWidth / 2
    const maxTextWidth = textWidth

    sourceContext.setTransform(1, 0, 0, 1, 0, 0)
    sourceContext.clearRect(0, 0, pixelWidth, pixelHeight)
    sourceContext.scale(dpr, dpr)
    sourceContext.textAlign = 'center'
    sourceContext.textBaseline = 'middle'
    sourceContext.fillStyle = TEXT_FILL
    sourceContext.font = `${fontStyle}${fontWeight} ${fontSize}px ${fontFamily}`
    sourceContext.fontKerning = 'normal'

    const lines = wrapText(sourceContext, content, maxTextWidth)
    const totalHeight = lines.length * lineHeight
    const firstLineY =
      hostBounds.height / 2 - totalHeight / 2 + lineHeight / 2 + TEXT_VERTICAL_OFFSET

    lines.forEach((line, index) => {
      sourceContext.fillText(line, centerX, firstLineY + index * lineHeight)
    })

    sourceTexture?.destroy()
    sourceTexture = device.createTexture({
      size: [pixelWidth, pixelHeight],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    })

    device.queue.copyExternalImageToTexture(
      { source: sourceCanvas },
      { texture: sourceTexture },
      [pixelWidth, pixelHeight],
    )

    bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: sourceTexture.createView() },
      ],
    })

    drawFrame()
  }

  const runTransition = (config: {
    from: Partial<ShaderState>
    to: Partial<ShaderState>
    duration: number
    ease: string
  }) =>
    new Promise<void>((resolve) => {
      gsap.killTweensOf(state)
      isAnimating = true
      Object.assign(state, config.from)
      startLoop()
      drawFrame()

      gsap.to(state, {
        ...config.to,
        duration: config.duration,
        ease: config.ease,
        onUpdate: drawFrame,
        onComplete: () => {
          isAnimating = false
          drawFrame()
          resolve()
        },
      })
    })

  const resizeObserver = new ResizeObserver(() => {
    syncText()
  })

  resizeObserver.observe(host)
  void document.fonts.ready.then(() => {
    syncText()
  })
  syncText()

  return {
    syncText,
    animateOut: () =>
      runTransition({
        from: {
          direction: 1,
          progress: 0,
          opacity: 1,
        },
        to: {
          progress: 1,
          opacity: 0.02,
        },
        duration: 0.62,
        ease: 'power2.inOut',
      }),
    animateIn: () =>
      runTransition({
        from: {
          direction: -1,
          progress: 1,
          opacity: 0.95,
        },
        to: {
          progress: 0,
          opacity: 1,
        },
        duration: 2.72,
        ease: 'power3.out',
      }),
    destroy: () => {
      isDestroyed = true
      stopLoop()
      resizeObserver.disconnect()
      gsap.killTweensOf(state)
      sourceTexture?.destroy()
      host.classList.remove('mantra--shader-active')
      contextCanvas.remove()
    },
  }
}
