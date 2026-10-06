import Parser from "./parsing"


class API {
    static _FILTER_VALUES = {
        "Any": 0,
        "No remakes": 1,
        "Trusted only": 2
    }

    static async findTorrentResults(titles, episode, exclusions, extensionOpts, season) {
        const pages = await Promise.all(
            this.buildQueries(titles, episode, season, exclusions)
                .map(query => this.fetchData(query, extensionOpts))
        )
        const byHash = new Map()
        for (const row of pages.flat()) if (row?.hash) byHash.set(row.hash, row)
        return [...byHash.values()]
    }

    static async fetchData(query, extensionOpts) {
        const apiUrl = extensionOpts.apiUrl.replace(/\/+$/, "")

        const headers = {
            "Content-Type": "application/json",
            "X-API-Key": extensionOpts.apiKey || ""
        }

        const res = await fetch(`${apiUrl}/api/search`, {
            method: "POST",
            headers,
            body: JSON.stringify({ term: query, pageSize: 100, filter: this._FILTER_VALUES[extensionOpts.filter] ?? 1 }),
        })

        if (!res.ok) {
            if (res.status === 429) {
                if (extensionOpts.apiKey !== "") {
                    throw new Error("Invalid or incorrect API key!")
                }
                throw new Error("You cannot access this api without authorization! If you have an API key, make sure to put it in the extension settings!")
            }

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
                if (noSeason && noSeason !== title) {
                    add(noSeason)                                       // "Clevatess Season 2" -> "Clevatess"
                    const franchise = noSeason.split(/\s+/)[0]
                    if (franchise.length >= 4) add(franchise)           // "Clevatess"
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
            bare: [paddedEpNum, `e${paddedEpNum}`, `e${epNum}`],
        }
    }

    static buildQueries(titles, episode, season, exclusions = []) {
        const titlePhrases = this.getTitleVariants(titles)
            .filter(title => Parser.compact(title).length > 0)
            .map(title => `"${Parser.spaced(title)}"`)
            .join("|")

        const excludeStr = exclusions.flatMap(exclusion => Parser.spaced(exclusion).split(/\s+/)).filter(Boolean).map(term => `-${term}`).join(" ")
        const withExclusions = query => excludeStr ? `${query} ${excludeStr}` : query

        if (episode == null) return [withExclusions(titlePhrases)]

        const { pairs, bare } = this.getEpisodeVariants(episode, season)
        return [
            withExclusions(`${titlePhrases} (${[...new Set(pairs)].join("|")})`),
            withExclusions(`${titlePhrases} (${[...new Set(bare)].join("|")})`),
        ]
    }
}

export default API;