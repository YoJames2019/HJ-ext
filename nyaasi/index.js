import API from "./api"
import Parser from "./parsing"
import Scoring from "./scoring"

export default new class NyaapiExtension {
    SCORE_THRESH = 0.95
    async single({ media, episode, exclusions }, options) {
        if (!options.apiUrl) {
            throw new Error("You must specify the base url of the third party nyaa.si api you are using in settings\n\nExample (not functional): https://nyaasi.yourwebsite.net")
        }

        if (!media?.title) return []

        const titles = [
            ...new Set(Object.values(media.title ?? {}).filter(t => !!t)), 
            ...(media.synonyms ?? [])
        ].filter(t => t && /^[\x20-\x7E]*$/.test(Parser.canon(t)))

        if(titles.length < 1) return []

        let results = await API.findTorrentResults(titles, episode, exclusions, options)

        let scoredResults = this.scoreResults(results, titles, episode)

        let topResults = scoredResults
            .filter(res => res.hash && res.magnet)
            .filter(res => res.accScore >= this.SCORE_THRESH)
            .sort((a, b) => b.accScore - a.accScore)
            .slice(0, Number(options.resultsLimit) || 10)

        return this.map(topResults)
    }

    scoreResults(results, titles, wantedEpisode) {

        let wantedSeason;
        for (let title of titles) {
            let season = Parser.parseSeason(title)
            if (season) {
                wantedSeason = season
                break;
            }
        }

        for (let index in results) {
            let result = results[index]
            const { episode, season } = Parser.parseEpisodeSeason(result.name)


            if ((wantedEpisode != null && episode !== wantedEpisode) || (wantedSeason > 1 && season !== wantedSeason)) {
                results[index].accScore = 0;
                continue;
            }

            let highestScore = 0
            let contained = false;
            for (let title of titles) {
                let scoreData = this.scoreResult(title, result.name)
                if(scoreData.contained) contained = scoreData.contained
                if (scoreData.JWScore > highestScore) highestScore = scoreData.JWScore
            }

            results[index].accScore = highestScore + (contained ? 1 : 0)
        }

        return results
    }

    scoreResult(variant, name) {
        const str1 = Parser.compact(variant)
        const str2 = Parser.compact(Parser.extractReleaseTitle(name))

        if(!str1 || !str2) return { JWScore: 0, contained: false};

        const contained = str1.includes(str2) || str2.includes(str1)

        return {JWScore: Scoring.jaroWinkler(str1, str2), contained}
    }

    map(data) {
        return data.map(item => ({
            title: item.name || '',
            link: item.magnet || '',
            seeders: parseInt(item.seeders || '0'),
            leechers: parseInt(item.leechers || '0'),
            downloads: parseInt(item.completed || '0'),
            accuracy: item.accScore > 0.95 || item.accOverride ? 'high' : 'medium',
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