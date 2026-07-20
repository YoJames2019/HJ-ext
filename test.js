class Test {

    buildSearchQuery(title, episode, strict = false) {
        let parsedTitle = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s\p{P}\p{S}]/gu, ' ').trim();
        let parsedEpisode = episode.toString().padStart(2, '0');

        let res = this.stripSeason(parsedTitle)
        let seasonNumber = res.seasonNumber
        let finalTitle = res.strippedTitle

        let query;

        if (strict) {
            query = `"${finalTitle} ${seasonNumber ? `Season ${seasonNumber} ` : ""}- ${parsedEpisode}"`;
        }
        else {
            let combos = this.genSeasonTitleEpisodeCombinations(finalTitle, seasonNumber, parsedEpisode)

            query = combos.map(r => `"${r}"`).join("|")
        }

        return query;
    }

    genSeasonTitleEpisodeCombinations(titles, seasonNumber, episode) {

        if (!Array.isArray(titles)) titles = [titles]

        let seasonVariations = ["{num}{suffix} Season {sep}", "S{num}{sep}", "Season {num} {sep}", "{num} {sep}"]
        let episodeSeparators = ["E", " - "]

        let processTitles = []

        let finalCombos = []
        let seasonCombos = []

        if (!seasonNumber) seasonNumber = 1

        const cleanTitleRegex = /[^a-zA-Z0-9 -,']/g

        for(let title of titles) {
            processTitles.push(title)

            if(cleanTitleRegex.test(title)) {
                if(title.includes(":")) {
                    title = title.split(":")[0]
                }

                titles.push(title.replace(cleanTitleRegex, ''))
            }
        }

        for (let title of processTitles) {
            for (let variationTemplate of seasonVariations) {
                let variationStr = variationTemplate.replace("{num}", seasonNumber).replace("{suffix}", this.getSuffix(seasonNumber))
                let str = `${title} ${variationStr}`
                seasonCombos.push(str)
            }

            if (seasonNumber === 1) {
                seasonCombos.push(`${title} {sep}`)
            }
        }

        for (let separator of episodeSeparators) {
            for (let comboIndex in seasonCombos) {
                finalCombos.push(`${seasonCombos[comboIndex].replace("{sep}", separator)}${String(episode).padStart(2, "0")} `.replace(/[ ]{2,}/g, " "))
            }
        }


        return finalCombos
    }

    getSuffix(input) {
        switch (input) {
            case 1:
                return "st"
            case 2:
                return "nd"
            case 3:
                return "rd"
            default:
                if (input > 0) {
                    return "th"
                }
                return ""
        }
    }

    stripSeason(input) {
        let seasonRegexes = [/Season\s+(\d+)/i, /(\d+)(?:st|nd|rd|th)\s*Season/i]

        let seasonNumber = null;
        let strippedTitle = input;

        for (let regex of seasonRegexes) {
            let match = input.match(regex)

            if (match) {
                seasonNumber = match[1]
                strippedTitle = input.replace(regex, "").trim()
                break
            }
        }

        let romanSeasonRegexes = [/Season ([IV]+)$/, /([IV]+)$/]
        if (!seasonNumber) {
            for (let regex of romanSeasonRegexes) {
                let match = input.match(regex)

                if (match) {
                    seasonNumber = this.numeralsToNumbers(match[1])
                    strippedTitle = input.replace(regex, "").trim()
                }
            }
        }

        return {
            seasonText: seasonNumber ? `S${seasonNumber}` : "",
            seasonNumber: seasonNumber ? Number(seasonNumber) : seasonNumber,
            strippedTitle
        };
    }

    numeralsToNumbers(numeral) {
        let map = {
            "I": 1,
            "II": 2,
            "III": 3,
            "IV": 4,
            "V": 5
        }

        let number = map[numeral]

        return number
    }
}




const tester = new Test()

// let res = tester.genSeasonTitleEpisodeCombinations(["Buchigire Reijou wa Houfuku wo Chikaimashita.: Madousho no Chikara de Sokoku wo Tataki Tsubushimasu"], null, 3)


// res.sort().forEach(t => console.log(t))

console.log(tester.buildSearchQuery("Buchigire Reijou wa Houfuku wo Chikaimashita.: Madousho no Chikara de Sokoku wo Tataki Tsubushimasu", 3))