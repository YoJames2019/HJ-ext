import Parser from "./parsing"


class API {
    static _FILTER_VALUES = {
        "Any": 0,
        "No remakes": 1,
        "Trusted only": 2
    }

    static async findTorrentResults(titles, epNum, exclusions, extensionOpts) {
        /**
         * titles:
         *   english: "Petals of Reincarnation"
         *   native: "リィンカーネーションの花弁"
         *   romaji: "Reincarnation no Kaben"
         *   userPreferred: "Petals of Reincarnation"
         */

        let query = this.buildSearchQuery(titles, epNum, exclusions)

        let data = await this.fetchData(query, extensionOpts)

        return data
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

    static buildSearchQuery(titles, episode, exclusions = []) {

        let queryParts = []
        
        const titleVariants = titles
        .filter(t => Parser.compact(t).length > 0)
        .map(v => `"${Parser.spaced(v)}"`)
        
        queryParts.push(titleVariants.join("|"))
        
        if(episode != null && episode != undefined){
            const paddedEpisode = String(episode).padStart(2, "0")
    
            const episodeVariants = [...new Set([
                `${paddedEpisode}`,
                `s${paddedEpisode}`,
                `s${episode}`,
                `e${paddedEpisode}`,
                `e${episode}`,
                `ep${paddedEpisode}`,
                `ep${episode}`
            ])]

            queryParts.push(`(${episodeVariants.join("|")})`)
        }

        const excludedTerms = exclusions
            .flatMap(exclusion => Parser.spaced(exclusion).split(/\s+/))
            .filter(Boolean)
            .map(term => `-${term}`)

        if(excludedTerms.length > 0) queryParts.push(excludedTerms.join(" "))

        return queryParts.join(" ").trim();
    }
}

export default API;