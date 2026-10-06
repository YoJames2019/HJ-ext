import Parser from "./parsing"


class API {
    static _FILTER_VALUES = {
        "Any": 0,
        "No remakes": 1,
        "Trusted only": 2
    }

    static async findTorrentResults(titles, season, episode, exclusions, extensionOpts) {
        const pages = await Promise.all(
            this.buildQueries(titles, season, episode, exclusions)
                .map(query => this.fetchData(query.term, query.pageSize, extensionOpts))
        )
        const byHash = new Map()
        for (const row of pages.flat()) if (row?.hash) byHash.set(row.hash, row)
        return [...byHash.values()]
    }

    static async fetchData(term, pageSize, extensionOpts) {
        const apiUrl = extensionOpts.apiUrl.replace(/\/+$/, "")

        const headers = {
            "Content-Type": "application/json",
            "X-API-Key": extensionOpts.apiKey || ""
        }

        const res = await fetch(`${apiUrl}/api/search`, {
            method: "POST",
            headers,
            body: JSON.stringify({ term, pageSize: pageSize ?? 50, filter: this._FILTER_VALUES[extensionOpts.filter] ?? 1 }),
        })

        if (!res.ok) {
            if (res.status === 401 || res.status === 403) throw new Error("Missing or invalid API key. Set it in the extension settings.")
            if (res.status === 429) throw new Error("Ratelimited by the API, try again later")
            return []
        }

        const data = await res.json()

        if (!Array.isArray(data)) return []

        return data
    }

    static getTitleVariants(titles) {
        const out = new Set()
        const add = title => { 
            title = title && title.trim(); 
            if (title) out.add(title) 
        }

        for (const raw of titles) {
            if (!raw) continue
            const base = raw.split(/\s*[:–—]\s+|\s+-\s+/)[0]        // subtitle dropped
            for (const title of [raw, base]) {
                add(title)                                                // raw / base
                const noSeason = Parser.stripSeason(title)
                if (noSeason && noSeason !== title && Parser.parsePart(noSeason) === Parser.parsePart(title)) {
                    add(noSeason)                                       // "Clevatess Season 2" -> "Clevatess"
                }
            }
        }
        return [...out]
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

    static buildQueries(titles, season, episode, exclusions = []) {
        const titlePhrases = this.getTitleVariants(titles)
            .filter(title => Parser.compact(title).length > 0)
            .map(title => `"${Parser.spaced(title)}"`)
            .join("|")

        const excludeStr = exclusions.flatMap(exclusion => Parser.spaced(exclusion).split(/\s+/)).filter(Boolean).map(term => `-${term}`).join(" ")
        const withExclusions = query => excludeStr ? `${query} ${excludeStr}` : query

        if (episode == null) return [{ term: withExclusions(titlePhrases) }]

        const { pairs, bare } = this.getEpisodeVariants(episode, season)
        return [
            { term: withExclusions(`${titlePhrases} (${[...new Set(pairs)].join("|")})`), pageSize: 100 },
            { term: withExclusions(`${titlePhrases} (${[...new Set(bare)].join("|")})`), pageSize: 100 },
        ]
    }
}

export default API;