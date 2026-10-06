import API from "./api";
import Parser from "./parsing";

class Scoring {
    static jaroWinkler(first, second) {
        if (first === second) return 1;
        if (!first.length || !second.length) return 0;

        // match window size
        const matchWindow = Math.max(0,
            Math.floor(
                Math.max(first.length, second.length) / 2
            ) - 1
        )

        // array of values denoting whether each char in the string has a designated match in the other string, filled with false initially
        const firstMatched = new Array(first.length).fill(false)
        const secondMatched = new Array(second.length).fill(false)

        let matchCount = 0

        for (let i = 0; i < first.length; i++) {
            const windowStart = Math.max(0, i - matchWindow)
            const windowEnd = Math.min(second.length, i + matchWindow + 1)

            for (let j = windowStart; j < windowEnd; j++) {
                if (!secondMatched[j] && first[i] === second[j]) {
                    firstMatched[i] = secondMatched[j] = true;
                    matchCount++;
                    break
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

        const A = matchCount / first.length
        const B = matchCount / second.length
        const C = (matchCount - transpositions) / matchCount

        const jaro = (A + B + C) / 3

        // check how many chars match at the beginning of the string and apply a slight bias favoring it
        let commonPrefix = 0;
        for (let i = 0; i < Math.min(4, first.length, second.length); i++) {
            if (first[i] === second[i]) {
                commonPrefix++;
            }
            else {
                break;
            }
        }

        return jaro + (commonPrefix * 0.1) * (1 - jaro)
    }

    static scoreResults(results, titles, wantedEpisode, wantedPart = 1) {
        const variants = API.getTitleVariants(titles)

        const hasEpisode = wantedEpisode != null
        let wantedSeason = Parser.findWantedSeason(titles) ?? 1

        for (let index in results) {
            let result = results[index]
            const { episode, season } = Parser.parseEpisodeSeason(result.name)

            const episodeMismatch = hasEpisode && episode !== wantedEpisode

            const seasonMismatch = wantedSeason > 1 ? season !== wantedSeason : season != null && season !== 1

            const partMismatch = Parser.parsePart(Parser.extractReleaseTitle(result.name)) !== wantedPart

            if (episodeMismatch || seasonMismatch || partMismatch) {
                results[index].accScore = 0;
                continue;
            }

            let fullTitleScore = 0
            let strippedTitleScore = 0
            let contained = false;
            for (let { title, isPrimary } of variants) {
                let scoreData = this.scoreResult(title, result.name)
                if (scoreData.sequel) continue;
                if (scoreData.contained) contained = scoreData.contained

                if(isPrimary) {
                    fullTitleScore = Math.max(fullTitleScore, scoreData.JWScore)
                }
                else {
                    strippedTitleScore = Math.max(strippedTitleScore, scoreData.JWScore)
                }
            }

            const strippedScoreWeight = 0.5
            const containedScore = contained ? 1.5 : 0

            const finalScore = fullTitleScore + containedScore + (strippedTitleScore * strippedScoreWeight)

            results[index].accScore = finalScore
        }

        return results
    }

    static scoreResult(variant, name) {

        let JWScore = 0;
        let contained = false;
        let sequel = false;

        const releaseTitle = Parser.extractReleaseTitle(name)
        const compactVariant = Parser.compact(variant)
        const compactRelease = Parser.compact(releaseTitle)

        if (!compactVariant || !compactRelease) return { JWScore, contained, sequel };

        const variantPhrase = ` ${Parser.spaced(variant)} `
        const releasePhrase = ` ${Parser.spaced(releaseTitle)} `

        const fullMatchIndex = releasePhrase.indexOf(variantPhrase)
        if (fullMatchIndex >= 0 && releasePhrase !== variantPhrase) {
            const extra = releasePhrase.slice(fullMatchIndex + variantPhrase.length).trim()

            sequel = /^(?:\d{1,2}|i{1,3}|iv|v|vi{1,3}|ix|x)\b/i.test(extra)
            if (sequel) return { JWScore, contained, sequel }
        }


        contained =
            Math.min(compactVariant.length, compactRelease.length) >= 6 &&
            (releasePhrase.includes(variantPhrase) || variantPhrase.includes(releasePhrase))

        JWScore = this.jaroWinkler(compactVariant, compactRelease)

        return { JWScore, contained, sequel }
    }
}

export default Scoring;