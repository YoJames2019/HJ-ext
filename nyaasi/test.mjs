#!/usr/bin/env node
/**
 * Nyaa extension test suite.
 *
 *   NYAA_API_URL=https://nsapi.example.net \
 *   NYAA_API_KEY=yourkey \
 *   node test.mjs
 *
 * Flags (override env):
 *   --url <url>      --key <key>       --filter <name>
 *   --limit <n>      --only <substr>   --entry <path>   --parser <path>
 *
 * The extension is imported from the build output (default ../dist/nyaasiJV2.js).
 * Run `npm run build` first; the suite does not build anything itself.
 *
 * ---------------------------------------------------------------------------
 * ADDING A CASE: add an object to cases.json (next to this file).
 *
 *   name          label shown in the output
 *   id | search   AniList media id, OR a search string resolved to the top match
 *   episode       episode passed to the extension (omit/null for a movie, 'latest'
 *                 to use the currently-aired episode)
 *   expectEpisode parsed episode the TOP result must have (default: `episode`)
 *   expectSeason  parsed season the TOP result must have (optional)
 *   topLike       RegExp the TOP result title must match
 *   topNotLike    RegExp the TOP result title must NOT match
 *   forbid        RegExp, or array of them, that must NOT match ANY returned title
 *   expectEmpty   true if no results are expected
 *   titleLike     RegExp the resolved AniList title must match, tested against every
 *                 title variant (romaji / english / native) so it doesn't matter which
 *                 one you quote
 *   note          free text, ignored; use it to explain why the case exists
 *   skip          true to disable the case
 *
 * RegExp fields are JSON strings, e.g. "/part\\s*2/i".
 * Override the file with --cases <path>.
 * ---------------------------------------------------------------------------
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const arg = name => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : undefined }

const CONFIG = {
  apiUrl: arg('url') ?? process.env.NYAA_API_URL ?? '',
  apiKey: arg('key') ?? process.env.NYAA_API_KEY ?? '',
  filter: arg('filter') ?? 'Any',
  limit: Number(arg('limit') ?? 20),
  delay: Number(arg('delay') ?? 300),
  only: (arg('only') ?? '').toLowerCase(),
  entry: path.resolve(HERE, arg('entry') ?? '../dist/nyaasiJV2.js'),
  parser: path.resolve(HERE, arg('parser') ?? 'parsing.js'),
  cases: path.resolve(HERE, arg('cases') ?? 'cases.json'),
}

// ---------------------------------------------------------------------------
// CASES
// ---------------------------------------------------------------------------
// regexes live in cases.json as strings, e.g. "/part\\s*2/i"
const asRegExp = value => {
  if (typeof value !== 'string') return value
  const m = /^\/(.*)\/([a-z]*)$/.exec(value)
  return m ? new RegExp(m[1], m[2]) : new RegExp(value)
}
const REGEX_KEYS = ['titleLike', 'topLike', 'topNotLike', 'forbid']
const compileCase = c => {
  const out = { ...c }
  for (const key of REGEX_KEYS) {
    if (key in out) out[key] = Array.isArray(out[key]) ? out[key].map(asRegExp) : asRegExp(out[key])
  }
  return out
}

const CASES = JSON.parse(fs.readFileSync(CONFIG.cases, 'utf8')).map(compileCase)

// ---------------------------------------------------------------------------
// loading
// ---------------------------------------------------------------------------
async function loadExtension() {
  if (!fs.existsSync(CONFIG.entry)) {
    throw new Error(`built extension not found at ${CONFIG.entry}\n` +
      `run "npm run build" first, or pass --entry <path>`)
  }
  return {
    ext: (await import(pathToFileURL(CONFIG.entry).href)).default,
    Parser: (await import(pathToFileURL(CONFIG.parser).href)).default,
  }
}

// ---------------------------------------------------------------------------
// anilist
// ---------------------------------------------------------------------------
async function anilist(c) {
  const fields = `id format episodes nextAiringEpisode { episode } title { romaji english native } synonyms`
  const q = c.id
    ? `{ Media(id: ${c.id}, type: ANIME) { ${fields} } }`
    : `{ Media(search: ${JSON.stringify(c.search)}, type: ANIME, sort: [SEARCH_MATCH]) { ${fields} } }`
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
    })
    if (res.status === 429) { await sleep(1200 * (attempt + 1)); continue }
    const json = await res.json()
    return json.data?.Media ?? null
  }
  return null
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------
const asArray = v => v == null ? [] : Array.isArray(v) ? v : [v]
const pad = (s, n) => String(s).padEnd(n).slice(0, n)
const titleOf = m => m?.title?.english || m?.title?.romaji || String(m?.id ?? '')
const titlesOf = m => [m?.title?.romaji, m?.title?.english, m?.title?.native].filter(Boolean)
// hayase sends episodeCount as the total (or latest-aired) episode count
const airedCount = m => m?.episodes ?? (m?.nextAiringEpisode?.episode ? m.nextAiringEpisode.episode - 1 : 1)

async function run() {
  if (!CONFIG.apiUrl) { console.error('missing --url / NYAA_API_URL'); process.exit(2) }
  if (!CONFIG.apiKey) console.warn('warning: no --key / NYAA_API_KEY, the API will likely 401\n')

  const { ext, Parser } = await loadExtension()
  const options = { apiUrl: CONFIG.apiUrl, apiKey: CONFIG.apiKey, filter: CONFIG.filter, resultsLimit: CONFIG.limit }

  const cases = CASES.filter(c => !c.skip && (!CONFIG.only || c.name.toLowerCase().includes(CONFIG.only)))
  let pass = 0, fail = 0, skipped = 0

  console.log(`${pad('result', 6)} ${pad('case', 30)} ${pad('show / episode', 34)} ${pad('acc hi/avg/lo', 24)} detail`)
  console.log('-'.repeat(110))

  for (const c of cases) {
    const media = await anilist(c)
    if (!media) { fail++; console.log(`${pad('FAIL', 6)} ${pad(c.name, 30)} ${pad('-', 34)} could not resolve on AniList`); continue }
    if (c.titleLike && !titlesOf(media).some(t => c.titleLike.test(t))) {
      fail++; console.log(`${pad('FAIL', 6)} ${pad(c.name, 30)} ${pad(titleOf(media), 34)} resolved the wrong show`); continue
    }

    const episode = c.episode === 'latest' ? airedCount(media) : (c.episode ?? null)
    let out
    try {
      out = await ext.single({ media, episode, episodeCount: airedCount(media), exclusions: [] }, options)
    } catch (err) {
      fail++; console.log(`${pad('FAIL', 6)} ${pad(c.name, 30)} ${pad(titleOf(media), 34)} threw: ${err.message}`); continue
    }

    const scores = out.map(o => Number(o.accScore)).filter(Number.isFinite)
    const acc = scores.length
      ? `hi ${Math.max(...scores).toFixed(2)} avg ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)} lo ${Math.min(...scores).toFixed(2)}`
      : 'hi - avg - lo -'

    const problems = []
    const top = out[0]
    const parsed = top ? Parser.parseEpisodeSeason(top.title) : null
    const wantEpisode = 'expectEpisode' in c ? c.expectEpisode : episode

    if (c.expectEmpty) {
      if (out.length) problems.push(`expected none, got ${out.length}`)
    } else if (!out.length) {
      problems.push('no results')
    } else {
      if (parsed.episode !== wantEpisode) problems.push(`top episode ${parsed.episode}, wanted ${wantEpisode}`)
      if ('expectSeason' in c && parsed.season !== c.expectSeason) problems.push(`top season ${parsed.season}, wanted ${c.expectSeason}`)
      if (c.topLike && !c.topLike.test(top.title)) problems.push(`top title does not match ${c.topLike}`)
      if (c.topNotLike && c.topNotLike.test(top.title)) problems.push(`top title matches ${c.topNotLike}`)
      for (const re of asArray(c.forbid)) {
        const hit = out.find(o => re.test(o.title))
        if (hit) { problems.push(`forbidden ${re} matched "${hit.title.slice(0, 40)}"`); break }
      }
    }

    if (problems.length) {
      fail++
      console.log(`${pad('FAIL', 6)} ${pad(c.name, 30)} ${pad(titleOf(media) + ' ep' + (episode ?? '-'), 34)} ${pad(acc, 24)} ${problems.join('; ')}`)
      if (top) console.log(`${' '.repeat(6)}     top: ${top.title.slice(0, 92)}`)
    } else {
      pass++
      console.log(`${pad('ok', 6)} ${pad(c.name, 30)} ${pad(titleOf(media) + ' ep' + (episode ?? '-'), 34)} ${pad(acc, 24)} ${out.length} results  ${top ? top.title.slice(0, 44) : '(none)'}`)
    }

    await sleep(CONFIG.delay)
  }

  console.log('-'.repeat(110))
  console.log(`${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''}  (${cases.length} cases)`)
  process.exit(fail ? 1 : 0)
}

run().catch(err => { console.error(err); process.exit(2) })
