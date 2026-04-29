const MAX_FRAGMENTS = 80
const MAX_FRAGMENT_LENGTH = 20_000

const JSON_LINK_KEYS = [
  'jumpUrl',
  'jump_url',
  'qqdocurl',
  'url',
  'webUrl',
  'web_url',
  'shareUrl',
  'share_url',
  'targetUrl',
  'target_url',
  'contentJumpUrl',
  'content_jump_url',
  'originUrl',
  'origin_url',
  'schema',
  'pagepath',
  'pagePath',
  'path',
]

const JSON_LINK_KEY_PATTERN = JSON_LINK_KEYS
  .map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

const BV_PATTERN = 'BV[1-9A-HJ-NP-Za-km-z]{10}'

/** Expand card / mini-program payloads into plain text that existing resolvers can match. */
export function expandMessageContentForLinks(content: string): string {
  const fragments: string[] = []
  const seen = new Set<string>()
  const queue: string[] = [content]

  const add = (text: string) => {
    const value = text.trim()
    if (!value || value.length > MAX_FRAGMENT_LENGTH || seen.has(value)) return
    seen.add(value)
    fragments.push(value)
    if (fragments.length < MAX_FRAGMENTS) queue.push(value)
  }

  while (queue.length && fragments.length < MAX_FRAGMENTS) {
    const current = queue.shift()!

    for (const variant of decodeVariants(current)) {
      add(variant)
      for (const candidate of extractStructuredCandidates(variant)) add(candidate)
      for (const link of deriveBiliLinks(variant)) add(link)
      for (const link of deriveMihuashiLinks(variant)) add(link)
    }
  }

  return fragments.join('\n')
}

function decodeVariants(input: string): string[] {
  const variants: string[] = []
  let current = input

  for (let i = 0; i < 5; i++) {
    if (!variants.includes(current)) variants.push(current)

    const next = decodePercentEncoded(
      decodeJsonEscapes(
        decodeHtmlEntities(current),
      ),
    )

    if (next === current) break
    current = next
  }

  return variants
}

function extractStructuredCandidates(text: string): string[] {
  const candidates: string[] = []

  const quotedKeyValue = new RegExp(
    `["'](?:${JSON_LINK_KEY_PATTERN})["']\\s*:\\s*["']((?:\\\\.|[^"'\\\\])*)["']`,
    'gi',
  )
  for (const match of text.matchAll(quotedKeyValue)) candidates.push(match[1])

  const xmlAttr = /\b(?:data|url|href|jumpUrl|qqdocurl|pagepath|pagePath|path)=["']([^"']+)["']/gi
  for (const match of text.matchAll(xmlAttr)) candidates.push(match[1])

  const queryValue = /\b(?:url|jumpUrl|qqdocurl|pagepath|pagePath|path)=([^&\s"'<>]+)/gi
  for (const match of text.matchAll(queryValue)) candidates.push(match[1])

  return candidates
}

function deriveBiliLinks(text: string): string[] {
  const links: string[] = []
  const canDeriveFromParams = hasBiliShareContext(text)

  for (const bvid of collectParamValues(text, ['bvid', 'BVId'])) {
    if (new RegExp(`^${BV_PATTERN}$`).test(bvid)) {
      links.push(`https://www.bilibili.com/video/${bvid}`)
    }
  }

  if (canDeriveFromParams) {
    for (const avid of collectParamValues(text, ['avid', 'aid', 'av'])) {
      if (/^\d+$/.test(avid)) links.push(`https://www.bilibili.com/video/av${avid}`)
    }

    for (const dynamicId of collectParamValues(text, ['dynamic_id', 'dynamicId', 'dyn_id', 'opus_id'])) {
      if (/^\d+$/.test(dynamicId)) links.push(`https://t.bilibili.com/${dynamicId}`)
    }

    if (/(?:opus|dynamic|moment)/i.test(text)) {
      for (const id of collectParamValues(text, ['id'])) {
        if (/^\d+$/.test(id)) links.push(`https://t.bilibili.com/${id}`)
      }
    }

    for (const roomId of collectParamValues(text, ['room_id', 'roomid', 'roomId', 'live_room_id'])) {
      if (/^\d+$/.test(roomId)) links.push(`https://live.bilibili.com/${roomId}`)
    }

    if (/(?:space|profile|user)/i.test(text)) {
      for (const uid of collectParamValues(text, ['uid', 'mid'])) {
        if (/^\d+$/.test(uid)) links.push(`https://space.bilibili.com/${uid}`)
      }
    }
  }

  for (const match of text.matchAll(new RegExp(`bilibili://video/(${BV_PATTERN}|\\d+)`, 'gi'))) {
    const id = match[1]
    links.push(
      /^\d+$/.test(id)
        ? `https://www.bilibili.com/video/av${id}`
        : `https://www.bilibili.com/video/${id}`,
    )
  }

  for (const match of text.matchAll(/bilibili:\/\/(?:following|dynamic)\/(?:detail\/)?(\d+)/gi)) {
    links.push(`https://t.bilibili.com/${match[1]}`)
  }

  for (const match of text.matchAll(/bilibili:\/\/(?:live|live_room)\/(\d+)/gi)) {
    links.push(`https://live.bilibili.com/${match[1]}`)
  }

  for (const match of text.matchAll(/bilibili:\/\/space\/(\d+)/gi)) {
    links.push(`https://space.bilibili.com/${match[1]}`)
  }

  return [...new Set(links)]
}

function deriveMihuashiLinks(text: string): string[] {
  const links: string[] = []
  if (!hasMihuashiShareContext(text)) return links

  for (const match of text.matchAll(/(?:^|[/?#&])profiles?(?:\/(?:detail\/?)?)?(?:[?#&/]|id=|profile_id=|user_id=)(\d+)/gi)) {
    links.push(`https://www.mihuashi.com/profiles/${match[1]}`)
  }

  for (const profileId of collectParamValues(text, ['profile_id', 'profileId', 'user_id', 'userId', 'artist_id', 'artistId'])) {
    if (/^\d+$/.test(profileId)) links.push(`https://www.mihuashi.com/profiles/${profileId}`)
  }

  for (const match of text.matchAll(/(?:^|[/?#&])stalls?(?:\/(?:detail\/?)?)?(?:[?#&/]|id=|stall_id=)(\d+)/gi)) {
    links.push(`https://www.mihuashi.com/stalls/${match[1]}`)
  }

  for (const stallId of collectParamValues(text, ['stall_id', 'stallId'])) {
    if (/^\d+$/.test(stallId)) links.push(`https://www.mihuashi.com/stalls/${stallId}`)
  }

  if (/(?:stalls?|橱窗)/i.test(text)) {
    for (const id of collectParamValues(text, ['id'])) {
      if (/^\d+$/.test(id)) links.push(`https://www.mihuashi.com/stalls/${id}`)
    }
  } else if (/(?:profiles?|画师|主页|用户)/i.test(text)) {
    for (const id of collectParamValues(text, ['id'])) {
      if (/^\d+$/.test(id)) links.push(`https://www.mihuashi.com/profiles/${id}`)
    }
  }

  return [...new Set(links)]
}

function hasBiliShareContext(text: string): boolean {
  return /(?:bilibili|b23\.tv|bili|哔哩|miniapp|qqdocurl|jumpUrl|pagepath|pagePath|pages\/(?:video|opus|dynamic|live|space|user)|bilibili:\/\/)/i.test(text)
}

function hasMihuashiShareContext(text: string): boolean {
  return /(?:mihuashi|米画师|mihua|pagepath|pagePath|miniapp|pages\/(?:stalls?|profiles?|artist|user))/i.test(text)
}

function collectParamValues(text: string, keys: string[]): string[] {
  const values: string[] = []
  const escapedKeys = keys.map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const re = new RegExp(`(?:[?&#]|\\b)(${escapedKeys})=([^&#\\s"'<>\\\\]+)`, 'gi')

  for (const match of text.matchAll(re)) {
    values.push(stripTrailingPunctuation(match[2]))
  }

  return values
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#44;/g, ',')
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function decodeJsonEscapes(input: string): string {
  return input
    .replace(/\\u([0-9a-f]{4})/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

function decodePercentEncoded(input: string): string {
  if (!/%[0-9a-f]{2}/i.test(input)) return input

  try {
    return decodeURIComponent(input)
  } catch {
    try {
      return decodeURI(input)
    } catch {
      return input
    }
  }
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[),.;\]}]+$/g, '')
}
