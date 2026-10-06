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
        const add = t => { t = t && t.trim(); if (t) out.add(t) }
        for (const raw of titles) {
            if (!raw) continue
            const base = raw.split(/\s*[:–—]\s+|\s+-\s+/)[0]        // subtitle dropped
            for (const t of [raw, base]) {
                add(t)                                                // raw / base
                const noSeason = Parser.stripSeason(t)
                if (noSeason && noSeason !== t) {
                    add(noSeason)                                       // "Clevatess Season 2" -> "Clevatess"
                    const franchise = noSeason.split(/\s+/)[0]
                    if (franchise.length >= 4) add(franchise)           // "Clevatess"
                }
            }
        }
        return [...out]
    }

    static getEpisodeVariants(episode, season) {
        const n = String(episode)
        const e = n.padStart(2, "0")
        const s1 = String(season ?? 1)
        const s2 = s1.padStart(2, "0")
        return {
            pairs: [`s${s2}e${e}`, `s${s1}e${e}`],
            bare: [e, `e${e}`, `e${n}`],
        }
    }

    static buildQueries(titles, episode, season, exclusions = []) {
        const titlePhrases = this.getTitleVariants(titles)
            .filter(t => Parser.compact(t).length > 0)
            .map(t => `"${Parser.spaced(t)}"`)
            .join("|")

        const exclude = exclusions.flatMap(x => Parser.spaced(x).split(/\s+/)).filter(Boolean).map(t => `-${t}`).join(" ")
        const withEx = q => exclude ? `${q} ${exclude}` : q

        if (episode == null) return [withEx(titlePhrases)]

        const { pairs, bare } = this.getEpisodeVariants(episode, season)
        return [
            withEx(`${titlePhrases} (${[...new Set(pairs)].join("|")})`),
            withEx(`${titlePhrases} (${[...new Set(bare)].join("|")})`),
        ]
    }
}

export default API;