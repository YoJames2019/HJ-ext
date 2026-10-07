class Parser {
    static _ROMAN_DIGITS = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
    static _ROMAN_TABLE = [
        [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
        [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
    ];


    static canon = (str) => str.normalize("NFKD").replace(/\p{M}/gu, "").replace(/['’`]/g, "").toLowerCase()
    static compact = (str) => this.canon(str).replace(/[^a-z0-9]+/g, "");
    static spaced = (str) => this.canon(str).replace(/[^a-z0-9]+/g, " ").trim();


    static extractReleaseTitle(name) {
        const METADATA_MARKER = /\bS\d{1,2}E\d{1,4}\b|\bS\d{1,2}\b|\bE(?:P)?\d{1,4}\b|-\s*\d{1,4}\b|第\d+话|\b\d{1,4}[-~–]\d{1,4}\b|\b(?:complete|batch)\b|[\[(]/i;

        let realTitle = name;

        for (let pass = 0; pass < 2; pass++) {
            realTitle = realTitle.replace(/^\s*[\[(][^\])]*[\])]\s*/, "")
        }

        const marker = METADATA_MARKER.exec(realTitle)
        return this.spaced(marker ? realTitle.slice(0, marker.index) : realTitle)
    }


    static getTitleVariants(titles) {
        const allVariants = new Map()
        const addVariant = (title, isPrimary) => {
            title = title && title.trim();
            if (title && !allVariants.has(title)) allVariants.set(title, isPrimary)
        }

        for (const raw of titles) {
            if (!raw) continue
            const base = raw.split(/\s*[:–—]\s+|\s+-\s+/)[0]        // subtitle dropped
            for (const title of [raw, base]) {
                addVariant(title, title === raw)
                const noSeason = this.stripSeason(title)
                if (noSeason && noSeason !== title && this.parsePart(noSeason) === this.parsePart(title)) {
                    addVariant(noSeason, false)
                }
            }
        }
        return [...allVariants].map(([title, isPrimary]) => ({ title, isPrimary }))
    }

    static getEpisodeVariants(episode, season) {
        const epNum = String(episode)
        const paddedEpNum = epNum.padStart(2, "0")

        season = String(season ?? 1)
        const paddedSeason = season.padStart(2, "0")

        return {
            pairs: [`s${paddedSeason}e${paddedEpNum}`, `s${season}e${paddedEpNum}`],
            bare: [paddedEpNum, `e${paddedEpNum}`],
        }
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

    static parseSeason(title) {
        const text = this.canon(title)

        const SEASON_WORD = /\bseason\s*(\d{1,2})\b/;
        const SEASON_ORDINAL = /\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/;
        const SEASON_PREFIX = /\bs(\d{1,2})\b/;

        let match;
        if ((match = SEASON_WORD.exec(text))) return Number(match[1]);
        if ((match = SEASON_ORDINAL.exec(text))) return Number(match[1]);
        if ((match = SEASON_PREFIX.exec(text))) return Number(match[1]);

        for (const part of [text, text.split(/\s*[:–—]\s+|\s+-\s+/)[0]]) {
            const words = part.split(/\s+/).filter(Boolean)
            const last = words.pop()
            const previous = words.pop()
            if (previous === "part" || previous === "cour") continue
            const season = last ? this.romanSeason(last) : null
            if (season) return season
        }

        return null
    }

    static parsePart(title) {
        const PART_REGEX = /\b(?:cour|part)\s*(\d{1,2})\b/
        const match = PART_REGEX.exec(this.canon(title))
        return match ? Number(match[1]) : 1   // no qualifier means the first cour/part                   
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
        if ((match = EPISODE_PREFIX.exec(text))) return Number(match[1]);
        if ((match = EPISODE_CJK.exec(text))) return Number(match[1]);

        if (BATCH_RANGE.test(text)) return null

        if ((match = EPISODE_DASH.exec(text))) return Number(match[1]);

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
            B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4
        };

        const match = /^([\d.]+)\s*([A-Za-z]+)$/.exec(String(value).trim());
        if (!match) return 0;
        return Math.round(parseFloat(match[1]) * (SIZE_UNITS[match[2]] ?? 0));
    }

    static stripSeason(title) {
        return title
            .replace(/\b(?:the\s+)?final\s+season\b/gi, " ")
            .replace(/\b(?:season|cour|part)\s*\d+\b/gi, " ")
            .replace(/\b\d+(?:st|nd|rd|th)\s+season\b/gi, " ")
            .replace(/\s+\b(?:i{1,3}|iv|v|vi{1,3}|ix|x)\b\s*$/i, "")
            .replace(/\s{2,}/g, " ")
            .trim()
    }

    static findWantedPart(titles) {
        return Math.max(1, ...titles.map(title => this.parsePart(title)))
    }

    static findWantedSeason(titles) {
        for (const title of titles) {
            const season = this.parseSeason(title)
            if (season) return season
        }
        return null
    }
}

export default Parser