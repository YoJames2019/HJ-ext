// nyaasi/parsing.js
var Parser = class {
  static _ROMAN_TOKEN = /\b([ivxlcdm]{2,})\b/g;
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
    const METADATA_MARKER = /\bS\d{1,2}E\d{1,4}\b|\bS\d{1,2}\b|\bE(?:P)?\d{1,4}\b|-\s*\d{1,4}\b|第\d+话|\b\d{1,4}[-~–]\d{1,4}\b|\b(?:complete|batch|seasons?|cour)\b|[\[(]/i;
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
    const PART_WORD = /\b(?:part|cour)\s*$/;
    let match;
    if (match = SEASON_WORD.exec(text)) return Number(match[1]);
    if (match = SEASON_ORDINAL.exec(text)) return Number(match[1]);
    if (match = SEASON_PREFIX.exec(text)) return Number(match[1]);
    let roman = null;
    for (const token of text.matchAll(this._ROMAN_TOKEN)) {
      if (PART_WORD.test(text.slice(0, token.index))) continue;
      roman = this.romanSeason(token[1]) ?? roman;
    }
    return roman;
  }
  static parseEpisode(text) {
    const EPISODE_PREFIX = /\be(?:p)?(\d{1,4})(?:v\d+)?\b/;
    const EPISODE_CJK = /第\s*(\d+)\s*[话話]/;
    const EPISODE_DASH = /(?:^|[\s\])])[-–]\s*(\d{1,4})\b/;
    const BATCH_RANGE = /\b\d{1,4}\s*[-~–]\s*\d{1,4}\b/;
    const BATCH_WORD = /\b(?:complete|batch|cour)\b/;
    const FILE_EXTENSION = /\.[a-z0-9]{2,4}$/;
    const TRAILING_NUMBER = /(\d{1,4})\s*$/;
    let match;
    if (match = EPISODE_PREFIX.exec(text)) return Number(match[1]);
    if (match = EPISODE_CJK.exec(text)) return Number(match[1]);
    if (match = EPISODE_DASH.exec(text)) return Number(match[1]);
    if (BATCH_RANGE.test(text) || BATCH_WORD.test(text)) return null;
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
};
var parsing_default = Parser;

// nyaasi/api.js
var API = class {
  static _FILTER_VALUES = {
    "Any": 0,
    "No remakes": 1,
    "Trusted only": 2
  };
  static async findTorrentResults(titles, epNum, exclusions, extensionOpts) {
    let query = this.buildSearchQuery(titles, epNum, exclusions);
    let data = await this.fetchData(query, extensionOpts);
    return data;
  }
  static async fetchData(query, extensionOpts) {
    const headers = {
      "Content-Type": "application/json",
      "X-API-Key": extensionOpts.apiKey || ""
    };
    const res = await fetch(`${extensionOpts.apiUrl}/api/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ term: query, pageSize: 100, filter: this._FILTER_VALUES[extensionOpts.filter] ?? 2 })
    });
    if (!res.ok) {
      if (res.status === 429) {
        if (extensionOpts.apiKey !== "") {
          throw new Error("Invalid or incorrect API key!");
        }
        throw new Error("You cannot access this api without authorization! If you have an API key, make sure to put it in the extension settings!");
      }
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data;
  }
  static buildSearchQuery(titles, episode, exclusions = []) {
    let queryParts = [];
    const titleVariants = titles.filter((t) => parsing_default.compact(t).length > 0).map((v) => `"${parsing_default.spaced(v)}"`);
    queryParts.push(titleVariants.join("|"));
    if (episode != null && episode != void 0) {
      const paddedEpisode = String(episode).padStart(2, "0");
      const episodeVariants = [.../* @__PURE__ */ new Set([
        `${paddedEpisode}`,
        `s${paddedEpisode}`,
        `s${episode}`,
        `e${paddedEpisode}`,
        `e${episode}`,
        `ep${paddedEpisode}`,
        `ep${episode}`
      ])];
      queryParts.push(`(${episodeVariants.join("|")})`);
    }
    const excludedTerms = exclusions.flatMap((exclusion) => parsing_default.spaced(exclusion).split(/\s+/)).filter(Boolean).map((term) => `-${term}`);
    if (excludedTerms.length > 0) queryParts.push(excludedTerms.join(" "));
    return queryParts.join(" ").trim();
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
};
var scoring_default = Scoring;

// nyaasi/index.js
var index_default = new class NyaapiExtension {
  SCORE_THRESH = 0.95;
  async single({ media, episode, exclusions }, options) {
    if (!options.apiUrl) {
      throw new Error("You must specify the base url of the third party nyaa.si api you are using in settings\n\nExample (not functional): https://nyaasi.yourwebsite.net");
    }
    if (!media?.title) return [];
    const titles = [...new Set(Object.values(media.title ?? {}).filter((t) => !!t)), ...media.synonyms ?? []];
    if (titles.length < 1) return [];
    let results = await api_default.findTorrentResults(titles, episode, exclusions, options);
    console.log(results);
    console.log("what?");
    let scoredResults = this.scoreResults(results, titles, episode);
    let topResults = scoredResults.filter((res) => res.hash && res.magnet).filter((res) => res.accScore >= this.SCORE_THRESH).sort((a, b) => b.accScore - a.accScore).slice(0, Number(options.resultsLimit) || 10);
    return this.map(topResults);
  }
  scoreResults(results, titles, wantedEpisode) {
    let wantedSeason;
    for (let title of titles) {
      let season = parsing_default.parseSeason(title);
      if (season) {
        wantedSeason = season;
        break;
      }
    }
    for (let index in results) {
      let result = results[index];
      const { episode, season } = parsing_default.parseEpisodeSeason(result.name);
      if (wantedEpisode != null && episode !== wantedEpisode || wantedSeason > 1 && season !== wantedSeason) {
        results[index].accScore = 0;
        continue;
      }
      let highestScore = 0;
      let contained = false;
      for (let title of titles) {
        let scoreData = this.scoreResult(title, result.name);
        if (scoreData.contained) contained = scoreData.contained;
        if (scoreData.JWScore > highestScore) highestScore = scoreData.JWScore;
      }
      results[index].accScore = highestScore + (contained ? 1 : 0);
    }
    return results;
  }
  scoreResult(variant, name) {
    const str1 = parsing_default.compact(variant);
    const str2 = parsing_default.compact(parsing_default.extractReleaseTitle(name));
    if (!str1 || !str2) return { JWScore: 0, contained: false };
    const contained = str1.includes(str2) || str2.includes(str1);
    return { JWScore: scoring_default.jaroWinkler(str1, str2), contained };
  }
  map(data) {
    return data.map((item) => ({
      title: item.name || "",
      link: item.magnet || "",
      seeders: parseInt(item.seeders || "0"),
      leechers: parseInt(item.leechers || "0"),
      downloads: parseInt(item.completed || "0"),
      accuracy: item.accScore > 0.95 || item.accOverride ? "high" : "medium",
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
