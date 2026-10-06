// nyaasi/parsing.js
var Parser = class {
  static _ROMAN_DIGITS = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1e3 };
  static _ROMAN_TABLE = [
    [1e3, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"]
  ];
  static canon = (str) => str.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  static compact = (str) => this.canon(str).replace(/[^a-z0-9]+/g, "");
  static spaced = (str) => this.canon(str).replace(/[^a-z0-9]+/g, " ").trim();
  static extractReleaseTitle(name) {
    const METADATA_MARKER = /\bS\d{1,2}E\d{1,4}\b|\bS\d{1,2}\b|\bE(?:P)?\d{1,4}\b|-\s*\d{1,4}\b|第\d+话|\b\d{1,4}[-~–]\d{1,4}\b|\b(?:complete|batch)\b|[\[(]/i;
    let realTitle = name;
    for (let pass = 0; pass < 2; pass++) {
      realTitle = realTitle.replace(/^\s*[\[(][^\])]*[\])]\s*/, "");
    }
    const marker = METADATA_MARKER.exec(realTitle);
    return this.spaced(marker ? realTitle.slice(0, marker.index) : realTitle);
  }
  static getNumberSuffix(num) {
    num = Number(num);
    if (!Number.isFinite(num) || num <= 0) return "";
    const lastTwo = num % 100;
    if (lastTwo >= 11 && lastTwo <= 13) return "th";
    switch (num % 10) {
      case 1:
        return "st";
      case 2:
        return "nd";
      case 3:
        return "rd";
      default:
        return "th";
    }
  }
  static fromRoman(token) {
    let value = 0;
    for (let i = 0; i < token.length; i++) {
      const digit = this._ROMAN_DIGITS[token[i]], next = this._ROMAN_DIGITS[token[i + 1]];
      value += next && digit < next ? -digit : digit;
    }
    return value;
  }
  static toRoman(value) {
    let token = "";
    for (const [size, symbol] of this._ROMAN_TABLE) {
      while (value >= size) {
        token += symbol;
        value -= size;
      }
    }
    return token;
  }
  static romanSeason(token) {
    const value = this.fromRoman(token);
    if (value < 2 || value > 20) return null;
    return this.toRoman(value) === token ? value : null;
  }
  static parseSeason(title) {
    const text = this.canon(title);
    const SEASON_WORD = /\bseason\s*(\d{1,2})\b/;
    const SEASON_ORDINAL = /\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/;
    const SEASON_PREFIX = /\bs(\d{1,2})\b/;
    let match;
    if (match = SEASON_WORD.exec(text)) return Number(match[1]);
    if (match = SEASON_ORDINAL.exec(text)) return Number(match[1]);
    if (match = SEASON_PREFIX.exec(text)) return Number(match[1]);
    for (const part of [text, text.split(/\s*[:–—]\s+|\s+-\s+/)[0]]) {
      const words = part.split(/\s+/).filter(Boolean);
      const last = words.pop();
      const previous = words.pop();
      if (previous === "part" || previous === "cour") continue;
      const season = last ? this.romanSeason(last) : null;
      if (season) return season;
    }
    return null;
  }
  static parsePart(title) {
    const PART_REGEX = /\b(?:cour|part)\s*(\d{1,2})\b/;
    const match = PART_REGEX.exec(this.canon(title));
    return match ? Number(match[1]) : 1;
  }
  static parseEpisode(text) {
    const EPISODE_PREFIX = /\be(?:p)?(\d{1,4})(?:v\d+)?\b/;
    const EPISODE_CJK = /第\s*(\d+)\s*[话話]/;
    const EPISODE_DASH = /(?:^|[\s\])])[-–]\s*(\d{1,4})(?:v\d+)?\b/;
    const BATCH_RANGE = /(?<!\b(?:part|cour|season)\s)\b\d{1,4}\s*[-~–]\s*\d{1,4}\b/;
    const BATCH_WORD = /\b(?:complete|batch|cour)\b/;
    const FILE_EXTENSION = /\.[a-z0-9]{2,4}$/;
    const TRAILING_NUMBER = /(\d{1,4})\s*$/;
    let match;
    if (match = EPISODE_PREFIX.exec(text)) return Number(match[1]);
    if (match = EPISODE_CJK.exec(text)) return Number(match[1]);
    if (BATCH_RANGE.test(text)) return null;
    if (match = EPISODE_DASH.exec(text)) return Number(match[1]);
    if (BATCH_WORD.test(text)) return null;
    const stem = text.replace(FILE_EXTENSION, "");
    const trailing = TRAILING_NUMBER.exec(stem);
    return trailing && trailing[1].length <= 3 ? Number(trailing[1]) : null;
  }
  static parseEpisodeSeason(name) {
    const COMBINED_EPISODE = /\bs(\d{1,2})e(\d{1,4})(?:v\d+)?\b/;
    const text = this.canon(name);
    const combined = COMBINED_EPISODE.exec(text);
    if (combined) {
      return { episode: Number(combined[2]), season: Number(combined[1]), finalSeason: false };
    }
    return { episode: this.parseEpisode(text), season: this.parseSeason(text) };
  }
  static parseFileSize(value) {
    const SIZE_UNITS = {
      B: 1,
      KB: 1e3,
      MB: 1e6,
      GB: 1e9,
      TB: 1e12,
      KiB: 1024,
      MiB: 1024 ** 2,
      GiB: 1024 ** 3,
      TiB: 1024 ** 4
    };
    const match = /^([\d.]+)\s*([A-Za-z]+)$/.exec(String(value).trim());
    if (!match) return 0;
    return Math.round(parseFloat(match[1]) * (SIZE_UNITS[match[2]] ?? 0));
  }
  static stripSeason(title) {
    return title.replace(/\b(?:the\s+)?final\s+season\b/gi, " ").replace(/\b(?:season|cour|part)\s*\d+\b/gi, " ").replace(/\b\d+(?:st|nd|rd|th)\s+season\b/gi, " ").replace(/\s+\b(?:i{1,3}|iv|v|vi{1,3}|ix|x)\b\s*$/i, "").replace(/\s{2,}/g, " ").trim();
  }
  static findWantedPart(titles) {
    return Math.max(1, ...titles.map((title) => this.parsePart(title)));
  }
  static findWantedSeason(titles) {
    for (const title of titles) {
      const season = this.parseSeason(title);
      if (season) return season;
    }
    return null;
  }
};
var parsing_default = Parser;

// nyaasi/api.js
var API = class {
  static _FILTER_VALUES = {
    "Any": 0,
    "No remakes": 1,
    "Trusted only": 2
  };
  static async findTorrentResults(titles, season, episode, exclusions, extensionOpts) {
    const pages = await Promise.all(
      this.buildQueries(titles, season, episode, exclusions).map((query) => this.fetchData(query.term, query.pageSize, extensionOpts))
    );
    const byHash = /* @__PURE__ */ new Map();
    for (const row of pages.flat()) if (row?.hash) byHash.set(row.hash, row);
    return [...byHash.values()];
  }
  static async fetchData(term, pageSize, extensionOpts) {
    const apiUrl = extensionOpts.apiUrl.replace(/\/+$/, "");
    const headers = {
      "Content-Type": "application/json",
      "X-API-Key": extensionOpts.apiKey || ""
    };
    const res = await fetch(`${apiUrl}/api/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ term, pageSize: pageSize ?? 50, filter: this._FILTER_VALUES[extensionOpts.filter] ?? 1 })
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error("Missing or invalid API key. Set it in the extension settings.");
      if (res.status === 429) throw new Error("Ratelimited by the API, try again later");
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data;
  }
  static getTitleVariants(titles) {
    const allVariants = /* @__PURE__ */ new Map();
    const addVariant = (title, isPrimary) => {
      title = title && title.trim();
      if (title && !allVariants.has(title)) allVariants.set(title, isPrimary);
    };
    for (const raw of titles) {
      if (!raw) continue;
      const base = raw.split(/\s*[:–—]\s+|\s+-\s+/)[0];
      for (const title of [raw, base]) {
        addVariant(title, title === raw);
        const noSeason = parsing_default.stripSeason(title);
        if (noSeason && noSeason !== title && parsing_default.parsePart(noSeason) === parsing_default.parsePart(title)) {
          addVariant(noSeason, false);
        }
      }
    }
    return [...allVariants].map(([title, isPrimary]) => ({ title, isPrimary }));
  }
  static getEpisodeVariants(episode, season) {
    const epNum = String(episode);
    const paddedEpNum = epNum.padStart(2, "0");
    season = String(season ?? 1);
    const paddedSeason = season.padStart(2, "0");
    return {
      pairs: [`s${paddedSeason}e${paddedEpNum}`, `s${season}e${paddedEpNum}`],
      bare: [paddedEpNum, `e${paddedEpNum}`]
    };
  }
  static buildQueries(titles, season, episode, exclusions = []) {
    const titlePhrases = this.getTitleVariants(titles).filter(({ title }) => parsing_default.compact(title).length > 0).map(({ title }) => `"${parsing_default.spaced(title)}"`).join("|");
    const excludeStr = exclusions.flatMap((exclusion) => parsing_default.spaced(exclusion).split(/\s+/)).filter(Boolean).map((term) => `-${term}`).join(" ");
    const withExclusions = (query) => excludeStr ? `${query} ${excludeStr}` : query;
    if (episode == null) return [{ term: withExclusions(titlePhrases) }];
    const { pairs, bare } = this.getEpisodeVariants(episode, season);
    return [
      { term: withExclusions(`${titlePhrases} (${[...new Set(pairs)].join("|")})`), pageSize: 100 },
      { term: withExclusions(`${titlePhrases} (${[...new Set(bare)].join("|")})`), pageSize: 100 }
    ];
  }
};
var api_default = API;

// nyaasi/scoring.js
var Scoring = class {
  static jaroWinkler(first, second) {
    if (first === second) return 1;
    if (!first.length || !second.length) return 0;
    const matchWindow = Math.max(
      0,
      Math.floor(
        Math.max(first.length, second.length) / 2
      ) - 1
    );
    const firstMatched = new Array(first.length).fill(false);
    const secondMatched = new Array(second.length).fill(false);
    let matchCount = 0;
    for (let i = 0; i < first.length; i++) {
      const windowStart = Math.max(0, i - matchWindow);
      const windowEnd = Math.min(second.length, i + matchWindow + 1);
      for (let j = windowStart; j < windowEnd; j++) {
        if (!secondMatched[j] && first[i] === second[j]) {
          firstMatched[i] = secondMatched[j] = true;
          matchCount++;
          break;
        }
      }
    }
    if (matchCount === 0) return 0;
    let transpositions = 0;
    let secondIndex = 0;
    for (let i = 0; i < first.length; i++) {
      if (!firstMatched[i]) continue;
      while (!secondMatched[secondIndex]) secondIndex++;
      if (first[i] !== second[secondIndex]) transpositions++;
      secondIndex++;
    }
    transpositions /= 2;
    const A = matchCount / first.length;
    const B = matchCount / second.length;
    const C = (matchCount - transpositions) / matchCount;
    const jaro = (A + B + C) / 3;
    let commonPrefix = 0;
    for (let i = 0; i < Math.min(4, first.length, second.length); i++) {
      if (first[i] === second[i]) {
        commonPrefix++;
      } else {
        break;
      }
    }
    return jaro + commonPrefix * 0.1 * (1 - jaro);
  }
  static scoreResults(results, titles, wantedEpisode, wantedPart = 1) {
    const variants = api_default.getTitleVariants(titles);
    const hasEpisode = wantedEpisode != null;
    let wantedSeason = parsing_default.findWantedSeason(titles) ?? 1;
    for (let index in results) {
      let result = results[index];
      const { episode, season } = parsing_default.parseEpisodeSeason(result.name);
      const episodeMismatch = hasEpisode && episode !== wantedEpisode;
      const seasonMismatch = wantedSeason > 1 ? season !== wantedSeason : season != null && season !== 1;
      const partMismatch = parsing_default.parsePart(parsing_default.extractReleaseTitle(result.name)) !== wantedPart;
      if (episodeMismatch || seasonMismatch || partMismatch) {
        results[index].accScore = 0;
        continue;
      }
      let fullTitleScore = 0;
      let strippedTitleScore = 0;
      let contained = false;
      for (let { title, isPrimary } of variants) {
        let scoreData = this.scoreResult(title, result.name);
        if (scoreData.sequel) continue;
        if (scoreData.contained) contained = scoreData.contained;
        if (isPrimary) {
          fullTitleScore = Math.max(fullTitleScore, scoreData.JWScore);
        } else {
          strippedTitleScore = Math.max(strippedTitleScore, scoreData.JWScore);
        }
      }
      const strippedScoreWeight = 0.5;
      const containedScore = contained ? 1.5 : 0;
      const finalScore = fullTitleScore + containedScore + strippedTitleScore * strippedScoreWeight;
      results[index].accScore = finalScore;
    }
    return results;
  }
  static scoreResult(variant, name) {
    let JWScore = 0;
    let contained = false;
    let sequel = false;
    const releaseTitle = parsing_default.extractReleaseTitle(name);
    const compactVariant = parsing_default.compact(variant);
    const compactRelease = parsing_default.compact(releaseTitle);
    if (!compactVariant || !compactRelease) return { JWScore, contained, sequel };
    const variantPhrase = ` ${parsing_default.spaced(variant)} `;
    const releasePhrase = ` ${parsing_default.spaced(releaseTitle)} `;
    const fullMatchIndex = releasePhrase.indexOf(variantPhrase);
    if (fullMatchIndex >= 0 && releasePhrase !== variantPhrase) {
      const extra = releasePhrase.slice(fullMatchIndex + variantPhrase.length).trim();
      sequel = /^(?:\d{1,2}|i{1,3}|iv|v|vi{1,3}|ix|x)\b/i.test(extra);
      if (sequel) return { JWScore, contained, sequel };
    }
    contained = Math.min(compactVariant.length, compactRelease.length) >= 6 && (releasePhrase.includes(variantPhrase) || variantPhrase.includes(releasePhrase));
    JWScore = this.jaroWinkler(compactVariant, compactRelease);
    return { JWScore, contained, sequel };
  }
};
var scoring_default = Scoring;

// nyaasi/index.js
var index_default = new class NyaapiExtension {
  SCORE_THRESH = 1.425;
  async single({ media, episode, episodeCount, exclusions }, options) {
    if (!options.apiUrl) {
      throw new Error("You must specify the base url of the third party nyaa.si api you are using in settings\n\nExample (not functional): https://nyaasi.yourwebsite.net");
    }
    if (!media?.title) return [];
    const titles = [
      ...new Set(Object.values(media.title ?? {}).filter((title) => !!title)),
      ...media.synonyms ?? []
    ].filter((title) => title && /^[\x20-\x7E]*$/.test(parsing_default.canon(title)));
    if (titles.length < 1) return [];
    const seasonNum = parsing_default.findWantedSeason(titles);
    const partNum = parsing_default.findWantedPart(titles);
    const episodic = media?.format !== "MOVIE" && (episodeCount ?? media?.episodes ?? 0) > 1;
    episode = episodic ? episode : null;
    let results = await api_default.findTorrentResults(titles, seasonNum, episode, exclusions, options);
    let scoredResults = scoring_default.scoreResults(results, titles, episode, partNum);
    let topResults = scoredResults.filter((res) => res.hash && res.magnet).filter((res) => res.accScore >= this.SCORE_THRESH).sort((a, b) => b.accScore - a.accScore + Math.tanh((Number(b.seeders) - Number(a.seeders)) / 20) * 0.05).slice(0, Number(options.resultsLimit) || 10);
    return this.map(topResults);
  }
  map(data) {
    return data.map((item) => ({
      title: item.name || "",
      link: item.magnet || "",
      seeders: parseInt(item.seeders || "0"),
      leechers: parseInt(item.leechers || "0"),
      downloads: parseInt(item.completed || "0"),
      accuracy: item.accScore > this.SCORE_THRESH ? "high" : "medium",
      accScore: item.accScore,
      hash: item.hash || "",
      size: parsing_default.parseFileSize(item.filesize),
      date: new Date(item.date),
      type: /((\[|\()(batch|bd)|batch|bdrip)/i.test(item.name) ? "batch" : null
    }));
  }
  batch = () => [];
  movie = () => [];
  async test() {
    return true;
  }
}();
export {
  index_default as default
};
