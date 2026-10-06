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
            ...new Set(Object.values(media.title ?? {}).filter(t => !!t)),
            ...(media.synonyms ?? [])
        ].filter(t => t && /^[\x20-\x7E]*$/.test(Parser.canon(t)))

        if (titles.length < 1) return []

        let results = await API.findTorrentResults(titles, episode, exclusions, options)

        const episodic = media?.format !== "MOVIE" && (episodeCount ?? media?.episodes ?? 0) > 1

        let scoredResults = this.scoreResults(results, titles, episode, episodic)

        let topResults = scoredResults
            .filter(res => res.hash && res.magnet)
            .filter(res => res.accScore >= this.SCORE_THRESH)
            .sort((a, b) => b.accScore - a.accScore)
            .slice(0, Number(options.resultsLimit) || 10)

        return this.map(topResults)
    }

    scoreResults(results, titles, wantedEpisode, episodic) {

        let wantedSeason = 1;
        if (episodic) {
            wantedSeason = Parser.findWantedSeason(titles)
        }

        for (let index in results) {
            let result = results[index]
            const { episode, season } = Parser.parseEpisodeSeason(result.name)

            const episodeMismatch = episodic && wantedEpisode != null && episode !== wantedEpisode

            const seasonMismatch = episodic && (
                wantedSeason > 1 ? season !== wantedSeason : season != null && season !== 1
            )

            if (episodeMismatch || seasonMismatch) {
                results[index].accScore = 0;
                continue;
            }

            let highestScore = 0
            let contained = false;
            for (let title of titles) {
                let scoreData = this.scoreResult(title, result.name)
                if (scoreData.sequel) continue;
                if (scoreData.contained) contained = scoreData.contained
                if (scoreData.JWScore > highestScore) highestScore = scoreData.JWScore
            }

            results[index].accScore = highestScore + (contained ? 1 : 0)
        }

        return results
    }

    scoreResult(variant, name) {

        let JWScore = 0;
        let contained = false;
        let sequel = false;

        const releaseTitle = Parser.extractReleaseTitle(name)
        const compactVariant = Parser.compact(variant)
        const compactRelease = Parser.compact(releaseTitle)

        if (!compactVariant || !compactRelease) return { JWScore, contained, sequel };

        const variantPhrase = ` ${Parser.spaced(variant)} `
        const releasePhrase = ` ${Parser.spaced(releaseTitle)} `

        const at = releasePhrase.indexOf(variantPhrase)
        if (at >= 0 && releasePhrase !== variantPhrase) {
            const extra = releasePhrase.slice(at + variantPhrase.length).trim()

            sequel = /^(?:\d{1,2}|i{1,3}|iv|v|vi{1,3}|ix|x)\b/i.test(extra)
            if (sequel) return { JWScore, contained, sequel }
        }


        contained =
            Math.min(compactVariant.length, compactRelease.length) >= 6 &&
            (releasePhrase.includes(variantPhrase) || variantPhrase.includes(releasePhrase))

        JWScore = Scoring.jaroWinkler(compactVariant, compactRelease)

        return { JWScore, contained, sequel }
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