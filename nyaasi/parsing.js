class Parser {
    static _ROMAN_TOKEN = /\b([ivxlcdm]{2,})\b/g;
    static _ROMAN_DIGITS = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
    static _ROMAN_TABLE = [
        [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
        [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
    ];


    static canon = (str) => str.normalize("NFKD").replace(/p{M}/gu, "").toLowerCase()
    static compact = (str) => this.canon(str).replace(/[^a-z0-9]+/g, "");
    static spaced = (str) => this.canon(str).replace(/[^a-z0-9]+/g, " ").trim();


    static extractReleaseTitle(name) {
        const METADATA_MARKER = /\bS\d{1,2}E\d{1,4}\b|\bS\d{1,2}\b|\bE(?:P)?\d{1,4}\b|-\s*\d{1,4}\b|第\d+话|\b\d{1,4}[-~–]\d{1,4}\b|\b(?:complete|batch|seasons?|cour)\b|[\[(]/i;

        let realTitle = name;

        for (let pass = 0; pass < 2; pass++) {
            realTitle = realTitle.replace(/^\s*[\[(][^\])]*[\])]\s*/, "")
        }

        const marker = METADATA_MARKER.exec(realTitle)
        return this.spaced(marker ? realTitle.slice(0, marker.index) : realTitle)
    }


    static getNumberSuffix(num) {
        num = Number(num)
        if (!Number.isFinite(num) || num <= 0) return ""

        const lastTwo = num % 100
        if (lastTwo >= 11 && lastTwo <= 13) return "th"

        switch (num % 10) {
            case 1: return "st"
            case 2: return "nd"
            case 3: return "rd"
            default: return "th"
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
            while (value >= size) { token += symbol; value -= size; }
        }
        return token;
    }

    static romanSeason(token) {
        const value = this.fromRoman(token);
        if (value < 2 || value > 20) return null;
        return this.toRoman(value) === token ? value : null;
    }

    static parseSeason(text) {
        const SEASON_WORD = /\bseason\s*(\d{1,2})\b/;
        const SEASON_ORDINAL = /\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/;
        const SEASON_PREFIX = /\bs(\d{1,2})\b/;
        const FINAL_SEASON = /\bfinal\s+season\b/;
        const PART_WORD = /\b(?:part|cour)\s*$/;

        let match;
        if ((match = SEASON_WORD.exec(text))) return { season: Number(match[1]), finalSeason: false };
        if ((match = SEASON_ORDINAL.exec(text))) return { season: Number(match[1]), finalSeason: false };
        if ((match = SEASON_PREFIX.exec(text))) return { season: Number(match[1]), finalSeason: false };
        if (FINAL_SEASON.test(text)) return { season: null, finalSeason: true };

        // last valid roman wins, and one introduced by "part"/"cour" is a cour, not a season
        let roman = null;
        for (const token of text.matchAll(this._ROMAN_TOKEN)) {
            if (PART_WORD.test(text.slice(0, token.index))) continue;
            roman = this.romanSeason(token[1]) ?? roman;
        }
        return { seasonStr: roman, seasonNum: this.fromRoman(roman), finalSeason: false };
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
        if ((match = EPISODE_PREFIX.exec(text))) return Number(match[1]);
        if ((match = EPISODE_CJK.exec(text))) return Number(match[1]);
        if ((match = EPISODE_DASH.exec(text))) return Number(match[1]);

        if (BATCH_RANGE.test(text) || BATCH_WORD.test(text)) return null;

        const stem = text.replace(FILE_EXTENSION, "");

        const trailing = TRAILING_NUMBER.exec(stem);
        return trailing && trailing[1].length <= 3 ? Number(trailing[1]) : null;
    }

    static parseEpisodeSeason(name) {
        const COMBINED_EPISODE = /\bs(\d{1,2})e(\d{1,4})(?:v\d+)?\b/;
        const text = canon(name);
        const combined = COMBINED_EPISODE.exec(text);
        if (combined) {
            return { episode: Number(combined[2]), seasonStr: Number(combined[1]), seasonNum: Number(combined[1]), finalSeason: false };
        }
        return { episode: this.parseEpisode(text), ...this.parseSeason(text) };
    }

    static parseFileSize(value) {
        const SIZE_UNITS = {
            B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4
        };
        
        const match = /^([\d.]+)\s*([A-Za-z]+)$/.exec(String(value).trim());
        if (!match) return 0;
        return Math.round(parseFloat(match[1]) * (SIZE_UNITS[match[2]] ?? 0));
    }
}

export default Parser