import API from "./api"
import Parser from "./parsing"
import Scoring from "./scoring"

export default new class NyaapiExtension {
    SCORE_THRESH = 0.95
    async single({ media, episode, episodeCount, exclusions }, options) {
        if (!options.apiUrl) {
            throw new Error("You must specify the base url of the third party nyaa.si api you are using in settings\n\nExample (not functional): https://nyaasi.yourwebsite.net")
        }

        if (!media?.title) return []

        const titles = [
            ...new Set(Object.values(media.title ?? {}).filter(title => !!title)),
            ...(media.synonyms ?? [])
        ].filter(title => title && /^[\x20-\x7E]*$/.test(Parser.canon(title)))

        if (titles.length < 1) return []

        const seasonNum = Parser.findWantedSeason(titles)
        const partNum = Parser.findWantedPart(titles)

        const episodic = media?.format !== "MOVIE" && (episodeCount ?? media?.episodes ?? 0) > 1

        episode = episodic ? episode : null

        let results = await API.findTorrentResults(titles, seasonNum, episode, exclusions, options)


        let scoredResults = Scoring.scoreResults(results, titles, episode, partNum)

        let topResults = scoredResults
            .filter(res => res.hash && res.magnet)
            .filter(res => res.accScore >= this.SCORE_THRESH)
            .sort((a, b) => (b.accScore - a.accScore) + Math.tanh((Number(b.seeders) - Number(a.seeders)) / 20) * 0.05)
            .slice(0, Number(options.resultsLimit) || 10)

        return this.map(topResults)
    }

    map(data) {
        return data.map(item => ({
            title: item.name || '',
            link: item.magnet || '',
            seeders: parseInt(item.seeders || '0'),
            leechers: parseInt(item.leechers || '0'),
            downloads: parseInt(item.completed || '0'),
            accuracy: item.accScore > 0.95 ? 'high' : 'medium',
            hash: item.hash || '',
            size: Parser.parseFileSize(item.filesize),
            date: new Date(item.date),
            type: /((\[|\()(batch|bd)|batch|bdrip)/i.test(item.name) ? "batch" : null
        }))
    }

    batch = () => []
    movie = () => []

    async test() {
        return true
    }
}()