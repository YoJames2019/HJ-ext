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
 * The extension is imported from ./index.js. If that fails because the source uses
 * extensionless relative imports, it's bundled on the fly with esbuild.
 *
 * ---------------------------------------------------------------------------
 * ADDING A CASE: append to CASES below.
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
 *   skip          true to disable the case
 * ---------------------------------------------------------------------------
 */

import fs from 'node:fs'
import os from 'node:os'
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
  entry: path.resolve(HERE, arg('entry') ?? 'index.js'),
  parser: path.resolve(HERE, arg('parser') ?? 'parsing.js'),
}

// ---------------------------------------------------------------------------
// CASES
// ---------------------------------------------------------------------------
const CASES = [
  // currently airing
  { name: 'One Piece ep latest',          search: 'One Piece', episode: 'latest', titleLike: /one piece/i },
  { name: 'Bleach TYBW ep 6',             search: 'Bleach Thousand-Year Blood War', episode: 6, titleLike: /bleach/i },
  { name: 'Apothecary Diaries ep 4',      search: 'Kusuriya no Hitorigoto', episode: 4, titleLike: /kusuriya|apothecary/i },

  // recently finished
  { name: 'Frieren ep 12',                id: 154587, episode: 12 },
  { name: 'Mushoku Tensei S2 ep 3',       search: 'Mushoku Tensei II', episode: 3, titleLike: /mushoku/i },
  { name: 'Dungeon Meshi ep 10',          search: 'Dungeon Meshi', episode: 10, titleLike: /dungeon meshi/i },

  // sequels and parts (the season/part logic)
  { name: 'Slime S2 Part 2 ep 2',         id: 116742, episode: 2, topLike: /part\s*2/i, forbid: /\bS0?2E0?2\b/i },
  { name: 'Spy x Family S1 ep 1',         id: 140960, episode: 1, forbid: /cour\s*2|part\s*2/i },
  { name: 'Spy x Family Cour 2 ep 1',     id: 142838, episode: 1, forbid: /\bS0?1E\d{1,3}\b/i },
  { name: 'Overlord IV ep 1',             search: 'Overlord IV', episode: 1, titleLike: /overlord/i },
  { name: 'Steins;Gate ep 24',            id: 9253, episode: 24 },
  // Clevatess S2 releases never spell the subtitle, only "Clevatess II"
  { name: 'Clevatess S2 ep 1',            id: 198946, episode: 1 },
  // Mahou Yome OVA: season 1 batches (" - 01 ~ 24") must not read as episode 1
  { name: 'Mahou Yome OVA ep 1',          id: 130713, episode: 1, topLike: /nishi no shounen/i, forbid: /\d{1,4}\s*[~-]\s*\d{1,4}/ },
  // Cyberpunk Edgerunners 2 is not out; must not fall back to season 1
  { name: 'Cyberpunk Edgerunners 2 ep 1', id: 195539, episode: 1, expectEmpty: true },

  // old
  { name: 'Cowboy Bebop ep 5',            id: 1, episode: 5 },
  { name: 'Death Note ep 1',              search: 'Death Note', episode: 1, titleLike: /death note/i },
  { name: 'Fullmetal Alchemist BH ep 34', search: 'Fullmetal Alchemist: Brotherhood', episode: 34, titleLike: /fullmetal/i },

  // movies (no episode; the top result should parse to none)
  { name: 'Your Name (movie)',            id: 21519, episode: 1, expectEpisode: null, forbid: /\bS\d{1,2}E\d{1,3}\b/i },
  { name: 'Slime movie (Tears)',          id: 182206, episode: 1, expectEpisode: null, forbid: /2nd season\s*-\s*\d|\bS\d{1,2}E\d{1,3}\b/i },
]

// ---------------------------------------------------------------------------
// loading
// ---------------------------------------------------------------------------
async function loadExtension() {
  try {
    return {
      ext: (await import(pathToFileURL(CONFIG.entry).href)).default,
      Parser: (await import(pathToFileURL(CONFIG.parser).href)).default,
    }
  } catch {
    const { build } = await import('esbuild')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nyaasi-test-'))
    const tmpEntry = path.join(dir, 'entry.mjs')
    const out = path.join(dir, 'bundle.mjs')
    fs.writeFileSync(tmpEntry,
      `export { default } from ${JSON.stringify(CONFIG.entry)}\n` +
      `export { default as Parser } from ${JSON.stringify(CONFIG.parser)}\n`)
    await build({ entryPoints: [tmpEntry], bundle: true, format: 'esm', platform: 'neutral',
      target: 'es2022', outfile: out, logLevel: 'silent' })
    const mod = await import(pathToFileURL(out).href)
    return { ext: mod.default, Parser: mod.Parser }
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

  console.log(`${pad('result', 6)} ${pad('case', 30)} ${pad('show / episode', 34)} detail`)
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
      console.log(`${pad('FAIL', 6)} ${pad(c.name, 30)} ${pad(titleOf(media) + ' ep' + (episode ?? '-'), 34)} ${problems.join('; ')}`)
      if (top) console.log(`${' '.repeat(6)}     top: ${top.title.slice(0, 92)}`)
    } else {
      pass++
      console.log(`${pad('ok', 6)} ${pad(c.name, 30)} ${pad(titleOf(media) + ' ep' + (episode ?? '-'), 34)} ${out.length} results  ${top ? top.title.slice(0, 44) : '(none)'}`)
    }

    await sleep(CONFIG.delay)
  }

  console.log('-'.repeat(110))
  console.log(`${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''}  (${cases.length} cases)`)
  process.exit(fail ? 1 : 0)
}

run().catch(err => { console.error(err); process.exit(2) })
