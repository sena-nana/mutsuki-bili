const { expandMessageContentForLinks } = await import('../src/link-message-content.ts')

const tests = []

function test(name, fn) {
  tests.push({ name, fn })
}

function match(value, pattern) {
  if (!pattern.test(value)) {
    throw new Error(`Expected ${JSON.stringify(value)} to match ${pattern}`)
  }
}

test('extracts Bilibili URLs from forwarded JSON link cards', () => {
  const content = '[CQ:json,data={"app":"com.tencent.structmsg","meta":{"news":{"jumpUrl":"https:\\/\\/www.bilibili.com\\/video\\/BV1xx411c7mD?share_source=qq"}}}]'

  const expanded = expandMessageContentForLinks(content)

  match(expanded, /https:\/\/www\.bilibili\.com\/video\/BV1xx411c7mD/)
})

test('extracts Bilibili mini program URLs from nested card fields', () => {
  const content = '<json data="{&quot;app&quot;:&quot;com.tencent.miniapp_01&quot;,&quot;meta&quot;:{&quot;detail_1&quot;:{&quot;qqdocurl&quot;:&quot;https:\\/\\/b23.tv\\/AbCdEf&quot;}}}"/>'

  const expanded = expandMessageContentForLinks(content)

  match(expanded, /https:\/\/b23\.tv\/AbCdEf/)
})

test('derives video links from Bilibili mini program page paths', () => {
  const content = '[CQ:json,data={"meta":{"detail_1":{"pagepath":"pages/video/video?avid=12345&bvid=BV1xx411c7mD"}}}]'

  const expanded = expandMessageContentForLinks(content)

  match(expanded, /BV1xx411c7mD/)
  match(expanded, /https:\/\/www\.bilibili\.com\/video\/av12345/)
})

test('derives dynamic and live links from Bilibili mini program page paths', () => {
  const content = '[CQ:json,data={"meta":{"detail_1":{"pagepath":"pages/opus/detail?id=987654321&room_id=24680"}}}]'

  const expanded = expandMessageContentForLinks(content)

  match(expanded, /https:\/\/t\.bilibili\.com\/987654321/)
  match(expanded, /https:\/\/live\.bilibili\.com\/24680/)
})

test('derives Mihuashi links from mini program page paths', () => {
  const content = '[CQ:json,data={"app":"com.tencent.miniapp","meta":{"detail_1":{"title":"米画师分享","pagepath":"pages/stalls/detail?id=13579&profile_id=24680"}}}]'

  const expanded = expandMessageContentForLinks(content)

  match(expanded, /https:\/\/www\.mihuashi\.com\/stalls\/13579/)
  match(expanded, /https:\/\/www\.mihuashi\.com\/profiles\/24680/)
})

let failed = 0
for (const { name, fn } of tests) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    failed += 1
    console.error(`not ok - ${name}`)
    console.error(error)
  }
}

if (failed) process.exitCode = 1
